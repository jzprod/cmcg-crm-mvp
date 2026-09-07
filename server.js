const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createStorage } = require("./storage");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.CRM_DATA_FILE || path.join(__dirname, "data", "crm.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const OPERATIONS_ROUTES = new Set(["/groups", "/students", "/operations", "/planning"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const DEFAULT_SCORING = {
  closingWindowDays: 7,
  targetShowRate: 60,
  targetCloseRate: 40,
};

function finiteNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function normalizeScoringSettings(input = {}) {
  const closingWindowDays = Math.round(finiteNumber(input.closingWindowDays)) || DEFAULT_SCORING.closingWindowDays;
  const targetShowRate = finiteNumber(input.targetShowRate) || DEFAULT_SCORING.targetShowRate;
  const targetCloseRate = finiteNumber(input.targetCloseRate) || DEFAULT_SCORING.targetCloseRate;
  return {
    closingWindowDays: Math.min(90, Math.max(1, closingWindowDays)),
    targetShowRate: Math.min(100, Math.max(1, targetShowRate)),
    targetCloseRate: Math.min(100, Math.max(1, targetCloseRate)),
  };
}

function emptyState() {
  return {
    meta: { schemaVersion: 4, updatedAt: null },
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD", scoring: { ...DEFAULT_SCORING } },
    adAccounts: [],
    programs: [],
    groups: [],
    students: [],
    payments: [],
    agents: [],
    campaigns: [],
    adSets: [],
    creatives: [],
    usedCreativeCodes: [],
    imports: [],
    outcomes: [],
    leads: [],
    dailyLogs: [],
    events: [],
  };
}

function normalizeState(input) {
  const base = emptyState();
  const state = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  state.meta = { ...base.meta, ...(state.meta || {}) };
  state.centre = { ...base.centre, ...(state.centre || {}) };
  state.settings = { ...base.settings, ...(state.settings || {}) };
  state.settings.scoring = normalizeScoringSettings({
    closingWindowDays: state.settings.closingWindowDays,
    targetShowRate: state.settings.targetShowRate,
    targetCloseRate: state.settings.targetCloseRate,
    ...(state.settings.scoring || {}),
  });
  ["adAccounts", "programs", "groups", "students", "payments", "agents", "campaigns", "adSets", "creatives", "imports", "outcomes", "leads", "dailyLogs", "events"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
  state.meta.schemaVersion = 4;
  const usedCodes = new Set(
    (Array.isArray(state.usedCreativeCodes) ? state.usedCreativeCodes : [])
      .map(normalizeCode)
      .filter(Boolean),
  );
  state.creatives.forEach((creative) => {
    const code = normalizeCode(creative.code);
    if (code) usedCodes.add(code);
  });
  state.usedCreativeCodes = [...usedCodes];
  state.groups.forEach((group) => {
    group.days = Array.isArray(group.days) ? group.days : splitDays(group.days);
    group.attendanceMode = group.attendanceMode === "flexible_shift" ? "flexible_shift" : "fixed";
    group.alternateDays = Array.isArray(group.alternateDays) ? group.alternateDays : splitDays(group.alternateDays);
    group.alternateTimeStart = cleanText(group.alternateTimeStart);
    group.alternateTimeEnd = cleanText(group.alternateTimeEnd);
    if (group.attendanceMode !== "flexible_shift") {
      group.alternateDays = [];
      group.alternateTimeStart = "";
      group.alternateTimeEnd = "";
    }
  });
  return state;
}

const storage = createStorage({ dataFile: DATA_FILE, createEmptyState: emptyState, normalizeState });
let storageReady = false;
let storageError = null;

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return cleanText(value).toUpperCase();
}

function makeCode(state) {
  const usedCodes = new Set(state.usedCreativeCodes.map(normalizeCode));

  for (const length of [2, 3]) {
    const available = [];
    const total = 36 ** length;
    for (let value = 0; value < total; value += 1) {
      const code = value.toString(36).toUpperCase().padStart(length, "0");
      if (!/[A-Z]/.test(code) || !/[0-9]/.test(code) || usedCodes.has(code)) continue;
      available.push(code);
    }
    if (available.length) return available[crypto.randomInt(available.length)];
  }

  throw new Error("All available creative codes have been used");
}

function securityHeaders(headers = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "SAMEORIGIN",
    ...headers,
  };
}

