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

async function startApp(dataFile, { auth = false, sales = false } = {}) {
  const port = await freePort();
  const authUser = (auth || sales) ? "admin" : "";
  const authPassword = (auth || sales) ? "secret-pass" : "";
  const salesUser = sales ? "souad-login" : "";
  const salesPassword = sales ? "sales-secret" : "";
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      CRM_DATA_FILE: dataFile,
      CRM_USER: authUser,
      CRM_PASSWORD: authPassword,
      CRM_SALES_USER: salesUser,
      CRM_SALES_PASSWORD: salesPassword,
      CRM_SALES_AGENT: sales ? "Souad" : "",
      DB_HOST: "",
      DB_USER: "",
      DB_PASSWORD: "",
      DB_NAME: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(child);
  return {
    child,
    baseUrl: `http://127.0.0.1:${port}`,
    authHeader: (auth || sales) ? `Basic ${Buffer.from(`${authUser}:${authPassword}`).toString("base64")}` : "",
    salesAuthHeader: sales ? `Basic ${Buffer.from(`${salesUser}:${salesPassword}`).toString("base64")}` : "",
  };
}

async function jsonRequest(baseUrl, route, { method = "GET", body, expectedStatus = 200, authHeader = "" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
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

  const updatedAgent = await jsonRequest(baseUrl, `/api/agents/${restored.state.agents[0].id}`, { method: "PATCH", body: { name: "Sarah", whatsapp: "+212600000000" } });
  assert.equal(updatedAgent.name, "Sarah");
  assert.equal(updatedAgent.whatsapp, "+212600000000");
  await jsonRequest(baseUrl, "/api/agents", { method: "POST", body: { name: "sarah" }, expectedStatus: 409 });
  await jsonRequest(baseUrl, `/api/agents/${updatedAgent.id}`, { method: "DELETE" });
  const afterDelete = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(afterDelete.agents.length, 0);
  assert.equal(afterDelete.adSets[0].agentId, "");

  await jsonRequest(baseUrl, "/api/reset-data", { method: "POST", body: { confirm: true } });
  const reset = (await jsonRequest(baseUrl, "/api/state")).state;
  assert.equal(reset.agents.length, 0);
  assert.equal(reset.campaigns.length, 0);
  assert.equal(reset.groups.length, 0);
  assert.equal(reset.students.length, 0);
  assert.equal(reset.payments.length, 0);
  assert.equal(reset.creatives.length, 0);
  assert.equal(reset.dailyLogs.length, 0);
  assert.equal(reset.outcomes.length, 0);
  assert.equal(reset.usedCreativeCodes.length, 0);
  assert.ok(reset.meta.resetAt);

  const backupDir = path.join(tempDir, "backups");
  assert.equal(fs.existsSync(backupDir), true);
  assert.ok(fs.readdirSync(backupDir).some((name) => name.endsWith(".json")));
});

