process.env.CRM_SHEET_SYNC = "0"; // test servers never call Google
process.env.CRM_PUSH = "0";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const Leads = require("../leads");
const Map_ = require("../integrations/sheet-mapping");
const G = require("../integrations/google-sheets");
const Capi = require("../integrations/capi");
const { createStorage } = require("../storage");
const { createIntegrationStore } = require("../integrations/store");
const { createSheetFeedback } = require("../integrations/sheet-feedback");
const { createIntegrations, normalizeIntegrationSettings } = require("../integrations");

const SSID = Map_.DEFAULT_CONNECTION.spreadsheetId;
const FORM = Map_.DEFAULT_CONNECTION.formId;
const HEADERS = ["id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "form_id", "form_name", "is_organic", "platform", "full_name", "phone_number", "lead_status"];
const STATUS_COL = HEADERS.indexOf("lead_status");
const row = (id, { name = "Salma Bennani", phone = "p:+212600000001", status = "CREATED", form = FORM } = {}) => [`l:${id}`, "2026-11-17T11:43:31-05:00", "", "", "", "", "", "", `f:${form}`, "CMCG First Form-copy", "false", "fb", name, phone, status];
const opts = { leadHadRdv: Leads.leadHadRdv };
const cfgBase = Map_.normalizeSheetFeedbackSettings({});

function emptyState() {
  return { meta: {}, settings: { leadDistribution: Leads.normalizeDistribution({ mode: "manual" }) }, crmLeads: [], agents: [], adSets: [], campaigns: [], creatives: [], outcomes: [] };
}
function formLead(id, extra = {}) {
  return { id: `lea_${id}`, source: "form", externalId: String(id), name: `Lead ${id}`, phone: `2126000${String(id).padStart(5, "0")}`, meta: { formId: FORM }, intake: { channel: "meta_instant_form", spreadsheetId: SSID, sheetName: "Sheet1" }, status: "new", statusAt: "2026-11-17T10:00:00.000Z", createdAt: "2026-11-17T10:00:00.000Z", history: [], callAttempts: 0, ...extra };
}
const colIndex = (letters) => letters.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

// In-memory Google Sheet with scriptable failures.
function fakeSheet(values) {
  const calls = { reads: 0, writes: [], fail: [] };
  const take = (op) => {
    const index = calls.fail.findIndex((item) => item.op === op || item.op === "*");
    if (index >= 0) { const [item] = calls.fail.splice(index, 1); throw item.error; }
  };
  return {
    calls, values, email: "cmcg-crm@project.iam.gserviceaccount.com",
    getSpreadsheet: async () => { take("meta"); return { properties: { title: "cmcg new leads" }, sheets: [{ properties: { title: "Sheet1" } }] }; },
    getValues: async (_id, range) => {
      take("read");
      calls.reads += 1;
      const one = range.match(/!A(\d+):([A-Z]+)(\d+)$/);
      if (one) return [(values[Number(one[1]) - 1] || []).slice(0, colIndex(one[2]) + 1)];
      return values.map((item) => [...item]);
    },
    updateCell: async (_id, range, value) => {
      take("write");
      const match = range.match(/!([A-Z]+)(\d+)$/);
      values[Number(match[2]) - 1][colIndex(match[1])] = value;
      calls.writes.push({ range, value });
      return {};
    },
  };
}

async function setup(t, { leads = [], rows = [], settings = {}, confirm = ["intake", "qualified", "converted", "lost", "not_qualified"], env } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-sheet-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const storage = createStorage({ dataFile: path.join(dir, "crm.json"), createEmptyState: emptyState, normalizeState: (s) => s });
  await storage.init();
  const state = emptyState();
  state.crmLeads = leads;
  await storage.write(state);
  let tail = Promise.resolve();
  const lock = async () => { const prev = tail; let release; tail = new Promise((r) => { release = r; }); await prev; return release; };
  const store = createIntegrationStore(storage);
  await store.init();
  const sheet = fakeSheet([HEADERS, ...rows]);
  const make = () => createSheetFeedback({ storage, lock, store, Leads, env: env || { GOOGLE_SERVICE_ACCOUNT_EMAIL: sheet.email, GOOGLE_PRIVATE_KEY: "test-key" }, clientFactory: () => sheet, log: { error() {} } });
  const feedback = make();
  await feedback.saveSettings({ enabled: true, since: "2026-01-01", minStageIntervalMinutes: 0, ...settings });
  for (const stage of confirm) await feedback.confirmStage({ stage, confirmed: true, note: "test", by: "tester" });
  const mutate = async (fn) => { const release = await lock(); try { const s = await storage.read(); await fn(s); await storage.write(s); } finally { release(); } };
  const agent = async (leadId, body) => mutate((s) => Leads.updateLead(s, s.crmLeads.find((l) => l.id === leadId), body, "agent"));
  const makeDue = async () => { for (const job of await store.listSheetJobs({ limit: 500 })) if (["pending", "retry"].includes(job.status)) await store.updateSheetJob(job.id, { next_attempt_at: new Date(Date.now() - 1000).toISOString() }); };
  const cell = (n) => sheet.values[n][STATUS_COL];
  const jobs = async (leadId) => store.listSheetJobs({ leadId, limit: 50 });
  return { storage, store, sheet, feedback, make, mutate, agent, makeDue, cell, jobs, lock };
}

// ---------------- Pure mapping ----------------
test("mapping: CRM journeys produce the right Meta stage", () => {
  const visited = { status: "visited", bookedAt: "2026-11-01T10:00:00Z", visitedAt: "2026-11-02T10:00:00Z", statusAt: "2026-11-02T10:00:00Z" };
  assert.equal(Map_.desiredStage({ status: "new" }, opts), null, "new lead: no write");
  for (const status of ["no_answer", "callback", "contacted"]) assert.equal(Map_.desiredStage({ status, statusAt: "x" }, opts), null, status);
  assert.equal(Map_.desiredStage({ status: "booked", bookedAt: "2026-11-01T10:00:00Z" }, opts).stage, "intake", "RDV booked without visit");
  assert.equal(Map_.desiredStage(visited, opts).stage, "qualified", "visit produces Qualified");
  assert.equal(Map_.desiredStage({ ...visited, status: "contacted", statusAt: "2026-11-03T10:00:00Z" }, opts).stage, "qualified", "visit then thinking stays Qualified");
  assert.equal(Map_.desiredStage({ ...visited, status: "registered", registeredAt: "2026-11-02T10:20:00Z" }, opts).stage, "converted", "visit then paid");
  assert.equal(Map_.desiredStage({ status: "registered", registeredAt: "2026-11-02T10:20:00Z", bookedAt: "2026-11-02T10:20:00Z" }, opts).stage, "converted", "paid without visit");
  assert.equal(Map_.desiredStage({ status: "not_interested", statusAt: "2026-11-04T10:00:00Z" }, opts).stage, "lost", "definitive rejection");
  assert.equal(Map_.desiredStage({ status: "wrong_number", statusAt: "2026-11-04T10:00:00Z" }, opts).stage, "not_qualified");
  assert.equal(Map_.desiredStage({ status: "other_city", statusAt: "2026-11-04T10:00:00Z" }, opts).stage, "not_qualified");
  assert.equal(Map_.desiredStage({ ...visited, status: "other_city", statusAt: "2026-11-04T10:00:00Z" }, opts).stage, "lost", "a visitor closed as unsuitable is Lost");
  assert.equal(Map_.desiredStage({ ...visited, status: "registered", registeredAt: "2026-11-02T10:20:00Z" }, opts).stage, "converted");
  // RDV cancelled before its time: not an intake any more. No-show (after the time): keeps intake, never Qualified.
  assert.equal(Map_.desiredStage({ status: "callback", bookedAt: "2026-11-01T10:00:00Z", appointmentAt: "2026-11-05T15:00", statusAt: "2026-11-02T10:00:00Z" }, opts), null, "cancelled before the RDV");
  assert.equal(Map_.desiredStage({ status: "callback", bookedAt: "2026-11-01T10:00:00Z", appointmentAt: "2026-11-05T15:00", statusAt: "2026-11-06T10:00:00Z" }, opts).stage, "intake", "no-show stays an active intake, not Qualified");
  // Paid then reclassified: never leaves Converted automatically.
  assert.equal(Map_.desiredStage({ status: "not_interested", registeredAt: "2026-11-02T10:00:00Z", statusAt: "2026-11-09T10:00:00Z" }, opts).stage, "converted");
});

test("mapping: eligibility keeps manual, WhatsApp, other-form and old-sheet leads out", () => {
  assert.equal(Map_.eligibility(formLead(1), cfgBase).eligible, true);
  assert.match(Map_.eligibility(formLead(2, { externalId: "" }), cfgBase).reason, /Missing Meta lead id/);
  assert.match(Map_.eligibility(formLead(3, { source: "whatsapp" }), cfgBase).reason, /WhatsApp/);
  assert.match(Map_.eligibility(formLead(4, { manual: true }), cfgBase).reason, /by hand/);
  assert.match(Map_.eligibility(formLead(5, { meta: { formId: "999" } }), cfgBase).reason, /Different Instant Form/);
  assert.match(Map_.eligibility(formLead(6, { intake: { spreadsheetId: Map_.LEGACY.spreadsheetIds[0] } }), cfgBase).reason, /connected spreadsheet/);
  assert.match(Map_.eligibility(formLead(7, { intake: undefined }), cfgBase).reason, /connected spreadsheet/);
  assert.match(Map_.eligibility(formLead(8, { demo: true }), cfgBase).reason, /test/);
});

test("mapping: transitions never regress and never overwrite unknown values", () => {
  const T = Map_.decideTransition;
  assert.equal(T("created", "qualified").action, "write");
  assert.equal(T("qualified", "qualified").action, "noop");
  assert.equal(T("converted", "qualified").action, "skip");
  assert.equal(T("converted", "lost").action, "skip");
  assert.equal(T("qualified", "intake").action, "skip");
  assert.equal(T("qualified", "not_qualified").action, "skip");
  assert.equal(T("lost", "qualified").action, "write", "a lost lead that comes back and visits");
  assert.equal(T("unknown", "qualified").action, "skip");
  assert.equal(T("converted", "qualified", { correction: true }).action, "write", "authorized correction");
  assert.equal(T("created", "INVALID").action, "skip", "invalid target stage");
  assert.equal(Map_.parseSheetValue("CREATED", cfgBase), "created");
  assert.equal(Map_.parseSheetValue("QUALIFIED", cfgBase), "qualified", "case-insensitive");
  assert.equal(Map_.parseSheetValue("Interested", cfgBase), "unknown");
});

test("mapping: settings reject the old integration and reset confirmation on value change", () => {
  assert.ok(Map_.connectionErrors(Map_.normalizeSheetFeedbackSettings({ spreadsheetId: Map_.LEGACY.spreadsheetIds[0] })).length);
  assert.ok(Map_.connectionErrors(Map_.normalizeSheetFeedbackSettings({ datasetId: "2406568106815480" })).length);
  assert.equal(Map_.connectionErrors(cfgBase).length, 0);
  const s = Map_.normalizeSheetFeedbackSettings({ stages: { qualified: { value: "", confirmed: true } } });
  assert.equal(s.stages.qualified.value, "Qualified");
  assert.equal(cfgBase.stages.qualified.confirmed, false, "nothing is verified by default");
  assert.equal(cfgBase.enabled, false, "off by default");
  // Integration settings keep the sheet feedback block.
  assert.equal(normalizeIntegrationSettings({}).sheetFeedback.spreadsheetId, SSID);
});

// ---------------- Google client ----------------
test("google client: signs a service-account JWT, writes RAW to one cell, classifies errors", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "crm@p.iam.gserviceaccount.com", private_key: privateKey }) };
  const creds = G.credentialsFromEnv(env);
  assert.equal(creds.email, "crm@p.iam.gserviceaccount.com");
  assert.equal(G.credentialsFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON).toString("base64") }).email, creds.email, "base64 JSON");
  assert.equal(G.credentialsFromEnv({}), null);
  assert.match(G.credentialsFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{bad" }).error, /Could not read/);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("oauth2")) {
      const assertion = decodeURIComponent(init.body.split("assertion=")[1]);
      const [h, c, sig] = assertion.split(".");
      const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
      assert.ok(ok, "JWT signature verifies");
      const claims = JSON.parse(Buffer.from(c, "base64").toString());
      assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets");
      return { ok: true, status: 200, text: async () => '{"access_token":"tok","expires_in":3600}' };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const client = G.createSheetsClient({ credentials: creds, fetchImpl });
  await client.updateCell(SSID, "'Sheet1'!O5", "=HYPERLINK(\"x\")");
  await client.updateCell(SSID, "'Sheet1'!O6", "Qualified");
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1, "token cached");
  const put = calls.find((c) => c.init.method === "PUT");
  assert.match(put.url, /valueInputOption=RAW/, "RAW: values are never formulas");
  assert.deepEqual(JSON.parse(put.init.body).values, [["=HYPERLINK(\"x\")"]]);
  assert.equal(put.init.headers.Authorization, "Bearer tok");
  assert.equal(G.classify(429, {}).kind, "rate_limit");
  assert.equal(G.classify(403, { error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }).kind, "rate_limit");
  assert.equal(G.classify(403, { error: { message: "The caller does not have permission" } }).kind, "permission");
  assert.equal(G.classify(503, {}).kind, "transient");
  assert.equal(G.classify(404, {}).kind, "not_found");
  assert.equal(G.classify(400, { error: "invalid_grant" }).kind, "auth");
  assert.equal(G.columnLetter(0), "A"); assert.equal(G.columnLetter(16), "Q"); assert.equal(G.columnLetter(27), "AB");
  const columns = G.findColumns(["lead_status", "x", "ID"]);
  assert.deepEqual([columns.idCol, columns.statusCol], [2, 0], "columns found by header, not position");
});

