process.env.CRM_SHEET_SYNC = "0"; // test servers never call Google
process.env.CRM_PUSH = "0";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildReport, resolvePeriod, toCsv, toMarkdown } = require("../report.js");

function sampleState() {
  const log = (id, creativeId, adSetId, campaignId, date, spend, messages, extra = {}) => ({
    id, source: "meta_csv", creativeId, adSetId, campaignId, accountId: "acc1", date, reportingStart: date, reportingEnd: date,
    spend, messages, impressions: messages * 100, reach: messages * 50, linkClicks: messages * 2, ...extra,
  });
  return {
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD", scoring: {}, profit: { breakEvenCostPerRegistered: 60, dataStartDate: "2026-10-01" } },
    adAccounts: [{ id: "acc1", name: "Fen Nord", metaAccountId: "1" }],
    agents: [{ id: "ag1", name: "Souad" }, { id: "ag2", name: "Hassan" }],
    campaigns: [{ id: "c1", name: "CMCG Traffic", metaCampaignId: "111", objective: "Traffic", accountId: "acc1" }],
    adSets: [
      { id: "s1", name: "Motion \"souad\"", metaAdSetId: "211", campaignId: "c1", agentId: "ag1", agentMatchStatus: "matched" },
      { id: "s2", name: "Motion \"hassan\"", metaAdSetId: "212", campaignId: "c1", agentId: "ag2", agentMatchStatus: "matched" },
      { id: "s3", name: "Mystery", metaAdSetId: "213", campaignId: "c1", agentId: "", agentMatchStatus: "unassigned" },
    ],
    creatives: [
      { id: "a1", name: "Ad one", code: "A1", metaAdId: "311", adSetId: "s1" },
      { id: "a2", name: "Ad two", code: "B2", metaAdId: "312", adSetId: "s2" },
      { id: "a3", name: "=cmd()", code: "C3", metaAdId: "313", adSetId: "s3" },
    ],
    dailyLogs: [
      log("l0", "a1", "s1", "c1", "2026-09-20", 500, 50), // before data start: hidden
      log("l1", "a1", "s1", "c1", "2026-10-05", 40, 20),
      log("l2", "a1", "s1", "c1", "2026-10-06", 40, 20),
      log("l3", "a2", "s2", "c1", "2026-10-06", 150, 30),
      log("l4", "a3", "s3", "c1", "2026-10-07", 30, 5),
      log("l5", "a1", "s1", "c1", "2026-09-30", 80, 30), // previous period, but before data start
    ],
    outcomes: [
      { id: "o1", type: "registered", assignmentLevel: "ad", creativeId: "a1", adSetId: "s1", campaignId: "c1", agentId: "ag1", date: "2026-10-06", sourceDate: "2026-10-05", personName: "Secret Person", phone: "0600" },
      { id: "o2", type: "registered", assignmentLevel: "adSet", creativeId: "", adSetId: "s1", campaignId: "c1", agentId: "ag1", date: "2026-10-07" },
      { id: "o3", type: "booked", assignmentLevel: "adSet", creativeId: "", adSetId: "s2", campaignId: "c1", agentId: "ag2", date: "2026-10-06" },
      { id: "o4", type: "showed", assignmentLevel: "campaign", creativeId: "", adSetId: "", campaignId: "c1", agentId: "", date: "2026-10-07" },
    ],
    programs: [{ id: "p1", name: "Comptabilite", monthlyPrice: 500, fullPrice: 3000, discountedPrice: 2500 }],
    groups: [{ id: "g1", name: "Morning", programId: "p1", capacity: 10 }],
    students: [
      { id: "st1", name: "Ali", phone: "0611", groupId: "g1", programId: "p1", agentId: "ag1", registeredAt: "2026-10-06", totalDue: 2500, status: "registered", paymentPlan: "monthly", nextPaymentDate: "2026-10-01" },
    ],
    payments: [{ id: "pay1", studentId: "st1", amount: 1000, paidAt: "2026-10-06", method: "cash" }],
    imports: [],
  };
}