test("training groups track capacity, installments, and student timeline events", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-groups-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const training = await request("/api/programs", { method: "POST", body: { name: "Comptabilite 3 mois", durationLabel: "3 months", basePrice: 3000, discountedPrice: 2500 }, expectedStatus: 201 });
  const agent = await request("/api/agents", { method: "POST", body: { name: "Souad" }, expectedStatus: 201 });
  const group = await request("/api/groups", { method: "POST", body: { programId: training.id, name: "Monday morning", capacity: 2, sessions: [{ day: "Monday", timeStart: "10:00", timeEnd: "12:00" }, { day: "Wednesday", timeStart: "10:00", timeEnd: "12:00" }] }, expectedStatus: 201 });
  assert.equal(group.programId, training.id);
  assert.equal(group.sessions.length, 2);
  assert.deepEqual(group.sessions[0], { day: "monday", timeStart: "10:00", timeEnd: "12:00" });
  assert.deepEqual(group.days, ["monday", "wednesday"]);
  assert.equal(group.capacity, 2);

  const student = await request("/api/students", { method: "POST", body: { groupId: group.id, agentId: agent.id, name: "Ali Student", phone: "+212600000001", registeredAt: "2026-09-07", totalDue: 2500, paymentPlan: "installments", initialPaid: 500 }, expectedStatus: 201 });
  assert.equal(student.totalDue, 2500);
  assert.equal(student.paymentPlan, "monthly");
  assert.equal(student.nextPaymentDate, "2026-10-07");
  await request(`/api/students/${student.id}/payments`, { method: "POST", body: { amount: 1000, paidAt: "2026-09-10", method: "cash", notes: "Second installment" }, expectedStatus: 201 });
  const updated = await request(`/api/students/${student.id}`, { method: "PATCH", body: { name: "Ali Student", status: "active", groupId: group.id, agentId: agent.id, totalDue: 2400, paymentPlan: "installments" }, expectedStatus: 200 });
  assert.equal(updated.status, "active");
  assert.equal(updated.totalDue, 2400);
  assert.equal(updated.nextPaymentDate, "2026-10-10");

  await request("/api/students", { method: "POST", body: { groupId: group.id, name: "Second Student", totalDue: 2500 }, expectedStatus: 201 });
  await request("/api/students", { method: "POST", body: { groupId: group.id, name: "Third Student", totalDue: 2500 }, expectedStatus: 400 });

  const snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.groups.length, 1);
  assert.equal(snapshot.students.length, 2);
  assert.equal(snapshot.payments.filter((payment) => payment.studentId === student.id).reduce((sum, payment) => sum + payment.amount, 0), 1500);
  assert.equal(snapshot.events.filter((event) => event.studentId === student.id).length, 4);
});

test("flexible student payment agreements support cash, monthly, and custom splits", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-flex-payments-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const training = await request("/api/programs", { method: "POST", body: { name: "Allemand 5 mois", durationLabel: "5 mois", basePrice: 5000, discountedPrice: 3000 }, expectedStatus: 201 });
  const agent = await request("/api/agents", { method: "POST", body: { name: "SM" }, expectedStatus: 201 });
  const group = await request("/api/groups", { method: "POST", body: { programId: training.id, name: "Groupe flexible", days: "Monday", timeStart: "10:00", timeEnd: "12:00", capacity: 10, price: 5000, discountedPrice: 3000 }, expectedStatus: 201 });

  const paidFull = await request("/api/students", {
    method: "POST",
    body: { groupId: group.id, agentId: agent.id, name: "Cash Student", registeredAt: "2026-09-01", paymentPlan: "paid_full", initialPaid: 3000 },
    expectedStatus: 201,
  });
  assert.equal(paidFull.totalDue, 3000);
  assert.equal(paidFull.paymentPlan, "paid_full");
  assert.equal(paidFull.nextPaymentDate, "");

  const monthly = await request("/api/students", {
    method: "POST",
    body: { groupId: group.id, agentId: agent.id, name: "Monthly Student", registeredAt: "2026-09-01", paymentPlan: "monthly", totalDue: 5000, initialPaid: 1000, paymentStartDate: "2026-09-01", installmentAmount: 1000, installmentsCount: 5 },
    expectedStatus: 201,
  });
  assert.equal(monthly.totalDue, 5000);
  assert.equal(monthly.installmentAmount, 1000);
  assert.equal(monthly.installmentsCount, 5);
  assert.equal(monthly.nextPaymentDate, "2026-10-01");

  const custom = await request("/api/students", {
    method: "POST",
    body: { groupId: group.id, agentId: agent.id, name: "Custom Student", registeredAt: "2026-09-01", paymentPlan: "custom", totalDue: 3000, initialPaid: 1500, nextPaymentDate: "2026-10-01", agreementNote: "1500 now, 1500 next month" },
    expectedStatus: 201,
  });
  assert.equal(custom.paymentPlan, "custom");
  assert.equal(custom.nextPaymentDate, "2026-10-01");
  assert.equal(custom.agreementNote, "1500 now, 1500 next month");

  await request(`/api/students/${monthly.id}/payments`, { method: "POST", body: { amount: 1000, paidAt: "2026-10-01", method: "cash" }, expectedStatus: 201 });
  await request(`/api/students/${custom.id}/payments`, { method: "POST", body: { amount: 1500, paidAt: "2026-10-01", method: "cash" }, expectedStatus: 201 });
  const snapshot = (await request("/api/state")).state;
  const monthlyAfter = snapshot.students.find((student) => student.id === monthly.id);
  const customAfter = snapshot.students.find((student) => student.id === custom.id);
  assert.equal(monthlyAfter.nextPaymentDate, "2026-11-01");
  assert.equal(snapshot.payments.filter((payment) => payment.studentId === custom.id).reduce((sum, payment) => sum + payment.amount, 0), 3000);
  assert.equal(customAfter.nextPaymentDate, "");
});

