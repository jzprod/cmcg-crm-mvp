const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function getFreePort() {
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

test("creative codes are shortest-first, unique, permanent, and case-insensitive", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-code-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const port = await getFreePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "", CRM_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(() => {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  await waitForServer(child);

  const baseUrl = `http://127.0.0.1:${port}`;
  async function request(route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return result;
  }

  const program = await request("/api/programs", { name: "HR" });
  const agent = await request("/api/agents", { name: "Agent" });
  const campaign = await request("/api/campaigns", { programId: program.id, name: "Campaign" });
  const adSet = await request("/api/adsets", {
    campaignId: campaign.id,
    agentId: agent.id,
    name: "Main",
  });

  const codes = [];
  for (let index = 0; index < 30; index += 1) {
    const creative = await request("/api/creatives", {
      adSetId: adSet.id,
      name: `Creative ${index}`,
      code: "CUSTOM-CODE-MUST-BE-IGNORED",
    });
    assert.match(creative.code, /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{2}$/);
    codes.push(creative.code);
  }
  assert.equal(new Set(codes).size, codes.length);

  const lead = await request("/api/leads", { code: codes[0].toLowerCase(), stage: "new" });
  assert.equal(lead.code, codes[0]);

  const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.deepEqual(new Set(stored.usedCreativeCodes), new Set(codes));

  const allTwoCharacterCodes = [];
  for (let value = 0; value < 36 ** 2; value += 1) {
    const code = value.toString(36).toUpperCase().padStart(2, "0");
    if (/[A-Z]/.test(code) && /\d/.test(code)) allTwoCharacterCodes.push(code);
  }
  stored.usedCreativeCodes = allTwoCharacterCodes;
  fs.writeFileSync(dataFile, JSON.stringify(stored, null, 2));

  const fallbackCreative = await request("/api/creatives", {
    adSetId: adSet.id,
    name: "Three character fallback",
  });
  assert.match(fallbackCreative.code, /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{3}$/);
});
