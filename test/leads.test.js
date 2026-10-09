process.env.CRM_SHEET_SYNC = "0"; // test servers never call Google
process.env.CRM_PUSH = "0";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Leads = require("../leads.js");

const Q1 = "التكوين__حضوري_فقط_فمدينة_طنجة._واش_تقدر_تحضر_للمركز_بانتظام؟";
const Q2 = "2️⃣_شنو_هو_المستوى_الدراسي_ديالك؟";
// The exact columns of the "CMCG Leads" sheet filled by Meta.
function sheetRow(overrides = {}) {
  return {
    id: "l:1618420296411633", created_time: "2026-10-08T11:28:02-05:00",
    ad_id: "ag:120001", ad_name: "image SHIFT 7 S", adset_id: "as:220001", adset_name: "Lead Souad",
    campaign_id: "c:320001", campaign_name: "CMCG Leads", form_id: "f:1517473647103779", form_name: "CMCG First Form",
    is_organic: "false", platform: "ig", [Q1]: "نعم", [Q2]: "باك", full_name: "Yassine Amrani", phone_number: "p:+212612345678", lead_status: "complate",
    ...overrides,
  };
}

function baseState() {
  return {
    agents: [{ id: "souad", name: "Souad" }, { id: "wiam", name: "Wiam" }, { id: "hassan", name: "Hassan", active: false }],
    campaigns: [{ id: "c1", name: "CMCG Leads", metaCampaignId: "320001", objective: "OUTCOME_LEADS" }, { id: "c2", name: "WhatsApp Sales", metaCampaignId: "320002", objective: "Sales" }],
    adSets: [{ id: "s1", name: "Lead Souad", metaAdSetId: "220001", campaignId: "c1", agentId: "souad" }],
    creatives: [{ id: "a1", name: "image SHIFT 7 S", metaAdId: "120001", adSetId: "s1" }],
    outcomes: [],
    crmLeads: [],
  };
}

test("a sheet row becomes a clean lead with its ad, answers and an international phone", () => {
  const lead = Leads.normalizeLeadRow(sheetRow());
  assert.equal(lead.externalId, "1618420296411633");
  assert.equal(lead.name, "Yassine Amrani");
  assert.equal(lead.phone, "212612345678");
  assert.equal(lead.meta.adId, "120001");
  assert.equal(lead.meta.formId, "1517473647103779");
  assert.equal(lead.createdAt, "2026-10-08T16:28:02.000Z");
  assert.deepEqual(Object.values(lead.answers), ["نعم", "باك"]);
  assert.equal(Leads.normalizePhone("0612345678"), "212612345678");
  assert.equal(Leads.normalizePhone("06 12 34 56 78"), "212612345678");
  assert.equal(Leads.normalizePhone("00212612345678"), "212612345678");
  assert.equal(Leads.normalizePhone("612345678"), "212612345678");
});

test("Meta test leads are skipped and re-sending the sheet never duplicates", () => {
  const state = baseState();
  const distribution = Leads.normalizeDistribution({});
  const test = { ...sheetRow(), full_name: "<test lead: dummy data for full_name>", phone_number: "p:<test lead: dummy data for phone_number>" };
  const first = Leads.ingestLeadRows(state, [test, sheetRow()], { distribution });
  assert.equal(first.test, 1);
  assert.equal(first.added, 1);
  const again = Leads.ingestLeadRows(state, [sheetRow(), sheetRow()], { distribution });
  assert.equal(again.added, 0);
  assert.equal(again.updated, 2);
  assert.equal(state.crmLeads.length, 1);
  const lead = state.crmLeads[0];
  assert.equal(lead.creativeId, "a1");
  assert.equal(lead.adSetId, "s1");
  assert.equal(lead.campaignId, "c1");
});