// ---------------- Service: end-to-end with a fake sheet ----------------
test("new lead import keeps the Meta lead id, form id, spreadsheet and tab", async (t) => {
  const ctx = await setup(t, { rows: [row("2001", { name: "Yassine Amrani", phone: "p:+212612345678" }), [`l:1696475935329496`, "", "", "", "", "", "", "", `f:${FORM}`, "x", "true", "", "<test lead: dummy data for full_name>", "p:<test lead: dummy data for phone_number>", "QUALIFIED"]] });
  const result = await ctx.feedback.importLeads();
  assert.equal(result.added, 1, "the Meta test lead is not imported");
  const [lead] = (await ctx.storage.read()).crmLeads;
  assert.equal(lead.externalId, "2001");
  assert.equal(lead.meta.formId, FORM);
  assert.equal(lead.source, "form");
  assert.equal(lead.intake.spreadsheetId, SSID);
  assert.equal(lead.intake.sheetName, "Sheet1");
  assert.ok(lead.importedAt && lead.id.startsWith("lea_"));
  assert.equal(Map_.eligibility(lead, ctx.feedback.settingsOf(await ctx.storage.read())).eligible, true);
  assert.equal((await ctx.feedback.importLeads()).added, 0, "re-import does not duplicate");
  assert.equal((await ctx.storage.read()).crmLeads.length, 1);
});

