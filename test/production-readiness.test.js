const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

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

  const backupDir = path.join(tempDir, "backups");
  assert.equal(fs.existsSync(backupDir), true);
  assert.ok(fs.readdirSync(backupDir).some((name) => name.endsWith(".json")));
});

test("production UI contains accessible controls and correctly encoded Arabic copy", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.doesNotMatch(html, /CMCG CRM MVP/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Data &amp; backup|Data & backup/);
  assert.match(html, /<label>/);
  assert.match(app, /مرحبا، أريد معرفة تفاصيل التكوين/);
  assert.doesNotMatch(app, /Ù…Ø/);
});