test("leads are spread evenly, by weight, by ad set, or left for manual assignment", () => {
  const rows = Array.from({ length: 6 }, (_, i) => sheetRow({ id: `l:${i}`, phone_number: `p:+21261111111${i}` }));
  const at = new Date("2026-10-08T12:00:00Z");
  const even = baseState();
  Leads.ingestLeadRows(even, rows, { distribution: Leads.normalizeDistribution({ mode: "balanced" }), at });
  const counts = (state) => state.crmLeads.reduce((acc, lead) => { acc[lead.agentId] = (acc[lead.agentId] || 0) + 1; return acc; }, {});
  assert.deepEqual(counts(even), { souad: 3, wiam: 3 }); // Hassan is inactive

  const weighted = baseState();
  Leads.ingestLeadRows(weighted, rows, { distribution: Leads.normalizeDistribution({ mode: "weighted", agents: { souad: { weight: 2 }, wiam: { weight: 1 } } }), at });
  assert.deepEqual(counts(weighted), { souad: 4, wiam: 2 });

  const byAdSet = baseState();
  Leads.ingestLeadRows(byAdSet, rows, { distribution: Leads.normalizeDistribution({ mode: "adset" }), at });
  assert.deepEqual(counts(byAdSet), { souad: 6 });

  const off = baseState();
  Leads.ingestLeadRows(off, rows.slice(0, 2), { distribution: Leads.normalizeDistribution({ mode: "balanced", agents: { souad: { active: false } } }), at });
  assert.deepEqual(counts(off), { wiam: 2 });

  const manual = baseState();
  Leads.ingestLeadRows(manual, rows.slice(0, 2), { distribution: Leads.normalizeDistribution({ mode: "manual" }), at });
  assert.deepEqual(counts(manual), { "": 2 });
});

test("status changes book CRM outcomes automatically on the lead's ad", () => {
  const state = baseState();
  Leads.ingestLeadRows(state, [sheetRow()], { distribution: Leads.normalizeDistribution({}) });
  const lead = state.crmLeads[0];
  Leads.updateLead(state, lead, { appointmentAt: "2026-10-10T11:00" });
  assert.equal(lead.status, "booked");
  assert.deepEqual(state.outcomes.map((o) => [o.type, o.assignmentLevel, o.creativeId, o.agentId]), [["booked", "ad", "a1", lead.agentId]]);
  Leads.updateLead(state, lead, { status: "visited" });
  assert.deepEqual(state.outcomes.map((o) => o.type).sort(), ["booked", "showed"]);
  Leads.updateLead(state, lead, { status: "registered" });
  assert.deepEqual(state.outcomes.map((o) => o.type).sort(), ["booked", "registered"]); // showed = visited without registering
  assert.equal(state.outcomes.find((o) => o.type === "registered").sourceDate, "2026-10-08");
  Leads.updateLead(state, lead, { status: "registered" });
  assert.equal(state.outcomes.length, 2);
  assert.throws(() => Leads.updateLead(state, lead, { status: "maybe" }), /نتيجة/);
  // The centre is open 11:00-20:00: the last RDV starts at 19:30.
  assert.throws(() => Leads.updateLead(state, lead, { appointmentAt: "2026-10-10T10:30" }), /11:00/);
  assert.throws(() => Leads.updateLead(state, lead, { appointmentAt: "2026-10-10T20:00" }), /19:30/);
  Leads.updateLead(state, lead, { appointmentAt: "2026-10-10T19:30" });
});

test("new call results close or schedule the lead; agents get daily stats", () => {
  const state = baseState();
  Leads.ingestLeadRows(state, [sheetRow({ id: "l:a", phone_number: "p:+212611111111" }), sheetRow({ id: "l:b", phone_number: "p:+212622222222" })], { distribution: Leads.normalizeDistribution({}) });
  const [a, b] = state.crmLeads;
  Leads.updateLead(state, a, { status: "callback", callbackAt: "2026-10-09T15:00", contacted: "call" });
  assert.equal(a.status, "callback");
  assert.equal(a.callbackAt, "2026-10-09T15:00");
  Leads.updateLead(state, b, { status: "other_city", contacted: "call" });
  assert.ok(Leads.CLOSED_STATUSES.has("other_city") && Leads.CLOSED_STATUSES.has("not_qualified"));
  const stats = Leads.leadStats(state);
  const total = stats.reduce((sum, row) => sum + row.actionsToday, 0);
  assert.equal(total, 2);
  assert.deepEqual(stats.map((row) => row.agentId).sort(), ["souad", "wiam"]);
  // Old French defaults are upgraded to the Arabic messages; custom text is kept.
  const upgraded = Leads.normalizeDistribution({ templates: { reminder: "Bonjour {name}, ici {agent} du centre CMCG Tanger. Je vous rappelle votre rendez-vous {day} à {time}. À bientôt !", first: "Salam {name}" } });
  assert.match(upgraded.templates.reminder, /كنفكروك|نفكروك/);
  assert.equal(upgraded.templates.first, "Salam {name}");
});

