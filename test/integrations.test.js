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
const Capi = require("../integrations/capi");
const Wa = require("../integrations/whatsapp");
const Ads = require("../integrations/ads-sync");
const { createStorage } = require("../storage");
const { createIntegrations } = require("../integrations");

const settings = Capi.normalizeCapiSettings({ enabled: true });
const base = { settings, value: 3000, currency: "MAD", leadHadRdv: Leads.leadHadRdv, now: Date.parse("2026-10-13T12:00:00Z") };

test("each lead type produces the right Conversions API event", () => {
  const form = { id: "l1", source: "form", externalId: "2368565583912478", name: "Yassine Amrani", phone: "212612345678", status: "booked", bookedAt: "2026-10-12T10:00:00Z" };
  const [rdv] = Capi.eventsForLead(form, base);
  assert.equal(rdv.channel, "crm_lead");
  assert.equal(rdv.payload.action_source, "system_generated");
  assert.equal(rdv.payload.event_name, "RDV");
  assert.equal(rdv.payload.user_data.lead_id, "2368565583912478");
  assert.equal(rdv.payload.custom_data.event_source, "crm");
  assert.equal(rdv.payload.custom_data.lead_event_source, "CMCG CRM");
  assert.equal(rdv.eventId, "cmcg-l1-booked");
  assert.deepEqual(Capi.eventsForLead(form, base).map((e) => e.eventId), ["cmcg-l1-booked"], "stable ids");

  const paid = Capi.eventsForLead({ ...form, status: "registered", registeredAt: "2026-10-13T09:00:00Z" }, base);
  assert.deepEqual(paid.map((e) => [e.stage, e.payload.event_name]), [["booked", "RDV"], ["registered", "Registered"]]);
  assert.deepEqual(paid[1].payload.custom_data.value, 3000);

  const ctwa = Capi.eventsForLead({ id: "w1", source: "whatsapp", ctwaClid: "ARAkLkA8", phone: "212600000001", status: "registered", registeredAt: "2026-10-13T09:00:00Z", bookedAt: "2026-10-12T09:00:00Z" }, { ...base, wabaId: "1234" });
  assert.equal(ctwa[1].payload.action_source, "business_messaging");
  assert.equal(ctwa[1].payload.messaging_channel, "whatsapp");
  assert.equal(ctwa[1].payload.user_data.ctwa_clid, "ARAkLkA8");
  assert.equal(ctwa[1].payload.event_name, "Purchase");
  assert.equal(ctwa[1].payload.custom_data.currency, "MAD");

  const offline = Capi.eventsForLead({ id: "w2", source: "whatsapp", name: "Sara Bennani", phone: "212600000002", status: "registered", registeredAt: "2026-09-01T09:00:00Z", bookedAt: "2026-08-30T09:00:00Z" }, base);
  // RDV (phone_call) is older than 7 days: dropped. Payment at the centre (physical_store) is kept up to 62 days.
  assert.deepEqual(offline.map((e) => [e.stage, e.payload.action_source]), [["registered", "physical_store"]]);
  assert.equal(offline[0].payload.user_data.ph[0], crypto.createHash("sha256").update("212600000002").digest("hex"));
  assert.equal(offline[0].payload.user_data.fn[0], crypto.createHash("sha256").update("sara").digest("hex"));
  assert.ok(!JSON.stringify(offline).includes("600000002"), "raw phone never leaves the CRM");

  assert.deepEqual(Capi.eventsForLead({ ...form, demo: true }, base), []);
  assert.deepEqual(Capi.eventsForLead({ ...form, name: "🧪 Test" }, base), []);
  assert.deepEqual(Capi.eventsForLead(form, { ...base, settings: { ...settings, since: "2026-10-13" } }), [], "before the start date");
  // An RDV cancelled before its appointment is not an RDV.
  assert.deepEqual(Capi.eventsForLead({ ...form, status: "not_interested", appointmentAt: "2026-10-20T15:00", statusAt: "2026-10-12T12:00:00Z" }, base), []);
});