test("a registered student can be deleted with their payments and events", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-delete-student-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const training = await request("/api/programs", { method: "POST", body: { name: "Compta", monthlyPrice: 5000, discountedPrice: 3000 }, expectedStatus: 201 });
  const group = await request("/api/groups", { method: "POST", body: { programId: training.id, name: "G1", capacity: 5 }, expectedStatus: 201 });
  const student = await request("/api/students", { method: "POST", body: { groupId: group.id, name: "Mistake Student", totalDue: 3000, initialPaid: 500 }, expectedStatus: 201 });

  let snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.students.length, 1);
  assert.ok(snapshot.payments.some((p) => p.studentId === student.id));
  assert.ok(snapshot.events.some((e) => e.studentId === student.id));

  const del = await request(`/api/students/${student.id}`, { method: "DELETE", expectedStatus: 200 });
  assert.equal(del.removed, true);
  assert.equal(del.removedPayments, 1);

  snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.students.length, 0);
  assert.equal(snapshot.payments.filter((p) => p.studentId === student.id).length, 0);
  assert.equal(snapshot.events.filter((e) => e.studentId === student.id).length, 0);

  await request(`/api/students/${student.id}`, { method: "DELETE", expectedStatus: 404 });
});

test("trainings store numeric duration, session rhythm, three prices, and nidam flag", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-training-model-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const training = await request("/api/programs", {
    method: "POST",
    body: { name: "Comptabilité", durationValue: 5, durationUnit: "months", sessionsPerWeek: 3, sessionHours: 2, monthlyPrice: 5000, fullPrice: 4000, discountedPrice: 3000, nidamShift: true },
    expectedStatus: 201,
  });
  assert.equal(training.durationValue, 5);
  assert.equal(training.durationUnit, "months");
  assert.equal(training.durationMonths, 5);
  assert.equal(training.sessionsPerWeek, 3);
  assert.equal(training.sessionHours, 2);
  assert.equal(training.monthlyPrice, 5000);
  assert.equal(training.fullPrice, 4000);
  assert.equal(training.discountedPrice, 3000);
  assert.equal(training.nidamShift, true);

  // A one-year training expands to 12 months.
  const yearly = await request("/api/programs", {
    method: "POST",
    body: { name: "Cursus complet", durationValue: 1, durationUnit: "years" },
    expectedStatus: 201,
  });
  assert.equal(yearly.durationMonths, 12);

  // Editing recomputes the derived duration fields.
  const edited = await request(`/api/programs/${training.id}`, {
    method: "PATCH",
    body: { name: "Comptabilité", durationValue: 3, durationUnit: "months", nidamShift: false },
    expectedStatus: 200,
  });
  assert.equal(edited.durationMonths, 3);
  assert.equal(edited.nidamShift, false);

  // Legacy free-text durations still migrate to numeric fields.
  const legacy = await request("/api/programs", {
    method: "POST",
    body: { name: "RH", durationLabel: "5 mois", basePrice: 2000 },
    expectedStatus: 201,
  });
  assert.equal(legacy.durationValue, 5);
  assert.equal(legacy.durationUnit, "months");
});