test("leads transfer between agents, keeping RDVs unless asked", () => {
  const state = baseState();
  state.agents.push({ id: "nora", name: "Nora" });
  const rows = Array.from({ length: 6 }, (_, i) => sheetRow({ id: `l:t${i}`, phone_number: `p:+21262222222${i}` }));
  Leads.ingestLeadRows(state, rows, { distribution: Leads.normalizeDistribution({ mode: "adset" }) }); // all to Souad
  Leads.updateLead(state, state.crmLeads[0], { appointmentAt: "2026-10-10T15:00" });
  Leads.updateLead(state, state.crmLeads[1], { status: "no_answer" });
  const preview = Leads.transferLeads(state, { from: ["souad"], statuses: ["new"], to: ["wiam", "nora"], dryRun: true });
  assert.deepEqual(preview, { moved: 4, plan: { wiam: 2, nora: 2 } });
  assert.ok(state.crmLeads.every((lead) => lead.agentId === "souad")); // dry run changes nothing
  Leads.transferLeads(state, { from: ["souad"], statuses: ["new", "no_answer"], to: ["wiam"], by: "Admin" });
  assert.equal(state.crmLeads[0].agentId, "souad"); // the RDV stays with the agent who booked it
  assert.equal(state.crmLeads.filter((lead) => lead.agentId === "wiam").length, 5);
  assert.equal(state.outcomes.find((o) => o.leadId === state.crmLeads[0].id).agentId, "souad");
  assert.throws(() => Leads.transferLeads(state, { from: ["wiam"], statuses: [], to: ["souad"] }), /حالة/);
  // Paused or hidden agents receive no new leads.
  const paused = baseState();
  Leads.ingestLeadRows(paused, rows.slice(0, 2), { distribution: Leads.normalizeDistribution({ agents: { souad: { hidden: true }, wiam: { active: true } } }) });
  assert.ok(paused.crmLeads.every((lead) => lead.agentId === "wiam"));
});

test("demo leads show the agents' screen without touching ad results", () => {
  const state = baseState();
  const created = Leads.createDemoLeads(state, ["souad", "wiam"], new Date("2026-10-08T12:00:00"));
  assert.equal(created.length, 4);
  assert.deepEqual(created.map((lead) => lead.agentId), ["souad", "souad", "wiam", "wiam"]);
  assert.equal(created.filter((lead) => lead.status === "new").length, 2);
  const rdv = created.find((lead) => lead.status === "booked");
  assert.equal(rdv.appointmentAt, "2026-10-08T13:30");
  assert.equal(rdv.remindedAt, "");
  Leads.updateLead(state, rdv, { status: "registered" });
  assert.equal(state.outcomes.length, 0); // never counted on the ads
  assert.equal(Leads.removeDemoLeads(state), 4);
  assert.equal(state.crmLeads.length, 0);
  // After closing time the demo RDV moves to tomorrow 15:00.
  assert.match(Leads.createDemoLeads(baseState(), ["souad"], new Date("2026-10-08T19:30:00"))[1].appointmentAt, /T15:00$/);
});