test("Scenario A + B + G: RDV, visit, thinking, then paid; nothing downgraded, both milestones written in order", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3001)], rows: [row("3001")], settings: { minStageIntervalMinutes: 15 } });
  await ctx.agent("lea_3001", { appointmentAt: "2026-11-20T15:00" });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Intake", "RDV booked -> Intake, never Qualified");
  await ctx.agent("lea_3001", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Intake", "waits so Meta can see the previous stage");
  const waiting = (await ctx.jobs("lea_3001")).find((job) => job.stage === "qualified");
  assert.equal(waiting.status, "pending");
  assert.ok(Date.parse(waiting.next_attempt_at) > Date.now() + 14 * 60000, "deferred by the stage interval");
  // Simulate the interval passing.
  await ctx.feedback.saveSettings({ minStageIntervalMinutes: 0 });
  await ctx.makeDue();
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Qualified", "visit -> Qualified");
  await ctx.agent("lea_3001", { status: "contacted" }); // thinking
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Qualified", "visit then thinking stays Qualified");
  await ctx.agent("lea_3001", { status: "registered" });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Converted", "paid -> Converted");
  const written = ctx.sheet.calls.writes.map((w) => w.value);
  assert.deepEqual(written, ["Intake", "Qualified", "Converted"], "each milestone written once, in funnel order");
  assert.ok(ctx.sheet.calls.writes.every((w) => w.range === "'Sheet1'!O2"), "only the lead_status cell of that row");
  assert.deepEqual(ctx.sheet.values[1].slice(0, STATUS_COL), row("3001").slice(0, STATUS_COL), "Meta's data untouched");
});