test("teacher availability grid toggles weekly slots and date overrides", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-availability-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  // Mark Saturday 09:00-11:00 as unavailable in the weekly default.
  const weekly = await request("/api/availability", {
    method: "POST",
    body: { day: "saturday", timeStart: "09:00", timeEnd: "11:00", available: false },
    expectedStatus: 200,
  });
  assert.equal(weekly.weekly["saturday|09:00|11:00"], false);

  // Override one specific Saturday back to available.
  const withOverride = await request("/api/availability", {
    method: "POST",
    body: { day: "saturday", date: "2026-09-12", timeStart: "09:00", timeEnd: "11:00", available: true },
    expectedStatus: 200,
  });
  assert.equal(withOverride.overrides["2026-09-12"]["09:00|11:00"], true);

  // Invalid input is rejected.
  await request("/api/availability", { method: "POST", body: { day: "notaday", timeStart: "09:00", timeEnd: "11:00" }, expectedStatus: 400 });

  const snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.availability.weekly["saturday|09:00|11:00"], false);
  assert.equal(snapshot.availability.overrides["2026-09-12"]["09:00|11:00"], true);
});

test("groups are name-only containers; sessions are managed on the calendar", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-group-sessions-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const training = await request("/api/programs", { method: "POST", body: { name: "Allemand", sessionsPerWeek: 3, sessionHours: 2, monthlyPrice: 5000 }, expectedStatus: 201 });

  // A group can be created with just a training + name, no time/price required.
  const group = await request("/api/groups", { method: "POST", body: { programId: training.id, name: "Groupe 1" }, expectedStatus: 201 });
  assert.equal(group.name, "Groupe 1");
  assert.deepEqual(group.sessions, []);

  // Sessions are added via the dedicated endpoint.
  const withSessions = await request(`/api/groups/${group.id}/sessions`, {
    method: "POST",
    body: { sessions: [
      { day: "Monday", timeStart: "09:00", timeEnd: "11:00" },
      { day: "wednesday", timeStart: "09:00", timeEnd: "11:00" },
      { day: "Monday", timeStart: "09:00", timeEnd: "11:00" },
    ] },
    expectedStatus: 200,
  });
  assert.equal(withSessions.sessions.length, 2); // duplicate dropped
  assert.deepEqual(withSessions.days, ["monday", "wednesday"]);

  // Legacy day/time payloads still migrate into sessions on create.
  const legacy = await request("/api/groups", { method: "POST", body: { programId: training.id, name: "Groupe 2", days: "Tuesday", timeStart: "18:00", timeEnd: "20:00" }, expectedStatus: 201 });
  assert.deepEqual(legacy.sessions, [{ day: "tuesday", timeStart: "18:00", timeEnd: "20:00" }]);
});

test("goals persist with type, target, and period and are editable/deletable", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-goals-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const goal = await request("/api/goals", { method: "POST", body: { type: "registered", target: 50, from: "2026-09-01", to: "2026-09-30", title: "50 en septembre" }, expectedStatus: 201 });
  assert.equal(goal.type, "registered");
  assert.equal(goal.target, 50);
  assert.equal(goal.from, "2026-09-01");

  // Cost-per-registered and custom goals are accepted.
  await request("/api/goals", { method: "POST", body: { type: "cost_per_registered", target: 200, from: "2026-09-01", to: "2026-09-30" }, expectedStatus: 201 });
  await request("/api/goals", { method: "POST", body: { type: "custom", metric: "visited", target: 100, from: "2026-09-01", to: "2026-09-30" }, expectedStatus: 201 });

  // Validation: target and dates required; custom needs a metric.
  await request("/api/goals", { method: "POST", body: { type: "registered", target: 10 }, expectedStatus: 400 });
  await request("/api/goals", { method: "POST", body: { type: "registered", target: 0, from: "2026-09-01", to: "2026-09-30" }, expectedStatus: 400 });
  await request("/api/goals", { method: "POST", body: { type: "custom", target: 10, from: "2026-09-01", to: "2026-09-30" }, expectedStatus: 400 });

  const edited = await request(`/api/goals/${goal.id}`, { method: "PATCH", body: { target: 60 }, expectedStatus: 200 });
  assert.equal(edited.target, 60);

  await request(`/api/goals/${goal.id}`, { method: "DELETE", expectedStatus: 200 });
  const snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.goals.length, 2);
  assert.ok(!snapshot.goals.some((g) => g.id === goal.id));
});