test("delivery: test mode, success, retry and token errors", async () => {
  const config = { datasetId: "999", token: "tok", testCode: "TEST123", version: "v21.0" };
  const row = { payload: { event_name: "Purchase" }, mode: "test" };
  let seen = null;
  const ok = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, text: async () => '{"events_received":1}' }; };
  assert.equal((await Capi.deliver(row, config, ok)).status, "sent");
  assert.equal(seen.body.test_event_code, "TEST123");
  assert.match(seen.url, /\/v21\.0\/999\/events\?access_token=tok/);
  assert.equal((await Capi.deliver({ ...row, mode: "live" }, config, ok)).status, "sent");
  assert.equal(seen.body.test_event_code, undefined, "live never carries the test code");
  assert.equal((await Capi.deliver(row, { ...config, testCode: "" }, ok)).status, "failed", "test mode without a test code never sends");
  const fail = (status, error) => async () => ({ ok: false, status, text: async () => JSON.stringify({ error }) });
  assert.equal((await Capi.deliver(row, config, fail(500, { code: 2, message: "temp" }))).status, "retry");
  const token = await Capi.deliver(row, config, fail(400, { code: 190, message: "expired" }));
  assert.equal(token.status, "paused");
  assert.equal(token.pause, true);
  assert.equal((await Capi.deliver(row, config, fail(400, { code: 100, message: "bad param" }))).status, "failed");
  assert.equal((await Capi.deliver(row, config, async () => { throw new Error("offline"); })).status, "retry");
});

test("queue sends each event once and survives restarts", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-capi-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = new Date().toISOString();
  const state = { agents: [{ id: "souad", name: "souad" }], crmLeads: [
    { id: "l1", source: "form", externalId: "111", name: "A B", phone: "212600000001", status: "registered", bookedAt: now, registeredAt: now, statusAt: now, createdAt: now },
    { id: "l2", source: "form", externalId: "222", name: "Demo", phone: "212600000002", status: "registered", bookedAt: now, registeredAt: now, demo: true, createdAt: now },
  ], outcomes: [], campaigns: [], adSets: [], creatives: [], dailyLogs: [], adAccounts: [], settings: { profit: { revenuePerRegistered: 3000, revenueCurrency: "DH" }, integrations: { capi: { enabled: true, mode: "test" } } } };
  fs.writeFileSync(path.join(dir, "crm.json"), JSON.stringify(state));
  const storage = createStorage({ dataFile: path.join(dir, "crm.json"), createEmptyState: () => ({}), normalizeState: (s) => s });
  await storage.init();
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '{"events_received":1}' }; };
  let chain = Promise.resolve();
  const lock = () => { let release; const previous = chain; chain = new Promise((r) => { release = r; }); return previous.then(() => release); };
  const env = { META_DATASET_ID: "999", META_ACCESS_TOKEN: "tok", META_TEST_EVENT_CODE: "TEST1" };
  const service = createIntegrations({ storage, lock, Leads, helpers: {}, env, fetchImpl, log: { error() {} } });
  await service.init();
  await service.tickCapi();
  assert.deepEqual(sent.map((body) => body.data[0].event_id).sort(), ["cmcg-l1-booked", "cmcg-l1-registered"]);
  assert.ok(sent.every((body) => body.test_event_code === "TEST1"));
  assert.equal(sent.find((body) => body.data[0].event_name === "Registered").data[0].custom_data.currency, "MAD");
  await service.tickCapi();
  assert.equal(sent.length, 2, "never sent twice");
  const again = createIntegrations({ storage, lock, Leads, helpers: {}, env, fetchImpl, log: { error() {} } });
  await again.init();
  await again.tickCapi();
  assert.equal(sent.length, 2, "not resent after a restart");
  const events = await service.store.listEvents();
  assert.ok(events.every((row) => row.status === "sent" && row.mode === "test"));
});