test("Scenario C: an RDV without a visit never becomes Qualified", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3101)], rows: [row("3101")] });
  await ctx.agent("lea_3101", { appointmentAt: "2026-11-20T15:00" });
  await ctx.feedback.tick();
  await ctx.mutate((s) => { const lead = s.crmLeads[0]; lead.status = "no_answer"; lead.statusAt = "2026-11-21T10:00:00.000Z"; });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Intake");
  assert.ok(!ctx.sheet.calls.writes.some((w) => w.value === "Qualified"));
});

test("Scenario D + E: paid without a visit is Converted; a definitive refusal is Lost", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3201), formLead(3202), formLead(3203)], rows: [row("3201"), row("3202"), row("3203")] });
  await ctx.agent("lea_3201", { status: "registered" });
  await ctx.agent("lea_3202", { status: "not_interested", lostReason: "price" });
  await ctx.agent("lea_3203", { status: "wrong_number" });
  await ctx.feedback.tick();
  await ctx.makeDue();
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Converted");
  assert.equal(ctx.cell(2), "Lost");
  assert.equal(ctx.cell(3), "Not qualified");
});

test("missing Meta id, WhatsApp, manual and wrong-form leads never touch the sheet", async (t) => {
  const whatsapp = formLead(3301, { source: "whatsapp" });
  const manual = formLead(3302, { manual: true });
  const noId = formLead(3303, { externalId: "" });
  const otherForm = formLead(3304, { meta: { formId: "123456" } });
  const ctx = await setup(t, { leads: [whatsapp, manual, noId, otherForm], rows: [row("3301"), row("3302"), row("3304", { form: "123456" })] });
  for (const id of ["lea_3301", "lea_3302", "lea_3303", "lea_3304"]) await ctx.agent(id, { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 0);
  assert.equal((await ctx.store.listSheetJobs()).length, 0);
});

test("Scenario F: duplicate submissions are held until an admin picks the one that reports", async (t) => {
  const phone = "212611111111";
  const ctx = await setup(t, { leads: [formLead(3401, { phone }), formLead(3402, { phone })], rows: [row("3401"), row("3402")] });
  await ctx.agent("lea_3401", { status: "visited" });
  await ctx.agent("lea_3402", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 0, "ambiguous: nothing written");
  assert.ok((await ctx.store.listSheetJobs()).some((job) => job.status === "held"));
  // Only one of the two reached a stage -> not ambiguous.
  assert.equal(Map_.duplicateFlags([formLead(1, { phone }), formLead(2, { phone, status: "visited", visitedAt: "2026-11-17T12:00:00Z", statusAt: "2026-11-17T12:00:00Z" })], cfgBase, opts).size, 0);
  await ctx.feedback.saveSettings({ duplicates: { lea_3402: "skip" } });
  await ctx.makeDue();
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Qualified", "the kept submission reports");
  assert.equal(ctx.cell(2), "CREATED", "the duplicate does not");
});

test("duplicate and concurrent CRM updates produce a single write", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3501)], rows: [row("3501")] });
  await ctx.agent("lea_3501", { status: "visited" });
  await ctx.agent("lea_3501", { status: "visited" }); // same status tapped twice
  await Promise.all([ctx.feedback.reconcile(), ctx.feedback.reconcile(), ctx.feedback.reconcile()]);
  const jobs = await ctx.jobs("lea_3501");
  assert.equal(jobs.filter((job) => job.stage === "qualified").length, 1, "idempotent job id");
  await Promise.all([ctx.feedback.tick(), ctx.feedback.tick()]);
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 1);
  // A second instance (two agents saving at once / a restart) cannot duplicate either.
  await ctx.make().tick();
  assert.equal(ctx.sheet.calls.writes.length, 1);
});