test("manual budget splits across days, attaches to a level, and is deletable", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-manual-budget-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const agent = await request("/api/agents", { method: "POST", body: { name: "Souad" }, expectedStatus: 201 });

  // Center-wide budget split evenly across two days.
  const centre = await request("/api/manual-budget", { method: "POST", body: { amount: 1000, level: "center", from: "2026-09-06", to: "2026-09-07" }, expectedStatus: 201 });
  assert.equal(centre.days, 2);
  assert.equal(centre.logs.reduce((sum, l) => sum + l.spend, 0), 1000);
  assert.deepEqual(centre.logs.map((l) => l.spend), [500, 500]);

  // Agent-level budget attaches the agentId for ROI.
  const agentBudget = await request("/api/manual-budget", { method: "POST", body: { amount: 600, level: "agent", targetId: agent.id, from: "2026-09-07", to: "2026-09-07" }, expectedStatus: 201 });
  assert.equal(agentBudget.logs[0].agentId, agent.id);

  // Invalid level and missing target are rejected.
  await request("/api/manual-budget", { method: "POST", body: { amount: 100, level: "agent" }, expectedStatus: 400 });
  await request("/api/manual-budget", { method: "POST", body: { amount: 0, level: "center", from: "2026-09-07" }, expectedStatus: 400 });

  const snapshot = (await request("/api/state")).state;
  assert.equal(snapshot.dailyLogs.filter((l) => l.source === "manual").length, 3);

  // Delete the whole agent batch.
  const del = await request(`/api/daily-logs/${agentBudget.batchId}`, { method: "DELETE", expectedStatus: 200 });
  assert.equal(del.removed, 1);
  const after = (await request("/api/state")).state;
  assert.equal(after.dailyLogs.filter((l) => l.source === "manual").length, 2);
});

test("student operations route is locked until CRM auth is configured", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-security-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl } = await startApp(dataFile);
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const routeResponse = await fetch(`${baseUrl}/groups`);
  assert.equal(routeResponse.status, 403);
  const locked = await jsonRequest(baseUrl, "/api/groups", { method: "POST", body: { programId: "missing", days: "Monday", timeStart: "10:00", timeEnd: "12:00" }, expectedStatus: 403 });
  assert.match(locked.error, /Secure login is required/);
});