test("webhook helpers: verification, signature and referral parsing", () => {
  const query = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "secret-verify", "hub.challenge": "12345" });
  assert.equal(Wa.verifyChallenge(query, "secret-verify"), "12345");
  assert.equal(Wa.verifyChallenge(query, "other-token-x"), null);
  const raw = Buffer.from('{"a":1}');
  const sig = `sha256=${crypto.createHmac("sha256", "appsecret").update(raw).digest("hex")}`;
  assert.equal(Wa.validSignature(raw, sig, "appsecret"), true);
  assert.equal(Wa.validSignature(raw, sig, "wrong"), false);
  assert.equal(Wa.validSignature(raw, "", "appsecret"), false);
  assert.equal(Wa.normalizeWaPhone("0612345678"), "212612345678");
  assert.equal(Wa.normalizeWaPhone("+212 6 12 34 56 78"), "212612345678");
});

function webhookBody({ id = "wamid.1", from = "212612345678", phoneNumberId = "PN_SOUAD", referral = null } = {}) {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "212700000000", phone_number_id: phoneNumberId },
    contacts: [{ profile: { name: "Karim Alaoui" }, wa_id: from }],
    messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Bonjour, je viens de l'annonce" }, ...(referral ? { referral } : {}) }],
  } }] }] };
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