function json(res, status, data) {
  res.writeHead(status, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function downloadJson(res, state) {
  const date = new Date().toISOString().slice(0, 10);
  res.writeHead(200, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="cmcg-crm-backup-${date}.json"`,
    "Cache-Control": "no-store",
  }));
  res.end(JSON.stringify(state, null, 2));
}

function hasAuth() {
  return Boolean(process.env.CRM_USER && process.env.CRM_PASSWORD);
}

function authorized(req) {
  if (!hasAuth()) return true;
  const header = req.headers.authorization || "";
  const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return decoded === `${process.env.CRM_USER}:${process.env.CRM_PASSWORD}`;
}

function requireAuth(req, res) {
  if (authorized(req)) return true;
  res.writeHead(401, securityHeaders({
    "WWW-Authenticate": 'Basic realm="CMCG CRM"',
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end("Authentication required");
  return false;
}

function hasSensitiveStudentData(state) {
  return Boolean(
    state.groups.length
    || state.students.length
    || state.payments.length
    || state.events.some((event) => event.studentId),
  );
}

function publicStateWithoutStudentData(state) {
  const safe = JSON.parse(JSON.stringify(state));
  safe.groups = [];
  safe.students = [];
  safe.payments = [];
  safe.events = safe.events.filter((event) => !event.studentId);
  safe.meta = { ...safe.meta, sensitiveDataLocked: true };
  return safe;
}

function isSensitiveStudentApiPath(pathname) {
  return /^\/api\/(?:groups|students)(?:\/|$)/.test(pathname);
}

function requireConfiguredAuthForStudentData(res, pathname) {
  if (hasAuth() || !isSensitiveStudentApiPath(pathname)) return true;
  return json(res, 403, {
    error: "Secure login is required before saving student, group, or payment data. Add CRM_USER and CRM_PASSWORD in Hostinger environment variables, then restart the app.",
  });
}

function sendOperationsLockedPage(res) {
  res.writeHead(403, securityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMCG CRM locked</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:grid;min-height:100vh;place-items:center"><main style="max-width:640px;padding:28px"><p style="color:#86efac;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Secure area locked</p><h1>Student operations need CRM login first.</h1><p style="color:#cbd5e1;line-height:1.6">Add <strong>CRM_USER</strong> and <strong>CRM_PASSWORD</strong> in Hostinger environment variables, restart the app, then open this page again.</p></main></body></html>`);
}

function serveStatic(req, res) {
  const requested = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = requested === "/" || OPERATIONS_ROUTES.has(requested) ? "/index.html" : requested;
  const filePath = path.resolve(PUBLIC_DIR, `.${safePath}`);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      return res.end("Not found");
    }
    res.writeHead(200, securityHeaders({
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    }));
    res.end(content);
  });
}

function addEvent(state, leadId, type, details = {}) {
  state.events.push({ id: id("evt"), leadId, type, details, createdAt: now() });
}

function addStudentEvent(state, studentId, type, details = {}) {
  state.events.push({ id: id("evt"), studentId, type, details, createdAt: now() });
}