test("sales login is restricted to its own student operations", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-sales-role-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader, salesAuthHeader } = await startApp(dataFile, { sales: true });
  const admin = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  const sales = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader: salesAuthHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const souad = await admin("/api/agents", { method: "POST", body: { name: "Souad" }, expectedStatus: 201 });
  const hasan = await admin("/api/agents", { method: "POST", body: { name: "Hasan" }, expectedStatus: 201 });
  const training = await admin("/api/programs", { method: "POST", body: { name: "Comptabilité 3 mois" }, expectedStatus: 201 });
  const group = await admin("/api/groups", { method: "POST", body: { programId: training.id, name: "Mardi matin", days: "Mardi", timeStart: "10:00", timeEnd: "12:00", capacity: 5 }, expectedStatus: 201 });
  const ownStudent = await admin("/api/students", { method: "POST", body: { groupId: group.id, agentId: souad.id, name: "Student Souad", phone: "+212600000001", totalDue: 2500 }, expectedStatus: 201 });
  const otherStudent = await admin("/api/students", { method: "POST", body: { groupId: group.id, agentId: hasan.id, name: "Student Hasan", phone: "+212600000002", totalDue: 2500 }, expectedStatus: 201 });
  await admin("/api/campaigns", { method: "POST", body: { programId: training.id, name: "Hidden campaign" }, expectedStatus: 201 });

  const salesSnapshot = await sales("/api/state");
  assert.equal(salesSnapshot.currentUser.role, "sales");
  assert.equal(salesSnapshot.currentUser.agentId, souad.id);
  assert.equal(salesSnapshot.state.students.length, 1);
  assert.equal(salesSnapshot.state.students[0].id, ownStudent.id);
  assert.equal(salesSnapshot.state.groups[0].enrolledCount, 2);
  assert.equal(salesSnapshot.state.campaigns.length, 0);
  assert.equal(salesSnapshot.state.dailyLogs.length, 0);
  assert.equal(salesSnapshot.state.outcomes.length, 0);

  const forcedStudent = await sales("/api/students", { method: "POST", body: { groupId: group.id, agentId: hasan.id, name: "Forced Agent", totalDue: 2000 }, expectedStatus: 201 });
  assert.equal(forcedStudent.agentId, souad.id);
  await sales(`/api/students/${otherStudent.id}`, { method: "PATCH", body: { name: "Blocked", status: "active" }, expectedStatus: 403 });
  await sales("/api/operations/seed-screenshot-schedule", { method: "POST", body: { source: "screenshot" }, expectedStatus: 403 });
  await sales("/api/meta-import", { method: "POST", body: { csv: "Campaign name\nTest" }, expectedStatus: 403 });
  const backupResponse = await fetch(`${baseUrl}/api/backup`, { headers: { Authorization: salesAuthHeader } });
  assert.equal(backupResponse.status, 403);
});

