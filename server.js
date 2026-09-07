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

const PAYMENT_PLANS = new Set(["paid_full", "monthly", "custom"]);
const DURATION_UNITS = new Set(["months", "years"]);
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const SCREENSHOT_PROGRAMS = [
  { name: "Comptabilité 3 mois", durationLabel: "3 mois" },
  { name: "Comptabilité 5 mois", durationLabel: "5 mois" },
  { name: "Comptabilité complet", durationLabel: "Complet" },
  { name: "RH", durationLabel: "" },
];

const SCREENSHOT_GROUPS = [
  { programName: "Comptabilité 3 mois", day: "Mardi", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "Comptabilité complet", day: "Mardi", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "Comptabilité 3 mois", day: "Mardi", timeStart: "16:00", timeEnd: "18:00" },
  { programName: "Comptabilité 3 mois", day: "Mardi", timeStart: "18:00", timeEnd: "20:00", namePrefix: "Groupe déjà avancé" },
  { programName: "Comptabilité 5 mois", day: "Mercredi", timeStart: "16:00", timeEnd: "18:00" },
  { programName: "Comptabilité complet", day: "Mercredi", timeStart: "18:00", timeEnd: "20:00" },
  { programName: "Comptabilité 3 mois", day: "Jeudi", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "Comptabilité 3 mois", day: "Jeudi", timeStart: "16:00", timeEnd: "18:00" },
  { programName: "Comptabilité 3 mois", day: "Jeudi", timeStart: "18:00", timeEnd: "20:00", namePrefix: "Groupe déjà avancé" },
  { programName: "Comptabilité complet", day: "Vendredi", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "Comptabilité 5 mois", day: "Vendredi", timeStart: "16:00", timeEnd: "18:00" },
  { programName: "Comptabilité complet", day: "Vendredi", timeStart: "18:00", timeEnd: "20:00" },
  { programName: "Comptabilité 3 mois", day: "Samedi", timeStart: "12:00", timeEnd: "14:00" },
  { programName: "Comptabilité 5 mois", day: "Samedi", timeStart: "14:00", timeEnd: "16:00" },
  { programName: "Comptabilité 3 mois", day: "Samedi", timeStart: "18:00", timeEnd: "20:00", namePrefix: "Groupe déjà avancé" },
  { programName: "Comptabilité 5 mois", day: "Dimanche", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "RH", day: "Dimanche", timeStart: "10:00", timeEnd: "12:00" },
  { programName: "Comptabilité 5 mois", day: "Dimanche", timeStart: "12:00", timeEnd: "14:00" },
  { programName: "RH", day: "Dimanche", timeStart: "12:00", timeEnd: "14:00" },
];

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
    meta: { schemaVersion: 6, updatedAt: null },
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD", scoring: { ...DEFAULT_SCORING } },
    availability: { weekly: {}, overrides: {}, updatedAt: null },
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
  state.meta.schemaVersion = 6;
  state.availability = normalizeAvailability(state.availability);
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
  state.programs.forEach((program) => normalizeProgram(program));
  state.groups.forEach((group) => {
    group.attendanceMode = group.attendanceMode === "flexible_shift" ? "flexible_shift" : "fixed";
    normalizeGroupSessions(group);
  });
  state.students.forEach((student) => {
    student.paymentPlan = normalizePaymentPlan(student.paymentPlan);
    student.totalDue = nonNegativeMoney(student.totalDue);
    student.installmentAmount = nonNegativeMoney(student.installmentAmount);
    student.installmentsCount = Math.max(0, wholeNumber(student.installmentsCount));
    student.paymentStartDate = validDateInput(student.paymentStartDate) || "";
    student.nextPaymentDate = validDateInput(student.nextPaymentDate) || "";
    student.agreementNote = cleanText(student.agreementNote);
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
  return Boolean((process.env.CRM_USER && process.env.CRM_PASSWORD) || (process.env.CRM_SALES_USER && process.env.CRM_SALES_PASSWORD));
}

function basicCredentials(req) {
  const header = req.headers.authorization || "";
  const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return { username: "", password: "" };
  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

function configuredAuthUsers() {
  const users = [];
  if (process.env.CRM_USER && process.env.CRM_PASSWORD) {
    users.push({ role: "admin", username: process.env.CRM_USER, password: process.env.CRM_PASSWORD, label: "Admin" });
  }
  if (process.env.CRM_SALES_USER && process.env.CRM_SALES_PASSWORD) {
    users.push({
      role: "sales",
      username: process.env.CRM_SALES_USER,
      password: process.env.CRM_SALES_PASSWORD,
      label: cleanText(process.env.CRM_SALES_AGENT || process.env.CRM_SALES_USER),
      agentName: cleanText(process.env.CRM_SALES_AGENT || process.env.CRM_SALES_USER),
    });
  }
  return users;
}

function resolveAgentForUser(state, context) {
  if (context.role !== "sales") return context;
  const wanted = cleanText(context.agentName || context.username).toLocaleLowerCase();
  const agent = state?.agents?.find((item) => item.id === context.agentName || cleanText(item.name).toLocaleLowerCase() === wanted);
  return { ...context, agentId: agent?.id || "", agentName: agent?.name || context.agentName || context.username };
}

function authContext(req, state = null) {
  if (!hasAuth()) {
    return { authenticated: true, authConfigured: false, role: "admin", username: "local", label: "Local admin", agentId: "", agentName: "" };
  }
  const credentials = basicCredentials(req);
  const user = configuredAuthUsers().find((item) => item.username === credentials.username && item.password === credentials.password);
  if (!user) return { authenticated: false, authConfigured: true, role: "guest", username: "", label: "Guest", agentId: "", agentName: "" };
  return resolveAgentForUser(state, { authenticated: true, authConfigured: true, role: user.role, username: user.username, label: user.label, agentName: user.agentName || "", agentId: "" });
}

function authorized(req) {
  return authContext(req).authenticated;
}

function requireAuth(req, res) {
  const context = authContext(req);
  if (context.authenticated) return context;
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
  return /^\/api\/(?:groups|students|operations|availability)(?:\/|$)/.test(pathname);
}

function requireConfiguredAuthForStudentData(res, pathname) {
  if (hasAuth() || !isSensitiveStudentApiPath(pathname)) return true;
  return json(res, 403, {
    error: "Secure login is required before saving student, group, or payment data. Add CRM_USER/CRM_PASSWORD for admin, or CRM_SALES_USER/CRM_SALES_PASSWORD/CRM_SALES_AGENT for a sales login, then restart the app.",
  });
}

function salesCanAccessApi(method, pathname) {
  if (method === "GET" && pathname === "/api/state") return true;
  if ((method === "POST" || method === "PATCH") && /^\/api\/programs(?:\/|$)/.test(pathname)) return true;
  if ((method === "POST" || method === "PATCH") && /^\/api\/groups(?:\/|$)/.test(pathname)) return true;
  if ((method === "POST" || method === "PATCH") && /^\/api\/students(?:\/|$)/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/availability(?:\/|$)/.test(pathname)) return true;
  return false;
}

function publicUser(context) {
  return {
    role: context.role,
    username: context.username,
    label: context.label || (context.role === "admin" ? "Admin" : context.agentName || "Sales agent"),
    agentId: context.agentId || "",
    agentName: context.agentName || "",
    canSeeAdvertising: context.role === "admin",
    canManageStudentData: context.role === "admin" || Boolean(context.agentId),
  };
}

function stateForUser(state, context) {
  if (context.role !== "sales") return state;
  const safe = JSON.parse(JSON.stringify(state));
  const studentIds = new Set(
    context.agentId
      ? state.students.filter((student) => student.agentId === context.agentId).map((student) => student.id)
      : [],
  );
  safe.adAccounts = [];
  safe.campaigns = [];
  safe.adSets = [];
  safe.creatives = [];
  safe.usedCreativeCodes = [];
  safe.imports = [];
  safe.outcomes = [];
  safe.leads = [];
  safe.dailyLogs = [];
  safe.agents = context.agentId ? state.agents.filter((agent) => agent.id === context.agentId) : [];
  safe.groups = state.groups.map((group) => ({ ...group, enrolledCount: activeStudentsInGroup(state, group.id).length }));
  safe.students = state.students.filter((student) => studentIds.has(student.id));
  safe.payments = state.payments.filter((payment) => studentIds.has(payment.studentId));
  safe.events = state.events.filter((event) => event.studentId && studentIds.has(event.studentId));
  return safe;
}

function sendOperationsLockedPage(res) {
  res.writeHead(403, securityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMCG CRM locked</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:grid;min-height:100vh;place-items:center"><main style="max-width:640px;padding:28px"><p style="color:#86efac;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Secure area locked</p><h1>Student operations need CRM login first.</h1><p style="color:#cbd5e1;line-height:1.6">Add <strong>CRM_USER</strong>/<strong>CRM_PASSWORD</strong> for admin, or <strong>CRM_SALES_USER</strong>/<strong>CRM_SALES_PASSWORD</strong>/<strong>CRM_SALES_AGENT</strong> for a restricted sales login. Restart the app, then open this page again.</p></main></body></html>`);
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

function addMonthsInput(value, months = 1) {
  const text = validDateInput(value);
  if (!text) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const originalDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  if (date.getUTCDate() !== originalDay) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function normalizePaymentPlan(value) {
  const text = cleanText(value).toLocaleLowerCase();
  if (text === "full" || text === "cash" || text === "paidfull" || text === "paid-full") return "paid_full";
  if (text === "installments" || text === "installment" || text === "monthly_installments") return "monthly";
  if (text === "monthly") return "monthly";
  if (text === "custom" || text === "split" || text === "agreement") return "custom";
  return "paid_full";
}

function applyStudentPaymentAgreement(student, body = {}, defaults = {}) {
  const registeredAt = validDateInput(student.registeredAt) || new Date().toISOString().slice(0, 10);
  const plan = normalizePaymentPlan(body.paymentPlan ?? defaults.paymentPlan ?? student.paymentPlan);
  student.paymentPlan = plan;
  if (body.totalDue !== undefined || defaults.totalDue !== undefined || student.totalDue === undefined) {
    student.totalDue = nonNegativeMoney(body.totalDue ?? defaults.totalDue ?? student.totalDue);
  }
  student.installmentsCount = Math.max(0, wholeNumber(body.installmentsCount ?? defaults.installmentsCount ?? student.installmentsCount));
  student.installmentAmount = nonNegativeMoney(body.installmentAmount ?? body.monthlyAmount ?? defaults.installmentAmount ?? student.installmentAmount);
  student.paymentStartDate = validDateInput(body.paymentStartDate ?? defaults.paymentStartDate) || student.paymentStartDate || registeredAt;
  student.nextPaymentDate = body.nextPaymentDate !== undefined
    ? validDateInput(body.nextPaymentDate)
    : (validDateInput(defaults.nextPaymentDate) || student.nextPaymentDate || "");
  student.agreementNote = cleanText(body.agreementNote ?? defaults.agreementNote ?? student.agreementNote);

  if (student.paymentPlan === "paid_full") {
    student.installmentsCount = student.installmentsCount || 1;
    student.installmentAmount = 0;
    student.nextPaymentDate = "";
  }
  if (student.paymentPlan === "monthly") {
    if (!student.installmentsCount) student.installmentsCount = 0;
    if (!student.installmentAmount && student.installmentsCount) {
      student.installmentAmount = Number((student.totalDue / student.installmentsCount).toFixed(2));
    }
    if (!student.nextPaymentDate) student.nextPaymentDate = addMonthsInput(student.paymentStartDate || registeredAt, 1);
  }
  if (student.paymentPlan === "custom" && !student.paymentStartDate) student.paymentStartDate = registeredAt;
  return student;
}

function refreshStudentPaymentStatus(state, student, { latestPaymentDate = "", nextPaymentDateProvided = false, nextPaymentDate = "" } = {}) {
  const paid = paidForStudent(state, student.id);
  const remaining = Math.max(0, nonNegativeMoney(student.totalDue) - paid);
  if (remaining <= 0) {
    student.nextPaymentDate = "";
    return { paid, remaining };
  }
  if (nextPaymentDateProvided) {
    student.nextPaymentDate = validDateInput(nextPaymentDate);
    return { paid, remaining };
  }
  if (student.paymentPlan === "monthly") {
    if (latestPaymentDate) student.nextPaymentDate = addMonthsInput(latestPaymentDate, 1);
    else if (!student.nextPaymentDate) student.nextPaymentDate = addMonthsInput(student.paymentStartDate || student.registeredAt, 1);
  }
  return { paid, remaining };
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

function normalizeDurationUnit(value) {
  const text = cleanText(value).toLocaleLowerCase();
  if (text === "year" || text === "years" || text === "an" || text === "ans" || text === "année" || text === "annee") return "years";
  return "months";
}

function durationLabelFromParts(value, unit) {
  const count = wholeNumber(value);
  if (!count) return "";
  return unit === "years" ? `${count} an${count > 1 ? "s" : ""}` : `${count} mois`;
}

function durationMonthsFromParts(value, unit) {
  const count = wholeNumber(value);
  return unit === "years" ? count * 12 : count;
}

// Best-effort parse of a legacy free-text duration ("5 mois", "1 an", "année complète").
function parseLegacyDuration(label) {
  const text = cleanText(label).toLocaleLowerCase();
  const match = text.match(/\d+/);
  const isYears = /an|année|annee|year/.test(text);
  if (!match) {
    if (isYears) return { durationValue: 1, durationUnit: "years" };
    return { durationValue: 0, durationUnit: "months" };
  }
  return { durationValue: Number(match[0]), durationUnit: isYears ? "years" : "months" };
}

function normalizeProgram(program) {
  program.name = cleanText(program.name);
  program.notes = cleanText(program.notes);
  // Migrate legacy durationLabel into numeric value + unit when the new fields are missing.
  if (program.durationValue === undefined && program.durationUnit === undefined) {
    const parsed = parseLegacyDuration(program.durationLabel);
    program.durationValue = program.durationMonths ? Number(program.durationMonths) : parsed.durationValue;
    program.durationUnit = parsed.durationUnit;
  }
  program.durationUnit = normalizeDurationUnit(program.durationUnit);
  program.durationValue = Math.max(0, wholeNumber(program.durationValue));
  program.durationLabel = durationLabelFromParts(program.durationValue, program.durationUnit) || cleanText(program.durationLabel);
  program.durationMonths = durationMonthsFromParts(program.durationValue, program.durationUnit);
  program.sessionsPerWeek = Math.max(0, wholeNumber(program.sessionsPerWeek));
  program.sessionHours = Math.max(0, finiteNumber(program.sessionHours));
  // Three prices. Monthly is the primary. Migrate legacy basePrice/discountedPrice.
  program.monthlyPrice = nonNegativeMoney(program.monthlyPrice ?? program.basePrice);
  program.fullPrice = nonNegativeMoney(program.fullPrice ?? program.basePrice);
  program.discountedPrice = nonNegativeMoney(program.discountedPrice);
  program.basePrice = program.fullPrice; // keep legacy field aligned to full price
  program.nidamShift = Boolean(program.nidamShift);
  return program;
}

function normalizeTimeInput(value) {
  const text = cleanText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function availabilitySlotKey(day, start, end) {
  return `${normalizeDayKey(day)}|${normalizeTimeInput(start)}|${normalizeTimeInput(end)}`;
}

function normalizeDayKey(value) {
  const text = cleanText(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
  const map = {
    lundi: "monday", mardi: "tuesday", mercredi: "wednesday", jeudi: "thursday",
    vendredi: "friday", samedi: "saturday", dimanche: "sunday",
  };
  return map[text] || text;
}

function normalizeAvailability(input) {
  const base = { weekly: {}, overrides: {}, updatedAt: null };
  if (!input || typeof input !== "object") return base;
  // weekly: { "monday|09:00|11:00": true/false }
  if (input.weekly && typeof input.weekly === "object") {
    for (const [key, value] of Object.entries(input.weekly)) {
      base.weekly[cleanText(key)] = Boolean(value);
    }
  }
  // overrides: { "2026-09-13": { "09:00|11:00": true/false } } — date-specific exceptions
  if (input.overrides && typeof input.overrides === "object") {
    for (const [date, slots] of Object.entries(input.overrides)) {
      const validDate = validDateInput(date);
      if (!validDate || !slots || typeof slots !== "object") continue;
      base.overrides[validDate] = {};
      for (const [slotKey, value] of Object.entries(slots)) {
        base.overrides[validDate][cleanText(slotKey)] = Boolean(value);
      }
    }
  }
  base.updatedAt = input.updatedAt || null;
  return base;
}

// A group owns a list of sessions: [{ day, timeStart, timeEnd }]. Legacy groups stored a
// single days[]/timeStart/timeEnd (+ optional alternate shift); migrate those into sessions[].
function normalizeGroupSessions(group) {
  let sessions = Array.isArray(group.sessions) ? group.sessions : [];
  sessions = sessions
    .map((session) => ({
      day: normalizeDayKey(session.day),
      timeStart: normalizeTimeInput(session.timeStart || session.start),
      timeEnd: normalizeTimeInput(session.timeEnd || session.end),
    }))
    .filter((session) => WEEK_DAYS.includes(session.day) && session.timeStart && session.timeEnd);
  if (!sessions.length) {
    // Migrate from the old shape.
    const legacyDays = Array.isArray(group.days) ? group.days : splitDays(group.days);
    const start = cleanText(group.timeStart);
    const end = cleanText(group.timeEnd);
    legacyDays.forEach((day) => {
      const dayKey = normalizeDayKey(day);
      if (WEEK_DAYS.includes(dayKey) && start && end) sessions.push({ day: dayKey, timeStart: start, timeEnd: end });
    });
    if (group.attendanceMode === "flexible_shift" && group.alternateTimeStart && group.alternateTimeEnd) {
      const altDays = Array.isArray(group.alternateDays) && group.alternateDays.length ? group.alternateDays : legacyDays;
      altDays.forEach((day) => {
        const dayKey = normalizeDayKey(day);
        if (WEEK_DAYS.includes(dayKey)) sessions.push({ day: dayKey, timeStart: cleanText(group.alternateTimeStart), timeEnd: cleanText(group.alternateTimeEnd) });
      });
    }
  }
  // De-duplicate identical sessions.
  const seen = new Set();
  group.sessions = sessions.filter((session) => {
    const key = `${session.day}|${session.timeStart}|${session.timeEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Keep legacy fields aligned to the first session so old readers still work.
  const first = group.sessions[0];
  group.days = [...new Set(group.sessions.map((session) => session.day))];
  group.timeStart = first?.timeStart || "";
  group.timeEnd = first?.timeEnd || "";
  return group;
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

function findProgramByName(state, name) {
  const normalized = cleanText(name).toLocaleLowerCase();
  return state.programs.find((program) => cleanText(program.name).toLocaleLowerCase() === normalized);
}

function sameDays(a = [], b = []) {
  return a.map(cleanText).join("|").toLocaleLowerCase() === b.map(cleanText).join("|").toLocaleLowerCase();
}

function seedScreenshotSchedule(state) {
  const createdPrograms = [];
  const createdGroups = [];
  const programMap = new Map();

  SCREENSHOT_PROGRAMS.forEach((source) => {
    let program = findProgramByName(state, source.name);
    if (!program) {
      program = {
        id: id("prg"),
        name: source.name,
        durationLabel: source.durationLabel,
        durationMonths: 0,
        basePrice: 0,
        discountedPrice: 0,
        notes: "Créé depuis le planning Excel en photo.",
        createdAt: now(),
      };
      state.programs.push(program);
      createdPrograms.push(program);
    }
    programMap.set(source.name, program);
  });

  SCREENSHOT_GROUPS.forEach((source) => {
    const program = programMap.get(source.programName) || findProgramByName(state, source.programName);
    if (!program) return;
    const dayKey = normalizeDayKey(source.day);
    const alreadyExists = state.groups.some((group) => (
      group.programId === program.id
      && (group.sessions || []).some((s) => s.day === dayKey && s.timeStart === source.timeStart && s.timeEnd === source.timeEnd)
      && cleanText(group.notes).toLocaleLowerCase().includes("planning excel")
    ));
    if (alreadyExists) return;
    const groupName = `${source.namePrefix ? `${source.namePrefix} - ` : ""}${program.name} ${source.day} ${source.timeStart}`;
    const group = normalizeGroupSessions({
      id: id("grp"),
      programId: program.id,
      name: groupName,
      durationLabel: program.durationLabel,
      sessions: [{ day: dayKey, timeStart: source.timeStart, timeEnd: source.timeEnd }],
      attendanceMode: "fixed",
      startDate: "",
      endDate: "",
      capacity: 20,
      price: 0,
      discountedPrice: 0,
      status: "active",
      notes: "Importé depuis le planning Excel en photo. À vérifier si la photo était floue.",
      createdAt: now(),
    });
    state.groups.push(group);
    createdGroups.push(group);
  });

  return { programsAdded: createdPrograms.length, groupsAdded: createdGroups.length, programs: createdPrograms, groups: createdGroups };
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
  const initialAuth = requireAuth(req, res);
  if (!initialAuth) return;
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
    const context = authContext(req, state);
    if (context.role === "sales" && !salesCanAccessApi(method, url.pathname)) {
      return json(res, 403, { error: "This login can only access student operations." });
    }
    if (method === "GET" && url.pathname === "/api/state") {
      const sensitiveLocked = !hasAuth() && hasSensitiveStudentData(state);
      return json(res, 200, {
        state: sensitiveLocked ? publicStateWithoutStudentData(state) : stateForUser(state, context),
        authEnabled: hasAuth(),
        sensitiveLocked,
        currentUser: publicUser(context),
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

    if (method === "POST" && url.pathname === "/api/operations/seed-screenshot-schedule") {
      const result = seedScreenshotSchedule(state);
      await storage.write(state);
      return json(res, 200, { seeded: true, result, state: stateForUser(state, context) });
    }

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

    if (method === "POST" && url.pathname === "/api/availability") {
      const body = await parseBody(req);
      const day = normalizeDayKey(body.day);
      const start = normalizeTimeInput(body.timeStart || body.start);
      const end = normalizeTimeInput(body.timeEnd || body.end);
      if (!WEEK_DAYS.includes(day) || !start || !end) {
        return json(res, 400, { error: "Availability needs a valid day, start time, and end time" });
      }
      const available = body.available === undefined ? true : Boolean(body.available);
      const date = validDateInput(body.date);
      state.availability = normalizeAvailability(state.availability);
      if (date) {
        // Date-specific override: "this exact Saturday" differs from the weekly default.
        if (!state.availability.overrides[date]) state.availability.overrides[date] = {};
        state.availability.overrides[date][`${start}|${end}`] = available;
      } else {
        state.availability.weekly[`${day}|${start}|${end}`] = available;
      }
      state.availability.updatedAt = now();
      await storage.write(state);
      return json(res, 200, state.availability);
    }

    if (method === "POST" && url.pathname === "/api/availability/clear-override") {
      const body = await parseBody(req);
      const date = validDateInput(body.date);
      state.availability = normalizeAvailability(state.availability);
      if (date && state.availability.overrides[date]) {
        delete state.availability.overrides[date];
        state.availability.updatedAt = now();
        await storage.write(state);
      }
      return json(res, 200, state.availability);
    }

    if (method === "POST" && url.pathname === "/api/programs") {
      const body = await parseBody(req);
      const item = normalizeProgram({
        id: id("prg"),
        name: body.name,
        durationValue: body.durationValue,
        durationUnit: body.durationUnit,
        durationLabel: body.durationLabel,
        durationMonths: body.durationMonths,
        sessionsPerWeek: body.sessionsPerWeek,
        sessionHours: body.sessionHours,
        monthlyPrice: body.monthlyPrice,
        fullPrice: body.fullPrice ?? body.basePrice,
        discountedPrice: body.discountedPrice,
        nidamShift: body.nidamShift,
        notes: body.notes,
        createdAt: now(),
      });
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
      if (body.durationValue !== undefined) program.durationValue = body.durationValue;
      if (body.durationUnit !== undefined) program.durationUnit = body.durationUnit;
      // Clear derived fields so normalizeProgram recomputes from the new value/unit.
      delete program.durationLabel;
      delete program.durationMonths;
      if (body.sessionsPerWeek !== undefined) program.sessionsPerWeek = body.sessionsPerWeek;
      if (body.sessionHours !== undefined) program.sessionHours = body.sessionHours;
      if (body.monthlyPrice !== undefined) program.monthlyPrice = body.monthlyPrice;
      if (body.fullPrice !== undefined || body.basePrice !== undefined) program.fullPrice = body.fullPrice ?? body.basePrice;
      if (body.discountedPrice !== undefined) program.discountedPrice = body.discountedPrice;
      if (body.nidamShift !== undefined) program.nidamShift = body.nidamShift;
      program.notes = cleanText(body.notes);
      normalizeProgram(program);
      program.updatedAt = now();
      await storage.write(state);
      return json(res, 200, program);
    }

    if (method === "POST" && url.pathname === "/api/groups") {
      const body = await parseBody(req);
      const programId = cleanText(body.programId || body.trainingId);
      const program = state.programs.find((item) => item.id === programId);
      if (!program) return json(res, 400, { error: "Choose a valid training" });
      // A group is just a named container under a training. Prices come from the training;
      // sessions (day/time blocks) are added on the calendar afterwards.
      const item = {
        id: id("grp"),
        programId,
        name: cleanText(body.name) || `${program.name} - Groupe ${state.groups.filter((g) => g.programId === programId).length + 1}`,
        durationLabel: cleanText(body.durationLabel || program?.durationLabel),
        sessions: Array.isArray(body.sessions) ? body.sessions : [],
        // Legacy fields accepted so old clients / migrations still populate sessions.
        days: body.days,
        timeStart: body.timeStart,
        timeEnd: body.timeEnd,
        attendanceMode: program.nidamShift ? "flexible_shift" : "fixed",
        startDate: validDateInput(body.startDate),
        endDate: validDateInput(body.endDate),
        capacity: Math.max(1, wholeNumber(body.capacity, 20)),
        price: nonNegativeMoney(body.price),
        discountedPrice: nonNegativeMoney(body.discountedPrice),
        status: cleanText(body.status || "active"),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      normalizeGroupSessions(item);
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
      // Sessions are the source of truth for a group's timing.
      if (body.sessions !== undefined) group.sessions = Array.isArray(body.sessions) ? body.sessions : [];
      group.attendanceMode = program.nidamShift ? "flexible_shift" : "fixed";
      group.startDate = validDateInput(body.startDate) || "";
      group.endDate = validDateInput(body.endDate) || "";
      group.capacity = capacity;
      if (body.price !== undefined) group.price = nonNegativeMoney(body.price);
      if (body.discountedPrice !== undefined) group.discountedPrice = nonNegativeMoney(body.discountedPrice);
      group.status = cleanText(body.status || group.status || "active");
      group.notes = cleanText(body.notes);
      normalizeGroupSessions(group);
      group.updatedAt = now();
      if (!new Set(["active", "full", "paused", "done"]).has(group.status)) return json(res, 400, { error: "Invalid group status" });
      await storage.write(state);
      return json(res, 200, group);
    }

    const groupSessionsMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/sessions$/);
    if (method === "POST" && groupSessionsMatch) {
      const body = await parseBody(req);
      const group = state.groups.find((item) => item.id === groupSessionsMatch[1]);
      if (!group) return json(res, 404, { error: "Group not found" });
      group.sessions = Array.isArray(body.sessions) ? body.sessions : [];
      normalizeGroupSessions(group);
      group.updatedAt = now();
      await storage.write(state);
      return json(res, 200, group);
    }

    if (method === "POST" && url.pathname === "/api/students") {
      const body = await parseBody(req);
      const group = state.groups.find((item) => item.id === cleanText(body.groupId));
      const agentId = context.role === "sales" ? context.agentId : cleanText(body.agentId);
      const agent = agentId ? state.agents.find((item) => item.id === agentId) : null;
      if (!group) return json(res, 400, { error: "Choose a valid group" });
      if (context.role === "sales" && !context.agentId) return json(res, 403, { error: "This sales login is not linked to an agent. Create an agent with the same name as CRM_SALES_AGENT first." });
      if (agentId && !agent) return json(res, 400, { error: "Choose a valid sales agent" });
      if (activeStudentsInGroup(state, group.id).length >= group.capacity) return json(res, 400, { error: "This group is already full" });
      const program = state.programs.find((item) => item.id === group.programId);
      const requestedPlan = normalizePaymentPlan(body.paymentPlan);
      const defaultPrice = requestedPlan === "monthly"
        ? (group.price || program?.basePrice || group.discountedPrice || program?.discountedPrice || 0)
        : (group.discountedPrice || program?.discountedPrice || group.price || program?.basePrice || 0);
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
        paymentPlan: requestedPlan,
        installmentAmount: 0,
        installmentsCount: 0,
        paymentStartDate: "",
        nextPaymentDate: "",
        agreementNote: "",
        status: cleanText(body.status || "registered"),
        notes: cleanText(body.notes),
        createdAt: now(),
        updatedAt: now(),
      };
      applyStudentPaymentAgreement(item, body, { totalDue, paymentStartDate: item.registeredAt });
      if (!item.name) return json(res, 400, { error: "Student name is required" });
      if (!new Set(["registered", "active", "completed", "paused", "cancelled"]).has(item.status)) return json(res, 400, { error: "Invalid student status" });
      if (!PAYMENT_PLANS.has(item.paymentPlan)) return json(res, 400, { error: "Invalid payment plan" });
      state.students.push(item);
      addStudentEvent(state, item.id, "registered", {
        groupId: item.groupId,
        programId: item.programId,
        agentId: item.agentId,
        totalDue: item.totalDue,
        paymentPlan: item.paymentPlan,
        installmentAmount: item.installmentAmount,
        installmentsCount: item.installmentsCount,
        paymentStartDate: item.paymentStartDate,
        nextPaymentDate: item.nextPaymentDate,
        agreementNote: item.agreementNote,
      });
      const initialPaid = nonNegativeMoney(body.initialPaid ?? body.amountPaid);
      if (initialPaid > 0) {
        const payment = { id: id("pay"), studentId: item.id, amount: initialPaid, paidAt: item.registeredAt, method: cleanText(body.paymentMethod || "cash"), notes: cleanText(body.paymentNotes || "Initial payment"), createdAt: now() };
        state.payments.push(payment);
        addStudentEvent(state, item.id, "payment_added", { paymentId: payment.id, amount: payment.amount, paidAt: payment.paidAt, method: payment.method });
      }
      refreshStudentPaymentStatus(state, item, {
        latestPaymentDate: item.registeredAt,
        nextPaymentDateProvided: body.nextPaymentDate !== undefined,
        nextPaymentDate: body.nextPaymentDate,
      });
      await storage.write(state);
      return json(res, 201, item);
    }

    const studentPaymentMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/payments$/);
    if (method === "POST" && studentPaymentMatch) {
      const body = await parseBody(req);
      const student = state.students.find((item) => item.id === studentPaymentMatch[1]);
      if (!student) return json(res, 404, { error: "Student not found" });
      if (context.role === "sales" && student.agentId !== context.agentId) return json(res, 403, { error: "This student belongs to another sales agent." });
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
      const paymentStatus = refreshStudentPaymentStatus(state, student, {
        latestPaymentDate: item.paidAt,
        nextPaymentDateProvided: body.nextPaymentDate !== undefined,
        nextPaymentDate: body.nextPaymentDate,
      });
      student.updatedAt = now();
      addStudentEvent(state, student.id, "payment_added", { paymentId: item.id, amount: item.amount, paidAt: item.paidAt, method: item.method, nextPaymentDate: student.nextPaymentDate, remaining: paymentStatus.remaining });
      await storage.write(state);
      return json(res, 201, item);
    }

    const studentMatch = url.pathname.match(/^\/api\/students\/([^/]+)$/);
    if (method === "PATCH" && studentMatch) {
      const body = await parseBody(req);
      const student = state.students.find((item) => item.id === studentMatch[1]);
      if (!student) return json(res, 404, { error: "Student not found" });
      if (context.role === "sales" && student.agentId !== context.agentId) return json(res, 403, { error: "This student belongs to another sales agent." });
      const previous = { ...student };
      if (body.groupId !== undefined && cleanText(body.groupId) !== student.groupId) {
        const nextGroup = state.groups.find((item) => item.id === cleanText(body.groupId));
        if (!nextGroup) return json(res, 400, { error: "Choose a valid group" });
        if (activeStudentsInGroup(state, nextGroup.id, student.id).length >= nextGroup.capacity) return json(res, 400, { error: "Selected group is already full" });
        student.groupId = nextGroup.id;
        student.programId = nextGroup.programId;
      }
      if (body.agentId !== undefined) {
        const agentId = context.role === "sales" ? context.agentId : cleanText(body.agentId);
        if (agentId && !state.agents.some((agent) => agent.id === agentId)) return json(res, 400, { error: "Choose a valid sales agent" });
        student.agentId = agentId;
      }
      ["name", "phone", "notes"].forEach((field) => {
        if (body[field] !== undefined) student[field] = cleanText(body[field]);
      });
      if (body.registeredAt !== undefined) student.registeredAt = validDateInput(body.registeredAt) || student.registeredAt;
      applyStudentPaymentAgreement(student, body);
      if (body.status !== undefined) student.status = cleanText(body.status);
      if (!student.name) return json(res, 400, { error: "Student name is required" });
      if (!new Set(["registered", "active", "completed", "paused", "cancelled"]).has(student.status)) return json(res, 400, { error: "Invalid student status" });
      if (!PAYMENT_PLANS.has(student.paymentPlan)) return json(res, 400, { error: "Invalid payment plan" });
      refreshStudentPaymentStatus(state, student, {
        nextPaymentDateProvided: body.nextPaymentDate !== undefined,
        nextPaymentDate: body.nextPaymentDate,
      });
      student.updatedAt = now();
      addStudentEvent(state, student.id, "updated", {
        from: { groupId: previous.groupId, status: previous.status, totalDue: previous.totalDue },
        to: { groupId: student.groupId, status: student.status, totalDue: student.totalDue, paymentPlan: student.paymentPlan, nextPaymentDate: student.nextPaymentDate },
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