test("WhatsApp webhook creates the lead, keeps the ad, assigns the agent, ignores duplicates", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-wa-"));
  const dataFile = path.join(dir, "crm.json");
  const state = {
    agents: [{ id: "souad", name: "souad", active: true }, { id: "wiam", name: "wiam", active: true }],
    campaigns: [{ id: "cmp1", name: "WA Campaign", metaCampaignId: "C1" }], adSets: [{ id: "as1", name: "Set", campaignId: "cmp1", metaAdSetId: "S1" }],
    creatives: [{ id: "cr1", name: "Video 1", adSetId: "as1", metaAdId: "120000111" }],
    crmLeads: [], outcomes: [], dailyLogs: [], adAccounts: [],
    settings: { integrations: { whatsapp: { enabled: true, numbers: [{ phoneNumberId: "777", agentId: "wiam" }] } } },
  };
  fs.writeFileSync(dataFile, JSON.stringify(state));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "admin", CRM_PASSWORD: "pw", CRM_SALES_USER: "", CRM_SALES_PASSWORD: "", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "", CRM_INTEGRATIONS: "1", WHATSAPP_VERIFY_TOKEN: "verify-me", META_APP_SECRET: "appsecret", META_ACCESS_TOKEN: "", META_DATASET_ID: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timed out")), 5000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("CMCG CRM running")) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal(await (await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`)).text(), "abc");
  assert.equal((await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc`)).status, 403);
  const post = (body, secret = "appsecret") => {
    const raw = JSON.stringify(body);
    return fetch(`${base}/api/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}` }, body: raw });
  };
  assert.equal((await post(webhookBody(), "forged")).status, 401);
  const referral = { source_url: "https://fb.me/x", source_id: "120000111", source_type: "ad", headline: "Formation CMCG", body: "Comptabilité", media_type: "video", ctwa_clid: "ARAkLkA8xyz" };
  assert.equal((await post(webhookBody({ id: "wamid.A", phoneNumberId: "777", referral }))).status, 200);
  assert.equal((await post(webhookBody({ id: "wamid.A", phoneNumberId: "777", referral }))).status, 200); // Meta retry
  assert.equal((await post(webhookBody({ id: "wamid.B", phoneNumberId: "777" }))).status, 200); // follow-up, organic
  assert.equal((await post(webhookBody({ id: "wamid.C", from: "0699999999", phoneNumberId: "UNKNOWN" }))).status, 200); // organic new
  await new Promise((r) => setTimeout(r, 600));
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const karim = saved.crmLeads.filter((lead) => lead.phone === "212612345678");
  assert.equal(karim.length, 1, "one lead per phone, duplicates ignored");
  assert.equal(karim[0].agentId, "wiam", "agent from the receiving number");
  assert.equal(karim[0].ctwaClid, "ARAkLkA8xyz");
  assert.equal(karim[0].attributionSource, "api");
  assert.equal(karim[0].creativeId, "cr1", "linked to the ad by Meta ad id");
  assert.equal(karim[0].acquisition.via, "ctwa");
  assert.equal(karim[0].inboundCount, 2, "follow-up counted, not a new lead");
  const organic = saved.crmLeads.find((lead) => lead.phone === "212699999999");
  assert.equal(organic.acquisition.via, "organic");
  assert.equal(organic.creativeId, "", "no fabricated attribution");
  // Admin only status page, no secret values exposed.
  const admin = { Authorization: `Basic ${Buffer.from("admin:pw").toString("base64")}` };
  const status = await (await fetch(`${base}/api/integrations/status`, { headers: admin })).json();
  assert.equal(status.env.META_APP_SECRET, true);
  assert.ok(!JSON.stringify(status).includes("appsecret"));
  assert.equal(status.coverage.whatsappApi, 1);
});

test("ads sync replaces CSV rows in the window without double counting", () => {
  let n = 0;
  const helpers = {
    getOrCreateByExternalId(items, field, value, prefix) { let item = items.find((x) => x[field] === value); const created = !item; if (!item) { item = { id: `${prefix}${++n}`, [field]: value }; items.push(item); } return { item, created }; },
    makeCode: () => `C${++n}`, newId: (p) => `${p}${++n}`,
  };
  const state = { adAccounts: [{ id: "acc1", metaAccountId: "55" }], campaigns: [], adSets: [], creatives: [], usedCreativeCodes: [], settings: {},
    dailyLogs: [
      { id: "csv1", source: "meta_csv", accountId: "acc1", creativeId: "x", date: "2026-10-01", reportingStart: "2026-10-01", reportingEnd: "2026-10-10", spend: 100 },
      { id: "csv2", source: "meta_csv", accountId: "acc1", creativeId: "x", date: "2026-10-08", reportingStart: "2026-10-08", reportingEnd: "2026-10-08", spend: 7 },
      { id: "other", source: "meta_csv", accountId: "acc2", creativeId: "y", date: "2026-10-08", reportingStart: "2026-10-08", reportingEnd: "2026-10-08", spend: 9 },
    ] };
  const rows = [{ ad_id: "A1", ad_name: "Video", adset_id: "S1", adset_name: "Set", campaign_id: "C1", campaign_name: "Camp", date_start: "2026-10-08", date_stop: "2026-10-08", spend: "8.49", impressions: "1000", actions: [{ action_type: "lead", value: "10" }, { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" }] }];
  const info = Ads.applyInsights(state, { account: { id: "act_55", currency: "USD", timezone_name: "Africa/Casablanca" }, rows }, { from: "2026-10-06", to: "2026-10-10" }, helpers);
  assert.equal(info.written, 1);
  const csvLeft = state.dailyLogs.filter((log) => log.source === "meta_csv" && log.accountId === "acc1");
  assert.deepEqual(csvLeft.map((log) => [log.reportingStart, log.reportingEnd, Math.round(log.spend)]), [["2026-10-01", "2026-10-05", 50]], "straddling CSV row keeps only its days before the window");
  assert.ok(state.dailyLogs.some((log) => log.id === "other"), "other ad accounts untouched");
  const api = state.dailyLogs.find((log) => log.source === "meta_api");
  assert.deepEqual([api.spend, api.leads, api.messages, api.date], [8.49, 10, 3, "2026-10-08"]);
  Ads.applyInsights(state, { account: { id: "act_55" }, rows }, { from: "2026-10-06", to: "2026-10-10" }, helpers);
  assert.equal(state.dailyLogs.filter((log) => log.source === "meta_api").length, 1, "re-sync updates, never duplicates");
});