test("screenshot schedule seed creates editable trainings and groups once", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-screenshot-seed-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  const { child, baseUrl, authHeader } = await startApp(dataFile, { auth: true });
  const request = (route, options = {}) => jsonRequest(baseUrl, route, { ...options, authHeader });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  const first = await request("/api/operations/seed-screenshot-schedule", { method: "POST", body: { source: "screenshot" }, expectedStatus: 200 });
  assert.equal(first.result.programsAdded, 4);
  assert.equal(first.result.groupsAdded, 19);
  assert.ok(first.state.programs.some((program) => program.name === "Comptabilité 3 mois"));
  assert.ok(first.state.groups.some((group) => group.sessions.some((s) => s.day === "tuesday" && s.timeStart === "10:00")));

  const second = await request("/api/operations/seed-screenshot-schedule", { method: "POST", body: { source: "screenshot" }, expectedStatus: 200 });
  assert.equal(second.result.programsAdded, 0);
  assert.equal(second.result.groupsAdded, 0);
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
  assert.match(html, /languageSelect/);
  assert.match(html, /العربية/);
  assert.match(html, /userBadge/);
  assert.match(html, /Import &amp; data|Import & data/);
  assert.match(html, /Add outcome/);
  assert.match(html, /Reset CRM data/);
  assert.match(html, /scoringNotice/);
  assert.match(html, /overviewChart/);
  assert.match(html, /periodPreset/);
  assert.match(html, /Last 7 days/);
  assert.match(html, /Lifetime/);
  assert.match(html, /Groupes &amp; paiements/);
  assert.match(html, /operationsKpis/);
  assert.match(html, /groupCards/);
  assert.match(html, /studentRows/);
  assert.match(html, /paymentAlerts/);
  assert.match(html, /studentSecurityWarning/);
  assert.match(html, /plannerSuggestions/);
  assert.match(html, /Nidam shift/);
  assert.match(html, /data-seed-screenshot/);
  assert.match(html, /href="\/groups"/);
  assert.match(html, /<label>/);
  assert.match(app, /const ar =/);
  assert.match(app, /applyLanguage/);
  assert.match(app, /document.documentElement.dir/);
  assert.match(app, /applyRoleAccess/);
  assert.match(app, /currentUser/);
  assert.match(app, /WEEK_DAYS/);
  assert.match(app, /PLANNER_TIME_SLOTS/);
  assert.match(app, /normalizeDayKey/);
  assert.match(app, /plannerSelectedDay/);
  assert.match(app, /planner-calendar/);
  assert.match(app, /planner-day-detail/);
  assert.match(app, /data-planner-day/);
  assert.match(app, /cmcg-visible-columns/);
  assert.match(app, /cmcg-overview-metrics/);
  assert.match(app, /cmcg-report-period/);
  assert.match(app, /applyPeriodPreset/);
  assert.match(app, /periodRange/);
  assert.match(app, /data-kpi-metric/);
  assert.match(app, /costRegisteredEfficiency/);
  assert.match(app, /outcomeHierarchy/);
  assert.match(app, /outcomeCampaign/);
  assert.match(app, /agentEditForm/);
  assert.match(app, /data-edit-agent/);
  assert.match(app, /data-delete-agent/);
  assert.match(app, /trainingForm/);
  assert.match(app, /groupForm/);
  assert.match(app, /studentForm/);
  assert.match(app, /paymentForm/);
  assert.match(app, /payment-agreement-box/);
  assert.match(app, /paid_full/);
  assert.match(app, /paymentPlanHelp/);
  assert.match(app, /installmentAmount/);
  assert.match(app, /installmentsCount/);
  assert.match(app, /nextPaymentDate/);
  assert.match(app, /agreementNote/);
  assert.match(app, /paymentDueStatus/);
  assert.match(app, /syncStudentPaymentFields/);
  assert.match(app, /studentDetailDialog/);
  assert.match(app, /panelFromLocation/);
  assert.match(app, /studentDataUnlocked/);
  assert.match(app, /buildPlannerSuggestions/);
  assert.match(app, /data-create-plan/);
  assert.match(app, /attendanceMode/);
  assert.match(app, /toggleAvailability/);
  assert.match(app, /renderAvailabilityGrid/);
  assert.match(app, /isSlotAvailable/);
  assert.match(app, /renderGroupSessionsPlanner/);
  assert.match(app, /autoDistributeSessions/);
  assert.match(app, /data-toggle-session/);
  assert.match(app, /groupSessions/);
  assert.match(app, /student-progress/);
  assert.match(app, /progress-track/);
  assert.match(app, /data-transfer-group/);
  assert.match(app, /data-change-status/);
  assert.match(app, /quickUpdateStudent/);
  assert.match(app, /renderStudentsPage/);
  assert.match(app, /studentsMatchingFilters/);
  assert.match(app, /agentRevenue/);
  assert.match(app, /potentialRoi/);
  assert.match(app, /roiCell/);
  assert.match(app, /manual-budget/);
  assert.match(app, /renderManualBudget/);
  assert.match(app, /data-delete-budget/);
  assert.match(html, /manualBudgetForm/);
  assert.match(app, /goalProgress/);
  assert.match(app, /renderGoals/);
  assert.match(app, /goal-pace/);
  assert.match(app, /data-open-goal/);
  assert.match(html, /goalForm/);
  assert.match(html, /goalsList/);
  assert.match(app, /renderReport/);
  assert.match(app, /data-delete-student/);
  assert.match(app, /data-print-report/);
  assert.match(html, /data-tab="reports"/);
  assert.match(html, /id="reports"/);
  assert.match(html, /reportAgent/);
  assert.match(app, /data-students-training/);
  assert.match(app, /data-students-filter/);
  assert.match(html, /data-tab="students"/);
  assert.match(html, /id="students"/);
  assert.match(app, /data-toggle-availability/);
  assert.match(app, /trainingMonthlyPrice/);
  assert.match(app, /monthlyPrice/);
  assert.match(app, /sessionsPerWeek/);
  assert.match(app, /nidamShift/);
  assert.match(app, /seed-screenshot-schedule/);
  assert.match(app, /\/api\/agents\/\$\{editingAgentId\}/);
  assert.match(app, /Business quality - highest/);
  assert.match(app, /Automatic scoring is learning/);
  assert.match(app, /reset-data/);
  assert.match(app, /agentClosing/);
  assert.match(app, /مرحباً، أريد معرفة تفاصيل التكوين/);
  assert.doesNotMatch(app, /Ù…Ø/);
});