test("a status changed between queueing and writing is re-evaluated (no stale write)", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3601)], rows: [row("3601")] });
  await ctx.agent("lea_3601", { appointmentAt: "2026-11-20T15:00" });
  await ctx.feedback.reconcile();
  // Cancelled before the appointment, before the queue ran.
  await ctx.mutate((s) => { const lead = s.crmLeads[0]; lead.status = "callback"; lead.statusAt = new Date().toISOString(); lead.appointmentAt = "2026-11-20T15:00"; });
  await ctx.feedback.processDue();
  assert.equal(ctx.sheet.calls.writes.length, 0);
  assert.equal((await ctx.jobs("lea_3601"))[0].status, "superseded");
});

test("permission error pauses the queue; retry recovers", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3701)], rows: [row("3701")] });
  await ctx.agent("lea_3701", { status: "visited" });
  ctx.sheet.calls.fail.push({ op: "write", error: new G.SheetsError("permission", "No access to the spreadsheet: caller does not have permission", { status: 403 }) });
  await ctx.feedback.tick();
  let status = await ctx.feedback.status(await ctx.storage.read());
  assert.equal(status.health, "paused");
  assert.match(status.paused, /permission/);
  assert.equal(status.counts.failed, 1, "failure visible");
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 0, "paused queue does nothing");
  assert.equal(await ctx.feedback.retryFailed(), 1);
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Qualified");
  status = await ctx.feedback.status(await ctx.storage.read());
  assert.equal(status.health, "ok");
  assert.equal(status.counts.qualifiedUpdated, 1);
});

