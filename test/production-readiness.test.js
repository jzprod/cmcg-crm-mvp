const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { scoreRows, qualityBand, sortRows, deriveTargets } = require("../public/quality.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timed out")), 5000);
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("CMCG CRM running")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited early with code ${code}`));
    });
  });
}

async function startApp(dataFile) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "", CRM_PASSWORD: "", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(child);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function jsonRequest(baseUrl, route, { method = "GET", body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expectedStatus, result.error);
  return result;
}

test("production safeguards validate records and backup restore is loss-resistant", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-production-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl } = await startApp(dataFile);
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const health = await jsonRequest(baseUrl, "/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.storage.backend, "json");
  assert.equal(health.storage.persistent, false);
  await jsonRequest(baseUrl, "/api/settings/scoring", { method: "POST", body: { closingWindowDays: 9, targetShowRate: 55, targetCloseRate: 35 }, expectedStatus: 200 });
  const settingsSnapshot = await jsonRequest(baseUrl, "/api/state");
  assert.equal(settingsSnapshot.state.settings.scoring.closingWindowDays, 9);
  assert.equal(settingsSnapshot.state.settings.scoring.targetShowRate, 55);

  const program = await jsonRequest(baseUrl, "/api/programs", { method: "POST", body: { name: "Accounting" }, expectedStatus: 201 });
  await jsonRequest(baseUrl, "/api/programs", { method: "POST", body: { name: "accounting" }, expectedStatus: 409 });
  const agent = await jsonRequest(baseUrl, "/api/agents", { method: "POST", body: { name: "Sara" }, expectedStatus: 201 });
  const campaign = await jsonRequest(baseUrl, "/api/campaigns", { method: "POST", body: { programId: program.id, name: "September" }, expectedStatus: 201 });
  const adSet = await jsonRequest(baseUrl, "/api/adsets", { method: "POST", body: { campaignId: campaign.id, agentId: agent.id, name: "Sara WhatsApp" }, expectedStatus: 201 });
  const creative = await jsonRequest(baseUrl, "/api/creatives", { method: "POST", body: { adSetId: adSet.id, name: "Testimonial" }, expectedStatus: 201 });

  await jsonRequest(baseUrl, "/api/leads", { method: "POST", body: { creativeId: creative.id, stage: "lost" }, expectedStatus: 400 });
  await jsonRequest(baseUrl, "/api/leads", { method: "POST", body: { creativeId: creative.id, stage: "lost", lostReason: "Not interested" }, expectedStatus: 201 });
  await jsonRequest(baseUrl, "/api/daily-logs", { method: "POST", body: { creativeId: creative.id, date: "2026-09-01", spend: 100, messages: 5 }, expectedStatus: 201 });
  await jsonRequest(baseUrl, "/api/daily-logs", { method: "POST", body: { creativeId: creative.id, date: "2026-09-01", spend: 100, messages: 5 }, expectedStatus: 409 });

  const backupResponse = await fetch(`${baseUrl}/api/backup`);
  assert.equal(backupResponse.status, 200);
  assert.match(backupResponse.headers.get("content-disposition"), /cmcg-crm-backup/);
  const backup = await backupResponse.json();
  assert.equal(backup.agents.length, 1);

  await jsonRequest(baseUrl, "/api/agents", { method: "POST", body: { name: "Temporary agent" }, expectedStatus: 201 });
  await jsonRequest(baseUrl, "/api/restore", { method: "POST", body: backup });
  const restored = await jsonRequest(baseUrl, "/api/state");
  assert.equal(restored.state.agents.length, 1);
  assert.equal(restored.state.agents[0].name, "Sara");
  assert.ok(restored.state.meta.restoredAt);

  await jsonRequest(baseUrl, "/api/reset-data", { method: "POST", body: { confirm: true } });
  const reset = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(reset.agents.length, 0);
  assert.equal(reset.campaigns.length, 0);
  assert.equal(reset.creatives.length, 0);
  assert.equal(reset.dailyLogs.length, 0);
  assert.equal(reset.outcomes.length, 0);
  assert.equal(reset.usedCreativeCodes.length, 0);
  assert.ok(reset.meta.resetAt);

  const backupDir = path.join(tempDir, "backups");
  assert.equal(fs.existsSync(backupDir), true);
  assert.ok(fs.readdirSync(backupDir).some((name) => name.endsWith(".json")));
});

test("Meta CSV sync is idempotent, matches agents, and supports hierarchical outcomes", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-meta-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl } = await startApp(dataFile);
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const souad = await jsonRequest(baseUrl, "/api/agents", { method: "POST", body: { name: "Souad" }, expectedStatus: 201 });
  await jsonRequest(baseUrl, "/api/agents", { method: "POST", body: { name: "Hasan" }, expectedStatus: 201 });
  const headers = ["Campaign name", "Ad set name", "Ad name", "Delivery status", "Delivery level", "Result type", "Results", "Amount spent (USD)", "Objective", "Account ID", "Account name", "Ad ID", "Ad set ID", "Campaign ID", "Messaging conversations started", "Reporting starts", "Reporting ends"];
  const values = [
    ["CMCG Traffic", "Motion graphic souad", "Motion 2", "active", "ad", "Messaging conversations started", "2", "1.19", "Traffic", "144425835727623", "Fen Nord", "6906242427079", "6906242427279", "6883602937279", "2", "2026-09-02", "2026-09-02"],
    ["CMCG Traffic", "Motion graphic HASAN", "Motion 2", "active", "ad", "Messaging conversations started", "3", "1.06", "Traffic", "144425835727623", "Fen Nord", "6907006155279", "6907006155079", "6883602937279", "3", "2026-09-02", "2026-09-02"],
  ];
  const csv = [headers, ...values].map((row) => row.join(",")).join("\r\n");
  const first = await jsonRequest(baseUrl, "/api/meta-import", { method: "POST", body: { filename: "meta.csv", csv } });
  assert.equal(first.result.rows, 2);
  assert.equal(first.result.adsAdded, 2);

  let snapshot = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(snapshot.campaigns.length, 1);
  assert.equal(snapshot.adSets.length, 2);
  assert.equal(snapshot.creatives.length, 2);
  assert.equal(snapshot.dailyLogs.length, 2);
  assert.equal(snapshot.adSets.find((item) => item.name.includes("souad")).agentId, souad.id);
  assert.equal(snapshot.adSets.every((item) => item.agentMatchStatus === "matched"), true);
  assert.equal(snapshot.dailyLogs[0].raw["Account ID"], "144425835727623");

  const renamedCsv = csv.replace("Motion 2,active", "Motion 2 renamed,active").replace("2,1.19,Traffic", "4,2.38,Traffic");
  const second = await jsonRequest(baseUrl, "/api/meta-import", { method: "POST", body: { filename: "meta-again.csv", csv: renamedCsv } });
  assert.equal(second.result.adsAdded, 0);
  assert.equal(second.result.metricsUpdated, 2);
  snapshot = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(snapshot.creatives.length, 2);
  assert.equal(snapshot.dailyLogs.length, 2);
  assert.ok(snapshot.creatives.some((item) => item.name === "Motion 2 renamed"));

  const fallbackHeaders = ["Campaign name", "Ad set name", "Ad name", "Delivery status", "Delivery level", "Result type", "Results", "Amount spent (USD)", "Objective", "Account ID", "Account name", "Ad ID", "Ad set ID", "Campaign ID", "Messaging conversations started"];
  const fallbackValues = [["CMCG Sales", "Evening souad", "Filename date ad", "active", "ad", "Messaging conversations started", "1", "5.00", "Sales", "144425835727623", "Fen Nord", "6909999999999", "6909999999888", "6889999999777", "1"]];
  const fallbackCsv = [fallbackHeaders, ...fallbackValues].map((row) => row.join(",")).join("\r\n");
  await jsonRequest(baseUrl, "/api/meta-import", { method: "POST", body: { filename: "Fen-Nord-Ads-Sep-1-2026-Sep-1-2026.csv", csv: fallbackCsv } });
  snapshot = (await jsonRequest(baseUrl, "/api/state")).state;
  const fallbackAd = snapshot.creatives.find((item) => item.metaAdId === "6909999999999");
  const fallbackLog = snapshot.dailyLogs.find((log) => log.creativeId === fallbackAd.id);
  assert.equal(fallbackLog.date, "2026-09-01");
  assert.equal(fallbackLog.reportingStart, "2026-09-01");
  assert.equal(fallbackLog.reportingEnd, "2026-09-01");

  const ad = snapshot.creatives.find((item) => item.name === "Motion 2 renamed");
  const registered = await jsonRequest(baseUrl, "/api/outcomes", { method: "POST", body: { type: "registered", assignmentLevel: "ad", targetId: ad.id, date: "2026-09-02", personName: "Student" }, expectedStatus: 201 });
  assert.equal(registered.creativeId, ad.id);
  assert.ok(registered.adSetId);
  assert.ok(registered.campaignId);
  assert.equal(registered.agentId, souad.id);
  const campaign = snapshot.campaigns[0];
  const booked = await jsonRequest(baseUrl, "/api/outcomes", { method: "POST", body: { type: "booked", assignmentLevel: "campaign", targetId: campaign.id, date: "2026-09-02" }, expectedStatus: 201 });
  assert.equal(booked.campaignId, campaign.id);
  assert.equal(booked.adSetId, "");
  await jsonRequest(baseUrl, `/api/outcomes/${booked.id}`, { method: "DELETE" });
  snapshot = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(snapshot.outcomes.length, 1);
});

test("quality score auto-learns from gathered data and stays closing-window aware", () => {
  const sourceRows = [
    { name: "Fresh tiny spend", spend: 2, booked: 0, showed: 0, registered: 0, messages: 1, firstActivityDate: "2026-09-02" },
    { name: "Mature tiny spend", spend: 2, booked: 0, showed: 0, registered: 0, messages: 1, firstActivityDate: "2026-08-20" },
    { name: "Strong ad", spend: 50, booked: 5, showed: 1, registered: 1, messages: 20, firstActivityDate: "2026-08-20" },
    { name: "High volume ad", spend: 120, booked: 14, showed: 4, registered: 3, messages: 45, firstActivityDate: "2026-08-20" },
    { name: "Watch no reg", spend: 20, booked: 2, showed: 1, registered: 0, messages: 8, firstActivityDate: "2026-08-20" },
    { name: "Weak no reg", spend: 220, booked: 0, showed: 0, registered: 0, messages: 8, firstActivityDate: "2026-08-20" },
    { name: "No spend", spend: 0, booked: 1, showed: 0, registered: 0, messages: 1, firstActivityDate: "2026-08-20" },
  ];
  const targets = deriveTargets({}, sourceRows);
  assert.equal(targets.automatic, true);
  assert.equal(targets.configured, true);
  assert.equal(targets.targetCostRegistered, 50);
  assert.equal(targets.targetCostVisit, 20);
  assert.equal(targets.targetCostBooked, 10);

  const rows = scoreRows(sourceRows, {}, new Date("2026-09-03T00:00:00Z"));

  assert.equal(rows.find((row) => row.name === "Fresh tiny spend").qualityStatus.key, "pending");
  assert.equal(rows.find((row) => row.name === "Mature tiny spend").qualityStatus.key, "insufficient");
  assert.equal(rows.find((row) => row.name === "Strong ad").qualityStatus.key, "strong");
  assert.equal(rows.find((row) => row.name === "Watch no reg").qualityStatus.key, "watch");
  assert.equal(rows.find((row) => row.name === "Weak no reg").qualityStatus.key, "weak");
  assert.equal(rows.find((row) => row.name === "No spend").qualityStatus.key, "none");
  assert.equal(rows.find((row) => row.name === "Strong ad").visits, 2);
  assert.equal(rows.find((row) => row.name === "Strong ad").costVisit, 25);
  assert.equal(rows.find((row) => row.name === "Strong ad").showRate, 0.4);
  assert.equal(rows.find((row) => row.name === "Strong ad").closeRate, 0.5);
  assert.ok(rows.find((row) => row.name === "Strong ad").agentClosingScore > 0);
  assert.equal(qualityBand(rows.find((row) => row.name === "Weak no reg")).label, "Weak");
  assert.deepEqual(sortRows(rows, "quality").slice(0, 2).map((row) => row.name), ["High volume ad", "Strong ad"]);
  assert.equal(sortRows(rows, "costVisit")[0].name, "High volume ad");
});

test("production UI contains accessible controls and correctly encoded Arabic copy", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.doesNotMatch(html, /CMCG CRM MVP/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Import &amp; data|Import & data/);
  assert.match(html, /Add outcome/);
  assert.match(html, /Reset CRM data/);
  assert.match(html, /scoringNotice/);
  assert.match(html, /<label>/);
  assert.match(app, /cmcg-visible-columns/);
  assert.match(app, /Business quality - highest/);
  assert.match(app, /Automatic scoring is learning/);
  assert.match(app, /reset-data/);
  assert.match(app, /agentClosing/);
  assert.match(app, /مرحباً، أريد معرفة تفاصيل التكوين/);
  assert.doesNotMatch(app, /Ù…Ø/);
});