function validDateInput(value) {
  const text = cleanText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function wholeNumber(value, fallback = 0) {
  const number = Math.round(finiteNumber(value));
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeMoney(value) {
  return Math.max(0, finiteNumber(value));
}

function splitDays(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(",").map((item) => cleanText(item)).filter(Boolean);
}

function paidForStudent(state, studentId) {
  return state.payments.filter((payment) => payment.studentId === studentId).reduce((sum, payment) => sum + finiteNumber(payment.amount), 0);
}

function activeStudentsInGroup(state, groupId, exceptStudentId = "") {
  return state.students.filter((student) => student.groupId === groupId && student.id !== exceptStudentId && student.status !== "cancelled");
}

let mutationTail = Promise.resolve();

async function acquireMutationLock() {
  const previous = mutationTail;
  let release;
  mutationTail = new Promise((resolve) => { release = resolve; });
  await previous;
  return release;
}

function duplicateName(items, name) {
  const normalized = cleanText(name).toLocaleLowerCase();
  return items.some((item) => cleanText(item.name).toLocaleLowerCase() === normalized);
}

function numeric(value) {
  const cleaned = cleanText(value).replaceAll(",", "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift().map(cleanText);
  return rows.filter((values) => values.some((value) => cleanText(value))).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

function normalizeForMatch(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
}

function agentMatchesAdSet(agentName, adSetName) {
  const needle = normalizeForMatch(agentName);
  const haystack = normalizeForMatch(adSetName);
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(haystack);
}

function matchAgent(state, adSetName) {
  const matches = state.agents.filter((agent) => agent.active !== false && agentMatchesAdSet(agent.name, adSetName));
  if (matches.length === 1) return { agentId: matches[0].id, agentMatchStatus: "matched", agentMatchCandidates: [] };
  if (matches.length > 1) return { agentId: "", agentMatchStatus: "ambiguous", agentMatchCandidates: matches.map((agent) => agent.id) };
  return { agentId: "", agentMatchStatus: "unassigned", agentMatchCandidates: [] };
}

function rematchImportedAdSets(state) {
  state.adSets.filter((adSet) => adSet.metaAdSetId).forEach((adSet) => Object.assign(adSet, matchAgent(state, adSet.name)));
}

function getOrCreateByExternalId(items, externalField, externalId, prefix, defaults) {
  let item = items.find((candidate) => cleanText(candidate[externalField]) === cleanText(externalId));
  const created = !item;
  if (!item) {
    item = { id: id(prefix), [externalField]: cleanText(externalId), createdAt: now(), ...defaults };
    items.push(item);
  }
  return { item, created };
}

function currencyFromHeader(header) {
  const match = cleanText(header).match(/\(([A-Z]{3})\)\s*$/);
  return match?.[1] || "USD";
}

function normalizeReportDate(value) {
  const text = cleanText(value);
  if (!text) return "";
  const iso = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const named = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[-\s_]+(\d{1,2})[-,\s_]+(\d{4})\b/i);
  if (!named) return "";
  const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };
  return `${named[3]}-${months[named[1].toLocaleLowerCase()]}-${named[2].padStart(2, "0")}`;
}

function datesFromFilename(filename) {
  const text = cleanText(filename).replace(/[._]/g, "-");
  const matches = [...text.matchAll(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[-\s_]+\d{1,2}[-,\s_]+\d{4})\b/gi)]
    .map((match) => normalizeReportDate(match[0]))
    .filter(Boolean);
  if (!matches.length) return { startDate: "", endDate: "" };
  return { startDate: matches[0], endDate: matches[1] || matches[0] };
}

function importMetaCsv(state, csv, filename) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("The CSV report does not contain any ad rows");
  const headers = Object.keys(rows[0]);
  const spendHeader = headers.find((header) => /^Amount spent(?:\s*\([A-Z]{3}\))?$/i.test(header));
  const required = ["Campaign name", "Ad set name", "Ad name", "Objective", "Account ID", "Campaign ID", "Ad set ID", "Ad ID", "Messaging conversations started"];
  const missing = required.filter((header) => !headers.includes(header));
  if (!spendHeader) missing.push("Amount spent (currency)");
  const filenameDates = datesFromFilename(filename);
  if ((!headers.includes("Reporting starts") || !headers.includes("Reporting ends")) && (!filenameDates.startDate || !filenameDates.endDate)) {
    missing.push("Reporting starts/ends columns or report date in filename");
  }
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  const importId = id("imp");
  const importedAt = now();
  const summary = { rows: 0, campaignsAdded: 0, adSetsAdded: 0, adsAdded: 0, metricsAdded: 0, metricsUpdated: 0, skipped: 0 };
  const seenMetricKeys = new Set();
  const currency = currencyFromHeader(spendHeader);

  rows.forEach((row) => {
    if (cleanText(row["Delivery level"]) && normalizeForMatch(row["Delivery level"]) !== "ad") {
      summary.skipped += 1;
      return;
    }
    const accountExternalId = cleanText(row["Account ID"]);
    const campaignExternalId = cleanText(row["Campaign ID"]);
    const adSetExternalId = cleanText(row["Ad set ID"]);
    const adExternalId = cleanText(row["Ad ID"]);
    const startDate = normalizeReportDate(row["Reporting starts"]) || filenameDates.startDate;
    const endDate = normalizeReportDate(row["Reporting ends"]) || filenameDates.endDate || startDate;
    if (!accountExternalId || !campaignExternalId || !adSetExternalId || !adExternalId || !startDate || !endDate) {
      summary.skipped += 1;
      return;
    }

    const accountResult = getOrCreateByExternalId(state.adAccounts, "metaAccountId", accountExternalId, "acc", {});
    Object.assign(accountResult.item, { name: cleanText(row["Account name"]) || accountResult.item.name || "Meta ad account", updatedAt: importedAt });

    const campaignResult = getOrCreateByExternalId(state.campaigns, "metaCampaignId", campaignExternalId, "cmp", {});
    if (campaignResult.created) summary.campaignsAdded += 1;
    Object.assign(campaignResult.item, {
      accountId: accountResult.item.id,
      name: cleanText(row["Campaign name"]),
      objective: cleanText(row.Objective),
      deliveryStatus: cleanText(row["Campaign delivery"] || row["Delivery status"]),
      updatedAt: importedAt,
      lastSeenAt: importedAt,
    });

    const adSetResult = getOrCreateByExternalId(state.adSets, "metaAdSetId", adSetExternalId, "ads", {});
    if (adSetResult.created) summary.adSetsAdded += 1;
    Object.assign(adSetResult.item, {
      campaignId: campaignResult.item.id,
      name: cleanText(row["Ad set name"]),
      objective: cleanText(row.Objective),
      deliveryStatus: cleanText(row["Ad Set delivery"] || row["Delivery status"]),
      updatedAt: importedAt,
      lastSeenAt: importedAt,
      ...matchAgent(state, row["Ad set name"]),
    });

    const creativeResult = getOrCreateByExternalId(state.creatives, "metaAdId", adExternalId, "crt", { code: "" });
    if (creativeResult.created) {
      creativeResult.item.code = makeCode(state);
      state.usedCreativeCodes.push(creativeResult.item.code);
      summary.adsAdded += 1;
    }
    Object.assign(creativeResult.item, {
      adSetId: adSetResult.item.id,
      name: cleanText(row["Ad name"]),
      deliveryStatus: cleanText(row["Delivery status"]),
      deliveryLevel: cleanText(row["Delivery level"]),
      pageId: cleanText(row["Page ID"]),
      updatedAt: importedAt,
      lastSeenAt: importedAt,
    });

    const metricKey = `${creativeResult.item.id}|${startDate}|${endDate}`;
    if (seenMetricKeys.has(metricKey)) {
      summary.skipped += 1;
      return;
    }
    seenMetricKeys.add(metricKey);
    let metric = state.dailyLogs.find((log) => log.source === "meta_csv" && log.creativeId === creativeResult.item.id
      && log.reportingStart === startDate && log.reportingEnd === endDate);
    if (!metric) {
      metric = { id: id("log"), source: "meta_csv", creativeId: creativeResult.item.id, createdAt: importedAt };
      state.dailyLogs.push(metric);
      summary.metricsAdded += 1;
    } else {
      summary.metricsUpdated += 1;
    }
    Object.assign(metric, {
      importId,
      date: startDate,
      reportingStart: startDate,
      reportingEnd: endDate,
      adSetId: adSetResult.item.id,
      campaignId: campaignResult.item.id,
      accountId: accountResult.item.id,
      spend: numeric(row[spendHeader]),
      currency,
      messages: numeric(row["Messaging conversations started"]),
      messagesReplied: numeric(row["Messaging conversations replied"]),
      results: numeric(row.Results),
      resultType: cleanText(row["Result type"]),
      impressions: numeric(row.Impressions),
      reach: numeric(row.Reach),
      frequency: numeric(row.Frequency),
      linkClicks: numeric(row["Link clicks"]),
      shopClicks: numeric(row["Shop clicks"]),
      clicksAll: numeric(row["Clicks (all)"]),
      landingPageViews: numeric(row["Landing page views"]),
      qualityRanking: cleanText(row["Quality ranking"]),
      engagementRanking: cleanText(row["Engagement rate ranking"]),
      conversionRanking: cleanText(row["Conversion rate ranking"]),
      raw: row,
      updatedAt: importedAt,
    });
    summary.rows += 1;
  });

  if (!summary.rows) throw new Error("No valid ad-level rows were found in this report");
  state.settings.currency = currency;
  state.imports.unshift({ id: importId, filename: cleanText(filename) || "Meta Ads report.csv", importedAt, currency, ...summary });
  state.imports = state.imports.slice(0, 100);
  return state.imports[0];
}