test("rate limit and temporary Google outage retry with backoff, then succeed", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3801), formLead(3802)], rows: [row("3801"), row("3802")] });
  await ctx.agent("lea_3801", { status: "visited" });
  await ctx.agent("lea_3802", { status: "registered" });
  ctx.sheet.calls.fail.push({ op: "read", error: new G.SheetsError("rate_limit", "Google rate limit", { status: 429, retryAfterMs: 30000 }) });
  await ctx.feedback.tick();
  let jobs = await ctx.store.listSheetJobs();
  const retrying = jobs.filter((job) => job.status === "retry");
  assert.ok(retrying.length >= 1, "rate-limited job is retried");
  assert.ok(Date.parse(retrying[0].next_attempt_at) > Date.now() + 25000, "Retry-After respected");
  assert.equal(ctx.sheet.calls.writes.length, 0);
  await ctx.makeDue();
  ctx.sheet.calls.fail.push({ op: "write", error: new G.SheetsError("transient", "Google unavailable: HTTP 503", { status: 503 }) });
  await ctx.feedback.tick();
  await ctx.makeDue();
  await ctx.feedback.tick();
  await ctx.makeDue();
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Qualified");
  assert.equal(ctx.cell(2), "Converted");
  jobs = await ctx.store.listSheetJobs({ status: "updated" });
  assert.ok(jobs.some((job) => job.attempts > 1), "recovered after attempts");
});

test("network errors stop after 6 attempts and stay visible as failed", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3851)], rows: [row("3851")] });
  await ctx.agent("lea_3851", { status: "visited" });
  for (let i = 0; i < 6; i += 1) {
    ctx.sheet.calls.fail.push({ op: "write", error: new Error("socket hang up") });
    await ctx.makeDue();
    await ctx.feedback.tick();
  }
  const [job] = await ctx.jobs("lea_3851");
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 6);
  assert.match((await ctx.feedback.status(await ctx.storage.read())).lastError.message, /socket hang up/);
});

test("unverified stage values are never written; confirming releases them", async (t) => {
  const ctx = await setup(t, { leads: [formLead(3901)], rows: [row("3901")], confirm: [] });
  await ctx.agent("lea_3901", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 0);
  assert.equal((await ctx.jobs("lea_3901"))[0].status, "blocked");
  // Changing the spelling after confirming resets the confirmation.
  await ctx.feedback.confirmStage({ stage: "qualified", confirmed: true, note: "seen", by: "admin" });
  await ctx.feedback.saveSettings({ stages: { qualified: { value: "QUALIFIED" } } });
  assert.equal(ctx.feedback.settingsOf(await ctx.storage.read()).stages.qualified.confirmed, false);
  const res = await ctx.feedback.confirmStage({ stage: "qualified", confirmed: true, note: "seen in Events Manager", by: "admin" });
  assert.equal(res.unblocked, 0, "already released by the first confirmation");
  await ctx.makeDue();
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "QUALIFIED", "the confirmed spelling is written");
});