test("templates, contact cards and the WhatsApp vs form split", () => {
  const lead = { name: "Yassine Amrani", phone: "212612345678", appointmentAt: "2026-10-10T10:00:00", source: "form", createdAt: "2026-10-08T10:00:00Z" };
  const text = Leads.fillTemplate("Bonjour {name}, ici {agent}. RDV {day} à {time}.", lead, { agentName: "Souad" });
  assert.match(text, /^Bonjour Yassine, ici Souad\. RDV samedi 10 octobre à 10:00\.$/);
  const card = Leads.leadVcard(lead, { campaignName: "CMCG Leads" });
  assert.match(card, /FN:Yassine Amrani · CMCG CMCG Leads/);
  assert.match(card, /TEL;TYPE=CELL:\+212612345678/);
  const state = baseState();
  assert.equal(Leads.channelOfCampaign(state, state.campaigns[0]), "form");
  assert.equal(Leads.channelOfCampaign(state, state.campaigns[1]), "whatsapp");
  assert.equal(Leads.channelOfCampaign(state, state.campaigns[1], { c2: "form" }), "form");
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

test("Google Sheets pushes leads with a token; agents only see and change their own", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-leads-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  fs.writeFileSync(dataFile, JSON.stringify({ ...baseState(), settings: { leadDistribution: { mode: "balanced" } } }));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "admin", CRM_PASSWORD: "pw", CRM_SALES_USER: "souad", CRM_SALES_PASSWORD: "spw", CRM_SALES_AGENT: "Souad", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timed out")), 5000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("CMCG CRM running")) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const admin = { Authorization: `Basic ${Buffer.from("admin:pw").toString("base64")}`, "Content-Type": "application/json" };
  const sales = { Authorization: `Basic ${Buffer.from("souad:spw").toString("base64")}`, "Content-Type": "application/json" };
  const call = async (route, { method = "GET", headers = admin, body } = {}) => {
    const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = response.headers.get("content-type") || "";
    return { status: response.status, data: type.includes("json") ? await response.json() : await response.text(), headers: response.headers };
  };

  assert.equal((await call("/api/lead-intake?token=nope", { method: "POST", headers: { "Content-Type": "application/json" }, body: { rows: [sheetRow()] } })).status, 401);
  const { data: { token } } = await call("/api/lead-intake/token", { method: "POST", body: {} });
  assert.equal(token.length, 36);
  const rows = [sheetRow({ id: "l:1", phone_number: "p:+212611111111" }), sheetRow({ id: "l:2", phone_number: "p:+212622222222" })];
  const intake = await call(`/api/lead-intake?token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: { rows } });
  assert.equal(intake.status, 200);
  assert.equal(intake.data.added, 2);

  const all = (await call("/api/state")).data.state.crmLeads;
  assert.equal(all.length, 2);
  const mine = (await call("/api/state", { headers: sales })).data.state.crmLeads;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].agentId, "souad");
  const other = all.find((lead) => lead.agentId !== "souad");
  assert.equal((await call(`/api/crm-leads/${other.id}`, { method: "PATCH", headers: sales, body: { status: "contacted" } })).status, 404);
  const booked = await call(`/api/crm-leads/${mine[0].id}`, { method: "PATCH", headers: sales, body: { appointmentAt: "2026-10-10T11:30" } });
  assert.equal(booked.data.status, "booked");
  assert.equal((await call(`/api/crm-leads/${mine[0].id}`, { method: "PATCH", headers: sales, body: { agentId: "wiam" } })).status, 403);
  assert.equal((await call("/api/crm-leads/import", { method: "POST", headers: sales, body: { csv: "a\nb" } })).status, 403);
  const card = await call(`/api/crm-leads/${mine[0].id}/vcard`, { headers: sales });
  assert.match(card.headers.get("content-type"), /text\/vcard/);
  assert.match(card.data, /TEL;TYPE=CELL:\+2126/);
  const whatsapp = await call("/api/crm-leads", { method: "POST", headers: sales, body: { name: "Karim", phone: "0633333333" } });
  assert.equal(whatsapp.status, 201);
  assert.equal(whatsapp.data.source, "whatsapp");
  assert.equal(whatsapp.data.agentId, "souad");
  const outcomes = (await call("/api/state")).data.state.outcomes;
  assert.deepEqual(outcomes.map((o) => [o.type, o.leadId]), [["booked", mine[0].id]]);
});

test("each agent gets a personal link that only opens her leads", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-link-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const state = { ...baseState(), students: [{ id: "st1", name: "Secret", agentId: "souad", groupId: "g1" }], settings: { leadDistribution: { mode: "balanced" } } };
  fs.writeFileSync(dataFile, JSON.stringify(state));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "admin", CRM_PASSWORD: "pw", CRM_SALES_USER: "", CRM_SALES_PASSWORD: "", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timed out")), 5000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("CMCG CRM running")) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const admin = { Authorization: `Basic ${Buffer.from("admin:pw").toString("base64")}`, "Content-Type": "application/json" };
  const { token, path: linkPath } = await (await fetch(`${base}/api/agents/souad/access-link`, { method: "POST", headers: admin })).json();
  assert.match(token, /^[a-f0-9]{32}$/);
  assert.equal((await fetch(`${base}/a/${"0".repeat(32)}`, { redirect: "manual" })).status, 403);
  const login = await fetch(`${base}${linkPath}`, { redirect: "manual" });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get("location"), "/#view=leads");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  const agent = { Cookie: cookie, "Content-Type": "application/json" };
  assert.equal((await fetch(`${base}/`, { headers: { Cookie: cookie } })).status, 200);
  const view = await (await fetch(`${base}/api/state`, { headers: agent })).json();
  assert.equal(view.currentUser.role, "sales");
  assert.equal(view.currentUser.agentId, "souad");
  assert.deepEqual(view.state.students, []);
  assert.ok(view.state.agents.every((item) => !item.accessToken));
  assert.equal((await fetch(`${base}/api/students`, { method: "POST", headers: agent, body: "{}" })).status, 403);
  assert.equal((await fetch(`${base}/api/crm-leads`, { method: "POST", headers: agent, body: JSON.stringify({ name: "Karim", phone: "0633333333" }) })).status, 201);
  const adminView = await (await fetch(`${base}/api/state`, { headers: admin })).json();
  assert.ok(adminView.leadStats.find((row) => row.agentId === "souad").lastSeenAt);
  // Opening the CRM renews the login, so the agent never types a password.
  const home = await fetch(`${base}/`, { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  assert.match(home.headers.get("set-cookie") || "", /cmcg_agent=.*Max-Age=15552000/);
  assert.equal(home.headers.get("www-authenticate"), null);
  // /admin forgets the agent link in this browser, so the admin gets the full CRM back.
  const leave = await fetch(`${base}/admin`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(leave.status, 302);
  assert.equal(leave.headers.get("location"), "/");
  assert.match(leave.headers.get("set-cookie"), /cmcg_agent=;.*Max-Age=0/);
  assert.equal((await fetch(`${base}/`)).status, 401);
  // A new link cuts the old one off with a friendly page, not a password box.
  await fetch(`${base}/api/agents/souad/access-link`, { method: "POST", headers: admin });
  assert.equal((await fetch(`${base}/api/state`, { headers: agent })).status, 401);
  const expired = await fetch(`${base}/`, { headers: { Cookie: cookie } });
  assert.equal(expired.status, 403);
  assert.equal(expired.headers.get("www-authenticate"), null);
  assert.match(await expired.text(), /تغيّر رابطك/);
});

test("form leads link to ads by Meta ids only, never by name", () => {
  const state = {
    agents: [{ id: "souad", name: "souad" }], crmLeads: [], outcomes: [], settings: {},
    campaigns: [{ id: "old", name: "WhatsApp Sept", metaCampaignId: "111" }],
    adSets: [{ id: "as_old", name: "LEADS ADSET", campaignId: "old" }],
    creatives: [{ id: "ad_old", name: "FREE Sesion Image", adSetId: "as_old" }],
  };
  const lead = { id: "l1", source: "form", status: "booked", bookedAt: "2026-10-08T10:00:00.000Z", createdAt: "2026-10-08T09:00:00.000Z", agentId: "souad",
    meta: { campaignId: "6922104145679", campaignName: "Leads Test Campaign", adSetId: "6922104145279", adSetName: "LEADS ADSET", adId: "6922106416679", adName: "FREE Sesion Image" },
    creativeId: "ad_old", adSetId: "as_old", campaignId: "old" }; // what the old matching did
  state.crmLeads.push(lead);
  assert.deepEqual(Leads.attributeLead(state, lead), { creativeId: "", adSetId: "", campaignId: "" });
  Leads.syncLeadOutcomes(state, lead);
  assert.equal(state.outcomes[0].campaignId, "old");
  assert.equal(Leads.reattributeLeads(state), 1);
  assert.equal(lead.campaignId, "");
  assert.equal(state.outcomes[0].campaignId, "");
  // Once the real campaign is imported, the lead links to it.
  state.campaigns.push({ id: "new", name: "Leads Test Campaign", metaCampaignId: "6922104145679" });
  state.adSets.push({ id: "as_new", name: "LEADS ADSET", campaignId: "new", metaAdSetId: "6922104145279" });
  state.creatives.push({ id: "ad_new", name: "FREE Sesion Image", adSetId: "as_new", metaAdId: "6922106416679" });
  assert.equal(Leads.reattributeLeads(state), 1);
  assert.deepEqual([lead.campaignId, lead.adSetId, lead.creativeId], ["new", "as_new", "ad_new"]);
  assert.equal(state.outcomes[0].creativeId, "ad_new");
});