function resolveOutcomeTarget(state, level, targetId) {
  const result = { creativeId: "", adSetId: "", campaignId: "", agentId: "" };
  if (level === "ad") {
    const creative = state.creatives.find((item) => item.id === targetId);
    if (!creative) return null;
    const adSet = state.adSets.find((item) => item.id === creative.adSetId);
    const campaign = state.campaigns.find((item) => item.id === adSet?.campaignId);
    Object.assign(result, { creativeId: creative.id, adSetId: adSet?.id || "", campaignId: campaign?.id || "", agentId: adSet?.agentId || "" });
  } else if (level === "adSet") {
    const adSet = state.adSets.find((item) => item.id === targetId);
    if (!adSet) return null;
    Object.assign(result, { adSetId: adSet.id, campaignId: adSet.campaignId || "", agentId: adSet.agentId || "" });
  } else if (level === "campaign") {
    const campaign = state.campaigns.find((item) => item.id === targetId);
    if (!campaign) return null;
    result.campaignId = campaign.id;
  } else if (level === "agent") {
    const agent = state.agents.find((item) => item.id === targetId);
    if (!agent) return null;
    result.agentId = agent.id;
  } else {
    return null;
  }
  return result;
}

async function handleApi(req, res) {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (!storageReady) {
    return json(res, 503, {
      ok: false,
      error: storageError
        ? "Database connection unavailable. Check the Hostinger database credentials and restart the app."
        : "CRM storage is starting. Try again in a moment.",
    });
  }

  const releaseMutation = method === "GET" ? null : await acquireMutationLock();

  try {
    let state = await storage.read();
    if (method === "GET" && url.pathname === "/api/state") {
      const sensitiveLocked = !hasAuth() && hasSensitiveStudentData(state);
      return json(res, 200, {
        state: sensitiveLocked ? publicStateWithoutStudentData(state) : state,
        authEnabled: hasAuth(),
        sensitiveLocked,
        security: { operationsPath: "/groups", studentDataRequiresAuth: true },
        storage: storage.info(),
      });
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        storage: storage.info(),
        updatedAt: state.meta.updatedAt,
        counts: {
          accounts: state.adAccounts.length,
          programs: state.programs.length,
          groups: state.groups.length,
          students: state.students.length,
          payments: state.payments.length,
          agents: state.agents.length,
          campaigns: state.campaigns.length,
          adSets: state.adSets.length,
          creatives: state.creatives.length,
          outcomes: state.outcomes.length,
          imports: state.imports.length,
          leads: state.leads.length,
          dailyLogs: state.dailyLogs.length,
        },
      });
    }

    if (method === "GET" && url.pathname === "/api/backup") {
      if (!hasAuth() && hasSensitiveStudentData(state)) {
        return json(res, 403, { error: "Configure CRM_USER and CRM_PASSWORD before downloading backups that contain student data." });
      }
      return downloadJson(res, state);
    }

    if (method !== "GET" && !requireConfiguredAuthForStudentData(res, url.pathname)) return;

    if (method === "POST" && url.pathname === "/api/restore") {
      const body = await parseBody(req);
      const restored = normalizeState(body.state || body);
      const entityCount = restored.programs.length + restored.agents.length + restored.campaigns.length
        + restored.groups.length + restored.students.length + restored.payments.length
        + restored.adSets.length + restored.creatives.length + restored.leads.length + restored.dailyLogs.length;
      if (!entityCount) return json(res, 400, { error: "This backup does not contain CRM records" });
      restored.meta.restoredAt = now();
      await storage.write(restored);
      return json(res, 200, { restored: true, state: restored });
    }

    if (method === "POST" && url.pathname === "/api/settings/scoring") {
      const body = await parseBody(req);
      const scoring = normalizeScoringSettings(body);
      state.settings.scoring = scoring;
      await storage.write(state);
      return json(res, 200, { settings: state.settings });
    }

    if (method === "POST" && url.pathname === "/api/reset-data") {
      const reset = emptyState();
      reset.centre = { ...reset.centre, ...(state.centre || {}) };
      reset.settings = { ...reset.settings, currency: state.settings?.currency || reset.settings.currency };
      reset.meta.resetAt = now();
      await storage.write(reset);
      return json(res, 200, { reset: true, state: reset });
    }

    if (method === "POST" && url.pathname === "/api/meta-import") {
      const body = await parseBody(req);
      if (!cleanText(body.csv)) return json(res, 400, { error: "Choose a Meta Ads CSV report" });
      const result = importMetaCsv(state, body.csv, body.filename);
      await storage.write(state);
      return json(res, 200, { result, state });
    }

    if (method === "POST" && url.pathname === "/api/outcomes") {
      const body = await parseBody(req);
      const type = cleanText(body.type);
      const assignmentLevel = cleanText(body.assignmentLevel);
      const targetId = cleanText(body.targetId);
      if (!new Set(["booked", "showed", "registered"]).has(type)) {
        return json(res, 400, { error: "Choose registered, booked appointment, or showed without registering" });
      }
      const target = resolveOutcomeTarget(state, assignmentLevel, targetId);
      if (!target) return json(res, 400, { error: "Choose a valid ad, ad set, campaign, or agent" });
      const item = {
        id: id("out"),
        type,
        assignmentLevel,
        targetId,
        ...target,
        personName: cleanText(body.personName),
        phone: cleanText(body.phone),
        date: cleanText(body.date) || new Date().toISOString().slice(0, 10),
        sourceDate: cleanText(body.sourceDate),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return json(res, 400, { error: "Choose a valid outcome date" });
      if (item.sourceDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.sourceDate)) return json(res, 400, { error: "Choose a valid first contact date" });
      state.outcomes.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    const outcomeMatch = url.pathname.match(/^\/api\/outcomes\/([^/]+)$/);
    if (method === "DELETE" && outcomeMatch) {
      const index = state.outcomes.findIndex((item) => item.id === outcomeMatch[1]);
      if (index === -1) return json(res, 404, { error: "Outcome not found" });
      const [removed] = state.outcomes.splice(index, 1);
      await storage.write(state);
      return json(res, 200, { removed: true, outcome: removed });
    }

    if (method === "POST" && url.pathname === "/api/programs") {
      const body = await parseBody(req);
      const item = {
        id: id("prg"),
        name: cleanText(body.name),
        durationLabel: cleanText(body.durationLabel),
        durationMonths: wholeNumber(body.durationMonths),
        basePrice: nonNegativeMoney(body.basePrice),
        discountedPrice: nonNegativeMoney(body.discountedPrice),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      if (!item.name) return json(res, 400, { error: "Program name is required" });
      if (duplicateName(state.programs, item.name)) return json(res, 409, { error: "This training already exists" });
      state.programs.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    const programMatch = url.pathname.match(/^\/api\/programs\/([^/]+)$/);
    if (method === "PATCH" && programMatch) {
      const body = await parseBody(req);
      const program = state.programs.find((item) => item.id === programMatch[1]);
      if (!program) return json(res, 404, { error: "Training not found" });
      const nextName = cleanText(body.name);
      if (!nextName) return json(res, 400, { error: "Training name is required" });
      if (duplicateName(state.programs.filter((item) => item.id !== program.id), nextName)) {
        return json(res, 409, { error: "This training already exists" });
      }
      program.name = nextName;
      program.durationLabel = cleanText(body.durationLabel);
      program.durationMonths = wholeNumber(body.durationMonths);
      program.basePrice = nonNegativeMoney(body.basePrice);
      program.discountedPrice = nonNegativeMoney(body.discountedPrice);
      program.notes = cleanText(body.notes);
      program.updatedAt = now();
      await storage.write(state);
      return json(res, 200, program);
    }

    if (method === "POST" && url.pathname === "/api/groups") {
      const body = await parseBody(req);
      const programId = cleanText(body.programId || body.trainingId);
      const program = state.programs.find((item) => item.id === programId);
      const days = splitDays(body.days);
      const attendanceMode = cleanText(body.attendanceMode) === "flexible_shift" ? "flexible_shift" : "fixed";
      const item = {
        id: id("grp"),
        programId,
        name: cleanText(body.name),
        durationLabel: cleanText(body.durationLabel || program?.durationLabel),
        days,
        timeStart: cleanText(body.timeStart),
        timeEnd: cleanText(body.timeEnd),
        attendanceMode,
        alternateDays: attendanceMode === "flexible_shift" ? splitDays(body.alternateDays || body.days) : [],
        alternateTimeStart: attendanceMode === "flexible_shift" ? cleanText(body.alternateTimeStart) : "",
        alternateTimeEnd: attendanceMode === "flexible_shift" ? cleanText(body.alternateTimeEnd) : "",
        startDate: validDateInput(body.startDate),
        endDate: validDateInput(body.endDate),
        capacity: Math.max(1, wholeNumber(body.capacity, 20)),
        price: nonNegativeMoney(body.price || program?.discountedPrice || program?.basePrice),
        discountedPrice: nonNegativeMoney(body.discountedPrice),
        status: cleanText(body.status || "active"),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      if (!program) return json(res, 400, { error: "Choose a valid training" });
      if (!item.name) item.name = `${program.name} ${item.timeStart || ""}`.trim();
      if (!item.days.length || !item.timeStart || !item.timeEnd) return json(res, 400, { error: "Group days, start time, and end time are required" });
      if (item.attendanceMode === "flexible_shift" && (!item.alternateDays.length || !item.alternateTimeStart || !item.alternateTimeEnd)) {
        return json(res, 400, { error: "Nidam shift needs alternate days, start time, and end time" });
      }
      if (!new Set(["active", "full", "paused", "done"]).has(item.status)) return json(res, 400, { error: "Invalid group status" });
      state.groups.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (method === "PATCH" && groupMatch) {
      const body = await parseBody(req);
      const group = state.groups.find((item) => item.id === groupMatch[1]);
      if (!group) return json(res, 404, { error: "Group not found" });
      const programId = cleanText(body.programId || group.programId);
      const program = state.programs.find((item) => item.id === programId);
      if (!program) return json(res, 400, { error: "Choose a valid training" });
      const capacity = Math.max(1, wholeNumber(body.capacity, group.capacity || 20));
      if (capacity < activeStudentsInGroup(state, group.id).length) return json(res, 400, { error: "Capacity cannot be lower than enrolled students" });
      group.programId = programId;
      group.name = cleanText(body.name) || group.name;
      group.durationLabel = cleanText(body.durationLabel || program.durationLabel);
      group.days = splitDays(body.days).length ? splitDays(body.days) : group.days;
      group.timeStart = cleanText(body.timeStart || group.timeStart);
      group.timeEnd = cleanText(body.timeEnd || group.timeEnd);
      group.attendanceMode = cleanText(body.attendanceMode || group.attendanceMode) === "flexible_shift" ? "flexible_shift" : "fixed";
      if (group.attendanceMode === "flexible_shift") {
        const alternateDays = body.alternateDays !== undefined ? splitDays(body.alternateDays) : (group.alternateDays || []);
        group.alternateDays = alternateDays.length ? alternateDays : group.days;
        group.alternateTimeStart = cleanText(body.alternateTimeStart ?? group.alternateTimeStart);
        group.alternateTimeEnd = cleanText(body.alternateTimeEnd ?? group.alternateTimeEnd);
        if (!group.alternateDays.length || !group.alternateTimeStart || !group.alternateTimeEnd) {
          return json(res, 400, { error: "Nidam shift needs alternate days, start time, and end time" });
        }
      } else {
        group.alternateDays = [];
        group.alternateTimeStart = "";
        group.alternateTimeEnd = "";
      }
      group.startDate = validDateInput(body.startDate) || "";
      group.endDate = validDateInput(body.endDate) || "";
      group.capacity = capacity;
      group.price = nonNegativeMoney(body.price ?? group.price);
      group.discountedPrice = nonNegativeMoney(body.discountedPrice ?? group.discountedPrice);
      group.status = cleanText(body.status || group.status || "active");
      group.notes = cleanText(body.notes);
      group.updatedAt = now();
      if (!new Set(["active", "full", "paused", "done"]).has(group.status)) return json(res, 400, { error: "Invalid group status" });
      await storage.write(state);
      return json(res, 200, group);
    }

    if (method === "POST" && url.pathname === "/api/students") {
      const body = await parseBody(req);
      const group = state.groups.find((item) => item.id === cleanText(body.groupId));
      const agentId = cleanText(body.agentId);
      const agent = agentId ? state.agents.find((item) => item.id === agentId) : null;
      if (!group) return json(res, 400, { error: "Choose a valid group" });
      if (agentId && !agent) return json(res, 400, { error: "Choose a valid sales agent" });
      if (activeStudentsInGroup(state, group.id).length >= group.capacity) return json(res, 400, { error: "This group is already full" });
      const program = state.programs.find((item) => item.id === group.programId);
      const defaultPrice = group.discountedPrice || group.price || program?.discountedPrice || program?.basePrice || 0;
      const requestedPrice = body.totalDue !== undefined ? body.totalDue : (body.totalPrice !== undefined ? body.totalPrice : defaultPrice);
      const totalDue = nonNegativeMoney(requestedPrice);
      const item = {
        id: id("std"),
        groupId: group.id,
        programId: group.programId,
        agentId,
        name: cleanText(body.name),
        phone: cleanText(body.phone),
        registeredAt: validDateInput(body.registeredAt) || new Date().toISOString().slice(0, 10),
        totalDue,
        paymentPlan: cleanText(body.paymentPlan || "full"),
        status: cleanText(body.status || "registered"),
        notes: cleanText(body.notes),
        createdAt: now(),
        updatedAt: now(),
      };
      if (!item.name) return json(res, 400, { error: "Student name is required" });
      if (!new Set(["registered", "active", "completed", "paused", "cancelled"]).has(item.status)) return json(res, 400, { error: "Invalid student status" });
      if (!new Set(["full", "installments"]).has(item.paymentPlan)) return json(res, 400, { error: "Invalid payment plan" });
      state.students.push(item);
      addStudentEvent(state, item.id, "registered", { groupId: item.groupId, programId: item.programId, agentId: item.agentId, totalDue: item.totalDue });
      const initialPaid = nonNegativeMoney(body.initialPaid ?? body.amountPaid);
      if (initialPaid > 0) {
        const payment = { id: id("pay"), studentId: item.id, amount: initialPaid, paidAt: item.registeredAt, method: cleanText(body.paymentMethod || "cash"), notes: cleanText(body.paymentNotes || "Initial payment"), createdAt: now() };
        state.payments.push(payment);
        addStudentEvent(state, item.id, "payment_added", { paymentId: payment.id, amount: payment.amount, paidAt: payment.paidAt, method: payment.method });
      }
      await storage.write(state);
      return json(res, 201, item);
    }

    const studentPaymentMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/payments$/);
    if (method === "POST" && studentPaymentMatch) {
      const body = await parseBody(req);
      const student = state.students.find((item) => item.id === studentPaymentMatch[1]);
      if (!student) return json(res, 404, { error: "Student not found" });
      const amount = nonNegativeMoney(body.amount);
      if (amount <= 0) return json(res, 400, { error: "Payment amount must be greater than zero" });
      const item = {
        id: id("pay"),
        studentId: student.id,
        amount,
        paidAt: validDateInput(body.paidAt) || new Date().toISOString().slice(0, 10),
        method: cleanText(body.method || "cash"),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      state.payments.push(item);
      student.updatedAt = now();
      addStudentEvent(state, student.id, "payment_added", { paymentId: item.id, amount: item.amount, paidAt: item.paidAt, method: item.method });
      await storage.write(state);
      return json(res, 201, item);
    }

    const studentMatch = url.pathname.match(/^\/api\/students\/([^/]+)$/);
    if (method === "PATCH" && studentMatch) {
      const body = await parseBody(req);
      const student = state.students.find((item) => item.id === studentMatch[1]);
      if (!student) return json(res, 404, { error: "Student not found" });
      const previous = { ...student };
      if (body.groupId !== undefined && cleanText(body.groupId) !== student.groupId) {
        const nextGroup = state.groups.find((item) => item.id === cleanText(body.groupId));
        if (!nextGroup) return json(res, 400, { error: "Choose a valid group" });
        if (activeStudentsInGroup(state, nextGroup.id, student.id).length >= nextGroup.capacity) return json(res, 400, { error: "Selected group is already full" });
        student.groupId = nextGroup.id;
        student.programId = nextGroup.programId;
      }
      if (body.agentId !== undefined) {
        const agentId = cleanText(body.agentId);
        if (agentId && !state.agents.some((agent) => agent.id === agentId)) return json(res, 400, { error: "Choose a valid sales agent" });
        student.agentId = agentId;
      }
      ["name", "phone", "notes"].forEach((field) => {
        if (body[field] !== undefined) student[field] = cleanText(body[field]);
      });
      if (body.registeredAt !== undefined) student.registeredAt = validDateInput(body.registeredAt) || student.registeredAt;
      if (body.totalDue !== undefined) student.totalDue = nonNegativeMoney(body.totalDue);
      if (body.paymentPlan !== undefined) student.paymentPlan = cleanText(body.paymentPlan);
      if (body.status !== undefined) student.status = cleanText(body.status);
      if (!student.name) return json(res, 400, { error: "Student name is required" });
      if (!new Set(["registered", "active", "completed", "paused", "cancelled"]).has(student.status)) return json(res, 400, { error: "Invalid student status" });
      if (!new Set(["full", "installments"]).has(student.paymentPlan)) return json(res, 400, { error: "Invalid payment plan" });
      student.updatedAt = now();
      addStudentEvent(state, student.id, "updated", {
        from: { groupId: previous.groupId, status: previous.status, totalDue: previous.totalDue },
        to: { groupId: student.groupId, status: student.status, totalDue: student.totalDue },
      });
      await storage.write(state);
      return json(res, 200, student);
    }

    if (method === "POST" && url.pathname === "/api/agents") {
      const body = await parseBody(req);
      const item = {
        id: id("agt"),
        name: cleanText(body.name),
        whatsapp: cleanText(body.whatsapp),
        active: body.active !== false,
        createdAt: now(),
      };
      if (!item.name) return json(res, 400, { error: "Agent name is required" });
      if (duplicateName(state.agents, item.name)) return json(res, 409, { error: "This sales agent already exists" });
      state.agents.push(item);
      rematchImportedAdSets(state);
      await storage.write(state);
      return json(res, 201, item);
    }

    const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
    if ((method === "PATCH" || method === "DELETE") && agentMatch) {
      const agent = state.agents.find((item) => item.id === agentMatch[1]);
      if (!agent) return json(res, 404, { error: "Agent not found" });
      if (method === "PATCH") {
        const body = await parseBody(req);
        const nextName = cleanText(body.name);
        if (!nextName) return json(res, 400, { error: "Agent name is required" });
        if (duplicateName(state.agents.filter((item) => item.id !== agent.id), nextName)) {
          return json(res, 409, { error: "This sales agent already exists" });
        }
        agent.name = nextName;
        agent.whatsapp = cleanText(body.whatsapp);
        agent.active = body.active !== false;
        agent.updatedAt = now();
        rematchImportedAdSets(state);
        await storage.write(state);
        return json(res, 200, agent);
      }

      state.agents = state.agents.filter((item) => item.id !== agent.id);
      state.adSets.forEach((adSet) => {
        if (adSet.agentId === agent.id) {
          adSet.agentId = "";
          adSet.agentMatchStatus = "unassigned";
          adSet.agentMatchCandidates = [];
        }
      });
      state.outcomes.forEach((outcome) => {
        if (outcome.agentId === agent.id) {
          outcome.agentId = "";
          if (outcome.assignmentLevel === "agent") outcome.targetId = "";
        }
      });
      rematchImportedAdSets(state);
      await storage.write(state);
      return json(res, 200, { deleted: true, id: agent.id });
    }

    if (method === "POST" && url.pathname === "/api/campaigns") {
      const body = await parseBody(req);
      const item = {
        id: id("cmp"),
        programId: cleanText(body.programId),
        name: cleanText(body.name),
        createdAt: now(),
      };
      if (!item.programId || !item.name) return json(res, 400, { error: "Campaign program and name are required" });
      if (!state.programs.some((item) => item.id === body.programId)) return json(res, 400, { error: "Selected training does not exist" });
      state.campaigns.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/adsets") {
      const body = await parseBody(req);
      const item = {
        id: id("ads"),
        campaignId: cleanText(body.campaignId),
        agentId: cleanText(body.agentId),
        name: cleanText(body.name),
        objective: cleanText(body.objective || "Messages"),
        status: cleanText(body.status || "Testing"),
        createdAt: now(),
      };
      if (!item.campaignId || !item.agentId || !item.name) {
        return json(res, 400, { error: "Campaign, agent, and ad set name are required" });
      }
      if (!state.campaigns.some((campaign) => campaign.id === item.campaignId)) return json(res, 400, { error: "Selected campaign does not exist" });
      if (!state.agents.some((agent) => agent.id === item.agentId)) return json(res, 400, { error: "Selected sales agent does not exist" });
      state.adSets.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/creatives") {
      const body = await parseBody(req);
      const adSet = state.adSets.find((item) => item.id === body.adSetId);
      const item = {
        id: id("crt"),
        adSetId: cleanText(body.adSetId),
        name: cleanText(body.name),
        format: cleanText(body.format || "Video"),
        language: cleanText(body.language || "Arabic"),
        code: "",
        createdAt: now(),
      };
      if (!item.adSetId || !item.name) return json(res, 400, { error: "Ad set and creative name are required" });
      if (!adSet) return json(res, 400, { error: "Selected ad set does not exist" });
      item.code = makeCode(state);
      state.creatives.push(item);
      state.usedCreativeCodes.push(item.code);
      await storage.write(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/leads") {
      const body = await parseBody(req);
      const creative = state.creatives.find((item) => item.id === body.creativeId || normalizeCode(item.code) === normalizeCode(body.code));
      const adSet = state.adSets.find((item) => item.id === creative?.adSetId);
      const campaign = state.campaigns.find((item) => item.id === adSet?.campaignId);
      const item = {
        id: id("led"),
        creativeId: creative?.id || "",
        adSetId: adSet?.id || "",
        campaignId: campaign?.id || "",
        programId: campaign?.programId || "",
        agentId: adSet?.agentId || cleanText(body.agentId),
        code: creative?.code || normalizeCode(body.code),
        phone: cleanText(body.phone),
        stage: cleanText(body.stage || "new"),
        appointmentAt: cleanText(body.appointmentAt),
        registeredAt: cleanText(body.registeredAt),
        amountPaid: Number(body.amountPaid || 0),
        lostReason: cleanText(body.lostReason),
        notes: cleanText(body.notes),
        createdAt: cleanText(body.createdAt) || now(),
        updatedAt: now(),
      };
      if (!creative) return json(res, 400, { error: "Select a valid creative code" });
      if (!new Set(["new", "contacted", "qualified", "booked", "showed", "no_show", "registered", "lost"]).has(item.stage)) {
        return json(res, 400, { error: "Invalid lead stage" });
      }
      if (item.stage === "lost" && !item.lostReason) return json(res, 400, { error: "Lost reason is required" });
      if (!Number.isFinite(item.amountPaid) || item.amountPaid < 0) return json(res, 400, { error: "Paid amount must be zero or greater" });
      state.leads.push(item);
      addEvent(state, item.id, "created", { stage: item.stage, code: item.code });
      if (item.appointmentAt) addEvent(state, item.id, "appointment_booked", { appointmentAt: item.appointmentAt });
      if (item.stage === "registered") addEvent(state, item.id, "registered", { amountPaid: item.amountPaid });
      await storage.write(state);
      return json(res, 201, item);
    }

    const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (method === "PATCH" && leadMatch) {
      const body = await parseBody(req);
      const lead = state.leads.find((item) => item.id === leadMatch[1]);
      if (!lead) return json(res, 404, { error: "Lead not found" });
      const oldStage = lead.stage;
      ["stage", "appointmentAt", "registeredAt", "lostReason", "notes", "phone"].forEach((field) => {
        if (body[field] !== undefined) lead[field] = cleanText(body[field]);
      });
      if (body.amountPaid !== undefined) lead.amountPaid = Number(body.amountPaid || 0);
      if (!new Set(["new", "contacted", "qualified", "booked", "showed", "no_show", "registered", "lost"]).has(lead.stage)) {
        return json(res, 400, { error: "Invalid lead stage" });
      }
      if (lead.stage === "lost" && !lead.lostReason) return json(res, 400, { error: "Lost reason is required" });
      if (!Number.isFinite(lead.amountPaid) || lead.amountPaid < 0) return json(res, 400, { error: "Paid amount must be zero or greater" });
      lead.updatedAt = now();
      if (lead.stage !== oldStage) addEvent(state, lead.id, "stage_changed", { from: oldStage, to: lead.stage });
      if (body.appointmentAt) addEvent(state, lead.id, "appointment_booked", { appointmentAt: lead.appointmentAt });
      if (lead.stage === "registered" && oldStage !== "registered") {
        addEvent(state, lead.id, "registered", { amountPaid: lead.amountPaid, registeredAt: lead.registeredAt || now() });
      }
      await storage.write(state);
      return json(res, 200, lead);
    }

    if (method === "POST" && url.pathname === "/api/daily-logs") {
      const body = await parseBody(req);
      const creative = state.creatives.find((item) => item.id === body.creativeId);
      const adSet = state.adSets.find((item) => item.id === (body.adSetId || creative?.adSetId));
      const campaign = state.campaigns.find((item) => item.id === (body.campaignId || adSet?.campaignId));
      const item = {
        id: id("log"),
        date: cleanText(body.date || new Date().toISOString().slice(0, 10)),
        creativeId: creative?.id || "",
        adSetId: adSet?.id || "",
        campaignId: campaign?.id || "",
        programId: campaign?.programId || "",
        spend: Number(body.spend || 0),
        messages: Number(body.messages || 0),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      if (!item.date || !item.creativeId) return json(res, 400, { error: "Date and creative are required" });
      if (!creative) return json(res, 400, { error: "Selected creative does not exist" });
      if (!Number.isFinite(item.spend) || item.spend < 0) return json(res, 400, { error: "Spend must be zero or greater" });
      if (!Number.isInteger(item.messages) || item.messages < 0) return json(res, 400, { error: "Messages must be a whole number" });
      if (state.dailyLogs.some((log) => log.date === item.date && log.creativeId === item.creativeId)) {
        return json(res, 409, { error: "A daily log already exists for this creative and date" });
      }
      state.dailyLogs.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    return json(res, 404, { error: "Route not found" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  } finally {
    if (releaseMutation) releaseMutation();
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  if (OPERATIONS_ROUTES.has(url.pathname) && !hasAuth()) return sendOperationsLockedPage(res);
  if (!requireAuth(req, res)) return;
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`CMCG CRM listening on http://localhost:${PORT}`);
});

storage.init().then(() => {
  storageReady = true;
  console.log(`CMCG CRM running with ${storage.info().label}`);
}).catch((error) => {
  storageError = error;
  console.error("Failed to initialize CMCG CRM storage:", {
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    stack: error.stack,
  });
});