test("a value typed by hand in the sheet is never overwritten", async (t) => {
  const ctx = await setup(t, { leads: [formLead(4001)], rows: [row("4001", { status: "Interested" })] });
  await ctx.agent("lea_4001", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Interested");
  assert.equal((await ctx.jobs("lea_4001"))[0].status, "skipped");
});

test("moved rows are found again by Meta lead id; deleted rows fail visibly", async (t) => {
  const ctx = await setup(t, { leads: [formLead(4101), formLead(4102)], rows: [row("4100"), row("4101"), row("4102")] });
  // Someone sorted the sheet: rows moved.
  ctx.sheet.values.splice(1, 3, row("4102"), row("4100"), row("4101"));
  await ctx.agent("lea_4101", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.values[3][STATUS_COL], "Qualified", "found at its new row");
  assert.equal(ctx.sheet.values[2][STATUS_COL], "CREATED", "neighbour untouched");
  // Deleted row: retried, then failed after 6 attempts.
  ctx.sheet.values.splice(1, 1);
  await ctx.agent("lea_4102", { status: "visited" });
  for (let i = 0; i < 6; i += 1) { await ctx.makeDue(); await ctx.feedback.tick(); }
  const [job] = await ctx.jobs("lea_4102");
  assert.equal(job.status, "failed");
  assert.match(job.last_error, /not found/);
});

test("regression prevention and authorized correction", async (t) => {
  const ctx = await setup(t, { leads: [formLead(4201)], rows: [row("4201", { status: "Converted" })] });
  await ctx.agent("lea_4201", { status: "visited" });
  await ctx.feedback.tick();
  assert.equal(ctx.cell(1), "Converted", "never moved back from Converted");
  assert.match((await ctx.jobs("lea_4201"))[0].last_error, /Regression prevented/);
  await assert.rejects(ctx.feedback.correct({ leadId: "lea_4201", stage: "qualified", by: "admin" }), /reason/);
  await ctx.feedback.correct({ leadId: "lea_4201", stage: "qualified", by: "admin", reason: "registration entered by mistake" });
  await ctx.feedback.processDue();
  assert.equal(ctx.cell(1), "Qualified", "explicit admin correction");
});

test("no automatic historical sync; dry run then explicit approval", async (t) => {
  const old = formLead(4301, { status: "visited", visitedAt: "2026-10-01T10:00:00.000Z", statusAt: "2026-10-01T10:00:00.000Z", bookedAt: "2026-09-30T10:00:00.000Z" });
  const noId = formLead(4302, { externalId: "" });
  const ctx = await setup(t, { leads: [old, noId], rows: [row("4301")], settings: { since: "2026-11-01" } });
  await ctx.feedback.tick();
  assert.equal(ctx.sheet.calls.writes.length, 0, "old milestones are not sent automatically");
  const plan = await ctx.feedback.backfillPlan();
  assert.equal(plan.matching, 1);
  assert.equal(plan.missingMetaId, 1);
  assert.equal(plan.eligibleUpdates, 1);
  assert.equal(plan.notInSheet, 0);
  assert.equal(ctx.sheet.calls.writes.length, 0, "dry run writes nothing");
  await assert.rejects(ctx.feedback.backfillApply({ planId: "wrong" }), /dry run again/);
  assert.equal((await ctx.feedback.backfillApply({ planId: plan.planId, by: "admin" })).queued, 1);
  await ctx.feedback.processDue();
  assert.equal(ctx.cell(1), "Qualified");
  assert.equal((await ctx.feedback.backfillPlan()).eligibleUpdates, 0, "not offered twice");
});

test("old integration stays isolated and the direct CAPI sender does not double-report", async (t) => {
  const ctx = await setup(t, { leads: [], rows: [] });
  await assert.rejects(ctx.feedback.saveSettings({ spreadsheetId: Map_.LEGACY.spreadsheetIds[0] }), /old/);
  await assert.rejects(ctx.feedback.saveSettings({ datasetId: "2406568106815480" }), /old integration/);
  // Direct CAPI: an eligible new-form lead is left to the sheet; an old-form lead still goes direct.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-sheet-capi-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const storage = createStorage({ dataFile: path.join(dir, "crm.json"), createEmptyState: emptyState, normalizeState: (s) => s });
  await storage.init();
  const recent = new Date(Date.now() - 3600000).toISOString();
  const state = emptyState();
  state.crmLeads = [formLead(4401, { status: "booked", bookedAt: recent }), formLead(4402, { status: "booked", bookedAt: recent, meta: { formId: "555" }, intake: { spreadsheetId: Map_.LEGACY.spreadsheetIds[0] } })];
  state.settings.integrations = { capi: { enabled: true, mode: "test" }, sheetFeedback: { enabled: true } };
  await storage.write(state);
  const service = createIntegrations({ storage, lock: async () => () => {}, Leads, helpers: {}, env: { META_DATASET_ID: "1118216094383015", META_ACCESS_TOKEN: "tok", META_TEST_EVENT_CODE: "T" }, fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"events_received":1}' }), log: { error() {} } });
  await service.init();
  await service.reconcileCapi();
  const events = await service.store.listEvents();
  assert.deepEqual(events.map((e) => e.lead_id), ["lea_4402"], "the sheet-fed lead is not also sent directly");
  assert.ok(Capi.eventsForLead(state.crmLeads[0], { settings: Capi.normalizeCapiSettings({ enabled: true }), leadHadRdv: Leads.leadHadRdv }).length, "it would have been sent without the feedback");
});

test("queue survives a restart and recovers pending work", async (t) => {
  const ctx = await setup(t, { leads: [formLead(4501)], rows: [row("4501")] });
  await ctx.agent("lea_4501", { status: "visited" });
  ctx.sheet.calls.fail.push({ op: "read", error: new G.SheetsError("transient", "Google unavailable", { status: 503 }) });
  await ctx.feedback.tick();
  assert.equal((await ctx.jobs("lea_4501"))[0].status, "retry");
  const restarted = ctx.make(); // new process, same tables
  await ctx.makeDue();
  await restarted.tick();
  assert.equal(ctx.cell(1), "Qualified");
});

test("test connection and dry-run matching never write", async (t) => {
  const ctx = await setup(t, { leads: [formLead(4601)], rows: [row("4601")] });
  await ctx.agent("lea_4601", { status: "visited" });
  const conn = await ctx.feedback.testConnection();
  assert.equal(conn.ok, true, JSON.stringify(conn.checks));
  assert.equal(conn.statusColumn, "O");
  const match = await ctx.feedback.testMatch({ metaLeadId: "l:4601" });
  assert.equal(match.eligible, true);
  assert.equal(match.desired.stage, "qualified");
  assert.deepEqual(match.sheetRows, [2]);
  assert.equal(match.decision.action, "write");
  assert.equal(ctx.sheet.calls.writes.length, 0);
  const preview = ctx.feedback.previewMapping(await ctx.storage.read());
  assert.equal(preview.rows.find((r) => r.status === "visited").stage, "qualified");
  assert.equal(preview.eligibleByStage.qualified, 1);
  // No credentials: connection test says so instead of pretending.
  const none = await setup(t, { env: {} });
  const noCreds = await none.feedback.testConnection();
  assert.equal(noCreds.ok, false);
  assert.match(noCreds.checks[0].detail, /GOOGLE_SERVICE_ACCOUNT_JSON/);
});

test("verification write only touches a Meta test lead unless a real lead is chosen on purpose", async (t) => {
  const testRow = ["l:1696475935329496", "", "", "", "", "", "", "", `f:${FORM}`, "x", "true", "", "<test lead: dummy data for full_name>", "p:<test lead: dummy data for phone_number>", "CREATED"];
  const ctx = await setup(t, { rows: [testRow, row("4701")], confirm: [] });
  const res = await ctx.feedback.testWrite({ metaLeadId: "l:1696475935329496", stage: "qualified", by: "admin" });
  assert.equal(res.testLead, true);
  assert.equal(ctx.cell(1), "Qualified");
  assert.match(res.note, /does not prove Meta received/);
  await assert.rejects(ctx.feedback.testWrite({ metaLeadId: "4701", stage: "qualified" }), /real lead/);
  assert.equal(ctx.cell(2), "CREATED");
  assert.equal(ctx.feedback.settingsOf(await ctx.storage.read()).stages.qualified.confirmed, false, "a write is not a confirmation");
});

// ---------------- HTTP routes on the real server ----------------
function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
}
test("admin routes: status, settings and dry runs; sales login is refused", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-sheet-http-"));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: path.join(dir, "crm.json"), CRM_USER: "admin", CRM_PASSWORD: "secret-pass", CRM_SALES_USER: "souad", CRM_SALES_PASSWORD: "sales-pass", CRM_SALES_AGENT: "Souad", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "", GOOGLE_SERVICE_ACCOUNT_JSON: "", GOOGLE_SERVICE_ACCOUNT_EMAIL: "", GOOGLE_PRIVATE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timed out")), 8000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("CMCG CRM running")) { clearTimeout(timer); resolve(); } });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const admin = `Basic ${Buffer.from("admin:secret-pass").toString("base64")}`;
  const sales = `Basic ${Buffer.from("souad:sales-pass").toString("base64")}`;
  const call = async (route, { method = "GET", body, auth = admin } = {}) => {
    const response = await fetch(`${base}${route}`, { method, headers: { "Content-Type": "application/json", Authorization: auth }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const status = await call("/api/integrations/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.sheetFeedback.settings.spreadsheetId, SSID);
  assert.equal(status.body.sheetFeedback.health, "not_configured");
  assert.equal(status.body.env.GOOGLE_SERVICE_ACCOUNT, false);
  assert.equal((await call("/api/integrations/sheet-feedback/settings", { method: "POST", body: { spreadsheetId: Map_.LEGACY.spreadsheetIds[0] } })).status, 400, "old sheet refused");
  const saved = await call("/api/integrations/sheet-feedback/settings", { method: "POST", body: { importLeads: false } });
  assert.equal(saved.body.settings.importLeads, false);
  // Saving other integration settings keeps the sheet block.
  await call("/api/integrations/settings", { method: "POST", body: { ads: { everyHours: 6 } } });
  assert.equal((await call("/api/integrations/status")).body.sheetFeedback.settings.importLeads, false);
  assert.equal((await call("/api/integrations/sheet-feedback/preview")).status, 200);
  assert.equal((await call("/api/integrations/sheet-feedback/backfill-preview", { method: "POST", body: {} })).body.eligibleUpdates, 0);
  assert.equal((await call("/api/integrations/sheet-feedback/backfill-apply", { method: "POST", body: { planId: "x" } })).status, 400, "approval required");
  assert.equal((await call("/api/integrations/sheet-feedback/test-connection", { method: "POST", body: {} })).body.ok, false);
  assert.equal((await call("/api/integrations/sheet-feedback/history")).status, 200);
  assert.equal((await call("/api/integrations/sheet-feedback/preview", { auth: sales })).status, 403, "sales cannot see the integration");
  const stateRes = await call("/api/state");
  assert.ok(!JSON.stringify(stateRes.body).includes("PRIVATE KEY"), "no secret in state");
});