test("periods resolve daily, weekly, monthly and custom ranges", () => {
  assert.deepEqual(resolvePeriod({ preset: "yesterday", today: "2026-10-08" }), { preset: "yesterday", today: "2026-10-08", from: "2026-10-07", to: "2026-10-07" });
  assert.deepEqual(resolvePeriod({ preset: "lastWeek", today: "2026-10-08" }).from, "2026-09-28"); // Thursday -> previous Monday..Sunday
  assert.deepEqual(resolvePeriod({ preset: "lastWeek", today: "2026-10-08" }).to, "2026-10-04");
  assert.equal(resolvePeriod({ preset: "thisWeek", today: "2026-10-04" }).from, "2026-09-28"); // Sunday belongs to the week starting Monday
  assert.deepEqual(resolvePeriod({ preset: "lastMonth", today: "2026-10-08" }), { preset: "lastMonth", today: "2026-10-08", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(resolvePeriod({ from: "2026-10-09", to: "2026-10-01", today: "2026-10-10" }), { preset: "custom", today: "2026-10-10", from: "2026-10-01", to: "2026-10-09" });
  assert.equal(resolvePeriod({ today: "2026-10-08" }).from, "2026-10-02");
});

test("report aggregates ads, agents, outcomes and school data like the UI", () => {
  const report = buildReport(sampleState(), { from: "2026-10-05", to: "2026-10-07", today: "2026-10-08" });
  assert.equal(report.meta.period.days, 3);
  assert.deepEqual(report.meta.previousPeriod, { from: "2026-10-02", to: "2026-10-04", days: 3 });
  assert.equal(report.comparison.spend.previous, 0);
  // A previous window entirely before the data start date is not compared.
  assert.equal(buildReport(sampleState(), { from: "2026-10-01", to: "2026-10-03", today: "2026-10-08" }).meta.previousPeriod, null);
  assert.equal(report.summary.spend, 260);
  assert.equal(report.summary.messages, 75);
  assert.equal(report.summary.registered, 2);
  assert.equal(report.summary.visits, 3);
  assert.equal(report.summary.costPerRegistered, 130);
  // Default revenue: 3000 DH per student, 1 USD-equivalent of spend = 10 DH.
  assert.equal(report.summary.estimatedRevenue, 6000);
  assert.equal(report.summary.profitAfterAds, 6000 - 2600);
  assert.equal(report.meta.revenuePerRegistered, 3000);
  assert.equal(report.daily.length, 3);
  assert.equal(report.daily[1].spend, 190);

  const souadSet = report.adSets.find((row) => row.id === "s1");
  assert.equal(souadSet.registered, 2);
  assert.equal(souadSet.costPerRegistered, 40);
  assert.equal(souadSet.verdict.key, "profit");
  assert.equal(souadSet.metaId, "211");
  assert.equal(souadSet.daily.length, 3);
  // Ad level only counts outcomes attributed to the ad itself.
  assert.equal(report.ads.find((row) => row.id === "a1").registered, 1);
  // Campaign rolls everything up, including the campaign-level visit.
  const campaign = report.campaigns[0];
  assert.equal(campaign.registered, 2);
  assert.equal(campaign.showed, 1);
  assert.equal(campaign.spend, 260);

  const souad = report.agents.find((row) => row.name === "Souad");
  assert.equal(souad.registered, 2);
  assert.equal(souad.school.studentsRegisteredInPeriod, 1);
  assert.equal(souad.school.collectedInPeriod, 1000);
  assert.equal(souad.school.overdueStudents, 1);
  assert.equal(souad.ranks.registered, 1);
  const unassigned = report.agents.find((row) => row.name === "Unassigned");
  assert.equal(unassigned.spend, 30);

  assert.equal(report.finance.collectedInPeriod, 1000);
  assert.equal(report.finance.outstandingBalance, 1500);
  assert.equal(report.students[0].dueState, "overdue");
  assert.equal(report.students[0].name, undefined); // no personal data by default
  assert.equal(report.outcomes[0].person, undefined);
  assert.equal(report.outcomes.find((o) => o.id === "o1").lagDays, 1);

  assert.ok(report.insights.some((item) => item.category === "data" && item.name === "Mystery"));
  assert.ok(report.insights.some((item) => item.category === "payments"));
  assert.ok(report.insights.some((item) => item.category === "cut" && item.name === "Motion \"hassan\""));
});

test("report can include personal data and pre-start data on request", () => {
  const report = buildReport(sampleState(), { preset: "lifetime", today: "2026-10-08", includePersonal: true, respectDataStart: false });
  assert.equal(report.summary.spend, 840);
  assert.equal(report.students[0].name, "Ali");
  assert.equal(report.outcomes.find((o) => o.id === "o1").person, "Secret Person");
  const october = buildReport(sampleState(), { from: "2026-10-06", to: "2026-10-07", today: "2026-10-08" });
  assert.equal(october.meta.previousPeriod.from, "2026-10-04");
  assert.equal(october.comparison.spend.previous, 40);
});

test("CSV export neutralizes formulas and markdown is AI-ready", () => {
  const report = buildReport(sampleState(), { preset: "last7", today: "2026-10-08" });
  const adsCsv = toCsv(report, "ads");
  assert.ok(adsCsv.includes("'=cmd()"));
  assert.ok(!/(^|,)=cmd/m.test(adsCsv));
  const all = toCsv(report);
  ["### SUMMARY", "### ADSETS", "### AGENTS", "### STUDENTS", "### INSIGHTS"].forEach((title) => assert.ok(all.includes(title), title));
  assert.throws(() => toCsv(report, "nope"), /Unknown table/);
  const md = toMarkdown(report);
  ["## Summary", "## Ad sets", "## Agents", "Action plan", "| 211 |", "## Rule-based decisions", "Est. revenue (DH)"].forEach((part) => assert.ok(md.includes(part), part));
});

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

test("report endpoint serves json, csv and markdown to admins only", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmcg-report-test-"));
  const dataFile = path.join(tempDir, "crm.json");
  fs.writeFileSync(dataFile, JSON.stringify(sampleState()));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), CRM_DATA_FILE: dataFile, CRM_USER: "admin", CRM_PASSWORD: "pw", CRM_SALES_USER: "sales", CRM_SALES_PASSWORD: "spw", CRM_SALES_AGENT: "Souad", DB_HOST: "", DB_USER: "", DB_PASSWORD: "", DB_NAME: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { child.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timed out")), 5000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("CMCG CRM running")) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const admin = { Authorization: `Basic ${Buffer.from("admin:pw").toString("base64")}` };
  const sales = { Authorization: `Basic ${Buffer.from("sales:spw").toString("base64")}` };

  const jsonResponse = await fetch(`${base}/api/report?from=2026-10-05&to=2026-10-07`, { headers: admin });
  assert.equal(jsonResponse.status, 200);
  const report = await jsonResponse.json();
  assert.equal(report.summary.spend, 260);
  assert.equal(report.students[0].name, undefined);

  const personal = await (await fetch(`${base}/api/report?from=2026-10-05&to=2026-10-07&personal=1`, { headers: admin })).json();
  assert.equal(personal.students[0].name, "Ali");

  const csv = await fetch(`${base}/api/report?from=2026-10-05&to=2026-10-07&format=csv&table=adsets&download=1`, { headers: admin });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /cmcg-report-2026-10-05_2026-10-07-adsets\.csv/);
  assert.match(await csv.text(), /Motion/);

  const md = await fetch(`${base}/api/report?preset=lifetime&format=md`, { headers: admin });
  assert.match(md.headers.get("content-type"), /markdown/);
  assert.match(await md.text(), /## Agents/);

  assert.equal((await fetch(`${base}/api/report?format=xml`, { headers: admin })).status, 400);
  assert.equal((await fetch(`${base}/api/report`, { headers: sales })).status, 403);
  assert.equal((await fetch(`${base}/api/report`)).status, 401);
});
