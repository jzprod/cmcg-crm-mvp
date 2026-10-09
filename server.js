const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createStorage } = require("./storage");
const { buildReport, toCsv, toMarkdown, todayIn } = require("./report");
const Leads = require("./leads");
const Push = require("./push");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.CRM_DATA_FILE || path.join(__dirname, "data", "crm.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const OPERATIONS_ROUTES = new Set(["/groups", "/students", "/operations", "/planning"]);

const MIME = {
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
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

// dataStartDate: ad data before this day is kept but hidden from the Ads Manager ("" shows everything).
// Revenue is entered in the school's currency (DH); exchangeRate converts one unit of
// the ad-account currency into it so spend and revenue can be compared.
const DEFAULT_PROFIT = { breakEvenCostPerRegistered: 60, dataStartDate: "2026-10-01", revenuePerRegistered: 3000, revenueCurrency: "DH", exchangeRate: 10 };

// Break-even = the most one registration may cost before an ad loses money.
function normalizeProfitSettings(input = {}) {
  const breakEven = finiteNumber(input.breakEvenCostPerRegistered);
  const start = input.dataStartDate === undefined ? DEFAULT_PROFIT.dataStartDate : String(input.dataStartDate || "");
  return {
    breakEvenCostPerRegistered: breakEven > 0 ? Math.round(breakEven * 100) / 100 : DEFAULT_PROFIT.breakEvenCostPerRegistered,
    dataStartDate: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : "",
    revenuePerRegistered: input.revenuePerRegistered === undefined || !(finiteNumber(input.revenuePerRegistered) >= 0)
      ? DEFAULT_PROFIT.revenuePerRegistered
      : Math.round(finiteNumber(input.revenuePerRegistered) * 100) / 100,
    revenueCurrency: cleanText(input.revenueCurrency).slice(0, 8) || DEFAULT_PROFIT.revenueCurrency,
    exchangeRate: finiteNumber(input.exchangeRate) > 0 ? Math.round(finiteNumber(input.exchangeRate) * 10000) / 10000 : DEFAULT_PROFIT.exchangeRate,
  };
}

function emptyState() {
  return {
    meta: { schemaVersion: 6, updatedAt: null },
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD", scoring: { ...DEFAULT_SCORING }, profit: { ...DEFAULT_PROFIT } },
    availability: { weekly: {}, overrides: {}, updatedAt: null },
    goals: [],
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
    crmLeads: [],
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
  state.settings.profit = normalizeProfitSettings(state.settings.profit || {});
  state.settings.leadDistribution = Leads.normalizeDistribution(state.settings.leadDistribution || {});
  const sheetUrl = state.settings.leadIntake?.sheetUrl;
  state.settings.leadIntake = { token: cleanText(state.settings.leadIntake?.token), sheetUrl: typeof sheetUrl === "string" ? cleanText(sheetUrl) : DEFAULT_LEAD_SHEET };
  state.settings.channelOverrides = state.settings.channelOverrides && typeof state.settings.channelOverrides === "object" ? state.settings.channelOverrides : {};
  ["adAccounts", "programs", "groups", "students", "payments", "agents", "campaigns", "adSets", "creatives", "imports", "outcomes", "leads", "crmLeads", "dailyLogs", "events", "goals"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
  state.meta.schemaVersion = 6;
  state.availability = normalizeAvailability(state.availability);
  state.goals = (Array.isArray(state.goals) ? state.goals : []).map((goal) => normalizeGoal({ ...goal }));
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
  state.agents.forEach((agent) => { agent.aliases = cleanAliases(agent.aliases); });
  rematchImportedAdSets(state); // keeps assignments in step with the current matching rules
  return state;
}

const storage = createStorage({ dataFile: DATA_FILE, createEmptyState: emptyState, normalizeState });
let storageReady = false;
// The "CMCG Leads" Google Sheet (Meta lead forms write into it). Readable by link,
// so the server pulls it every minute: no Apps Script needed.
const DEFAULT_LEAD_SHEET = "https://docs.google.com/spreadsheets/d/1AVwE6OB-IsIWKeRFZ-yAFmp2Q01p3P_z0HnPhFwQzgE/edit#gid=0";
let lastSheetSync = { at: "", added: 0, rows: 0, error: "" };
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

// Personal agent links: /a/<token> sets a cookie that logs the agent in to the
// Leads screen only. Tokens live on the agents; this cache serves static requests.
const AGENT_COOKIE = "cmcg_agent";
let agentTokens = new Map();
const agentLastSeen = new Map();
function refreshAgentTokens(state) {
  agentTokens = new Map((state?.agents || []).filter((agent) => agent.accessToken).map((agent) => [agent.accessToken, agent.id]));
}
function cookieValue(req, name) {
  const match = String(req.headers.cookie || "").split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}
function agentFromCookie(req, state = null) {
  const token = cookieValue(req, AGENT_COOKIE);
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null;
  const agentId = agentTokens.get(token);
  if (!agentId) return null;
  const agent = state?.agents?.find((item) => item.id === agentId && item.accessToken === token);
  if (state && !agent) return null;
  return { authenticated: true, authConfigured: hasAuth(), role: "sales", linkLogin: true, username: agent?.name || agentId, label: agent?.name || agentId, agentId, agentName: agent?.name || "" };
}

function authContext(req, state = null) {
  const credentialsGiven = basicCredentials(req).username;
  if (!credentialsGiven) {
    const viaLink = agentFromCookie(req, state);
    if (viaLink) return viaLink;
  }
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
    || state.events.some((event) => event.studentId)
    || (state.crmLeads || []).length,
  );
}

function publicStateWithoutStudentData(state) {
  const safe = JSON.parse(JSON.stringify(state));
  safe.groups = [];
  safe.students = [];
  safe.payments = [];
  safe.events = safe.events.filter((event) => !event.studentId);
  safe.crmLeads = [];
  safe.settings = { ...safe.settings, leadIntake: { token: "", sheetUrl: "" } };
  safe.meta = { ...safe.meta, sensitiveDataLocked: true };
  return safe;
}

function isSensitiveStudentApiPath(pathname) {
  return /^\/api\/(?:groups|students|operations|availability|crm-leads)(?:\/|$)/.test(pathname);
}

function requireConfiguredAuthForStudentData(res, pathname) {
  if (hasAuth() || !isSensitiveStudentApiPath(pathname)) return true;
  return json(res, 403, {
    error: "Secure login is required before saving student, group, or payment data. Add CRM_USER/CRM_PASSWORD for admin, or CRM_SALES_USER/CRM_SALES_PASSWORD/CRM_SALES_AGENT for a sales login, then restart the app.",
  });
}

function salesCanAccessApi(method, pathname, context = {}) {
  if (method === "GET" && pathname === "/api/state") return true;
  // Agents who log in with their personal link only work on their leads.
  if (context.linkLogin) {
    if ((method === "PATCH" || method === "POST") && /^\/api\/crm-leads(?:\/[^/]+)?$/.test(pathname) && !/\/(?:import|redistribute)$/.test(pathname)) return true;
    if (method === "POST" && /^\/api\/push\/(?:subscribe|unsubscribe|test)$/.test(pathname)) return true;
    return method === "GET" && /^\/api\/crm-leads\/[^/]+\/vcard$/.test(pathname);
  }
  if ((method === "POST" || method === "PATCH") && /^\/api\/programs(?:\/|$)/.test(pathname)) return true;
  if ((method === "POST" || method === "PATCH") && /^\/api\/groups(?:\/|$)/.test(pathname)) return true;
  if ((method === "POST" || method === "PATCH") && /^\/api\/students(?:\/|$)/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/availability(?:\/|$)/.test(pathname)) return true;
  if ((method === "PATCH" || method === "POST") && /^\/api\/crm-leads(?:\/[^/]+)?$/.test(pathname)) return true;
  if (method === "GET" && /^\/api\/crm-leads\/[^/]+\/vcard$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/push\/(?:subscribe|unsubscribe|test)$/.test(pathname)) return true;
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
  safe.crmLeads = context.agentId ? (state.crmLeads || []).filter((lead) => lead.agentId === context.agentId) : [];
  safe.agents = safe.agents.map(({ accessToken, ...agent }) => agent);
  if (context.linkLogin) {
    safe.programs = [];
    safe.groups = [];
    safe.students = [];
    safe.payments = [];
    safe.events = [];
  }
  safe.settings = { ...safe.settings, leadIntake: { token: "", sheetUrl: "" }, leadDistribution: { ...safe.settings.leadDistribution, agents: {} } };
  return safe;
}

function sendOperationsLockedPage(res) {
  res.writeHead(403, securityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMCG CRM locked</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:grid;min-height:100vh;place-items:center"><main style="max-width:640px;padding:28px"><p style="color:#86efac;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Secure area locked</p><h1>Student operations need CRM login first.</h1><p style="color:#cbd5e1;line-height:1.6">Add <strong>CRM_USER</strong>/<strong>CRM_PASSWORD</strong> for admin, or <strong>CRM_SALES_USER</strong>/<strong>CRM_SALES_PASSWORD</strong>/<strong>CRM_SALES_AGENT</strong> for a restricted sales login. Restart the app, then open this page again.</p></main></body></html>`);
}

const VERSIONED_ASSETS = ["app.js", "quality.js", "profit.js", "coach.js", "leads-ui.js", "styles.css"];

// Stamp asset URLs in the page with a hash of their contents, so a CDN or browser
// cache can never pair a freshly deployed index.html with an old app.js.
function versionAssetUrls(html) {
  const hash = crypto.createHash("sha1");
  VERSIONED_ASSETS.forEach((name) => {
    try { hash.update(fs.readFileSync(path.join(PUBLIC_DIR, name))); } catch {}
  });
  const version = hash.digest("hex").slice(0, 12);
  return html.replace(/(src|href)="\/(app\.js|quality\.js|profit\.js|coach\.js|leads-ui\.js|styles\.css)"/g, `$1="/$2?v=${version}"`);
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
    res.end(path.extname(filePath) === ".html" ? versionAssetUrls(content.toString("utf8")) : content);
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

const GOAL_TYPES = new Set(["registered", "cost_per_registered", "revenue", "custom"]);
function normalizeGoal(goal) {
  goal.id = goal.id || null;
  goal.type = GOAL_TYPES.has(cleanText(goal.type)) ? cleanText(goal.type) : "registered";
  goal.title = cleanText(goal.title);
  goal.target = nonNegativeMoney(goal.target);
  goal.metric = cleanText(goal.metric); // used when type === "custom"
  goal.from = validDateInput(goal.from) || "";
  goal.to = validDateInput(goal.to) || "";
  goal.createdAt = goal.createdAt || now();
  return goal;
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

// Spelling-tolerant key: no accents, no punctuation, doubled letters collapsed ("Hassan" -> "hasan").
function agentKey(value) {
  return normalizeForMatch(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "").replace(/(.)\1+/gu, "$1");
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

// "hasan", "Hassan", "hassane" all name the same agent; one typo is forgiven on names of 4+ letters.
function namesMatch(candidate, agentName) {
  const a = agentKey(candidate);
  const b = agentKey(agentName);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1;
}

function quotedNames(text) {
  return [...String(text || "").matchAll(/["“”«»„]\s*([^"“”«»„]+?)\s*["“”«»„]/g)].map((match) => match[1]).filter(Boolean);
}

function agentNames(agent) {
  return [agent.name, ...(Array.isArray(agent.aliases) ? agent.aliases : [])].filter(Boolean);
}

// Without quotes: the whole name (or an alias) must appear as words, allowing the same spelling tolerance.
function nameAppearsIn(agentName, text) {
  if (agentMatchesAdSet(agentName, text)) return true;
  const words = normalizeForMatch(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const size = normalizeForMatch(agentName).split(/[^\p{L}\p{N}]+/u).filter(Boolean).length || 1;
  for (let index = 0; index + size <= words.length; index += 1) {
    if (namesMatch(words.slice(index, index + size).join(" "), agentName)) return true;
  }
  return false;
}

function agentsNamedIn(state, text) {
  const active = state.agents.filter((agent) => agent.active !== false);
  const quoted = quotedNames(text);
  if (quoted.length) return { quoted, matches: active.filter((agent) => quoted.some((name) => agentNames(agent).some((agentName) => namesMatch(name, agentName)))) };
  return { quoted, matches: active.filter((agent) => agentNames(agent).some((agentName) => nameAppearsIn(agentName, text))) };
}

// The agent is named in the ad set name, or else in the campaign name. Text between quotes
// ("hassan") is always read as the agent's name.
function matchAgent(state, adSetName, campaignName = "") {
  let hint = "";
  for (const [text, source] of [[adSetName, "adSet"], [campaignName, "campaign"]]) {
    const { quoted, matches } = agentsNamedIn(state, text);
    if (!hint && quoted.length) hint = quoted[0];
    if (matches.length === 1) return { agentId: matches[0].id, agentMatchStatus: "matched", agentMatchSource: source, agentMatchCandidates: [], agentMatchHint: "" };
    if (matches.length > 1) return { agentId: "", agentMatchStatus: "ambiguous", agentMatchSource: source, agentMatchCandidates: matches.map((agent) => agent.id), agentMatchHint: "" };
  }
  return { agentId: "", agentMatchStatus: "unassigned", agentMatchSource: "", agentMatchCandidates: [], agentMatchHint: hint };
}

function rematchImportedAdSets(state) {
  state.adSets.filter((adSet) => adSet.metaAdSetId).forEach((adSet) => {
    const campaign = state.campaigns.find((item) => item.id === adSet.campaignId);
    Object.assign(adSet, matchAgent(state, adSet.name, campaign?.name || ""));
  });
  // A campaign's agent: named in the campaign itself, or shared by all of its matched ad sets.
  state.campaigns.forEach((campaign) => {
    const named = agentsNamedIn(state, campaign.name).matches;
    const fromAdSets = [...new Set(state.adSets.filter((adSet) => adSet.campaignId === campaign.id && adSet.agentId).map((adSet) => adSet.agentId))];
    campaign.agentId = named.length === 1 ? named[0].id : fromAdSets.length === 1 ? fromAdSets[0] : "";
    campaign.agentMatchSource = named.length === 1 ? "campaign" : fromAdSets.length === 1 ? "adSets" : "";
  });
  // Results recorded without an agent pick one up as soon as their ad set or campaign resolves to one.
  state.outcomes.forEach((outcome) => {
    if (outcome.agentId || outcome.assignmentLevel === "agent") return;
    const adSet = state.adSets.find((item) => item.id === outcome.adSetId);
    const campaign = state.campaigns.find((item) => item.id === outcome.campaignId);
    outcome.agentId = agentForAdSet(adSet, campaign);
  });
}

// An ad set that quotes an unknown name ("hsn") does not borrow the campaign's agent: that result needs a person to decide.
function agentForAdSet(adSet, campaign) {
  if (adSet?.agentId) return adSet.agentId;
  if (adSet?.agentMatchHint) return "";
  return campaign?.agentId || "";
}

function cleanAliases(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  return [...new Set(list.map((item) => cleanText(item).replace(/^["“”«»]+|["“”«»]+$/g, "")).filter(Boolean))].slice(0, 20);
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
      ...matchAgent(state, row["Ad set name"], row["Campaign name"]),
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
    Object.assign(result, { creativeId: creative.id, adSetId: adSet?.id || "", campaignId: campaign?.id || "", agentId: adSet ? agentForAdSet(adSet, campaign) : campaign?.agentId || "" });
  } else if (level === "adSet") {
    const adSet = state.adSets.find((item) => item.id === targetId);
    if (!adSet) return null;
    const campaign = state.campaigns.find((item) => item.id === adSet.campaignId);
    Object.assign(result, { adSetId: adSet.id, campaignId: adSet.campaignId || "", agentId: agentForAdSet(adSet, campaign) });
  } else if (level === "campaign") {
    const campaign = state.campaigns.find((item) => item.id === targetId);
    if (!campaign) return null;
    Object.assign(result, { campaignId: campaign.id, agentId: campaign.agentId || "" });
  } else if (level === "agent") {
    const agent = state.agents.find((item) => item.id === targetId);
    if (!agent) return null;
    result.agentId = agent.id;
  } else {
    return null;
  }
  return result;
}

// Google Sheets pushes new form leads here with the intake token instead of a login.
async function handleLeadIntake(req, res, url) {
  if (!storageReady) return json(res, 503, { ok: false, error: "CRM storage is starting. Try again in a moment." });
  const release = await acquireMutationLock();
  try {
    const state = await storage.read();
    const token = cleanText(url.searchParams.get("token") || req.headers["x-intake-token"]);
    const expected = state.settings.leadIntake?.token || "";
    const valid = expected && token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!valid) return json(res, 401, { ok: false, error: "Invalid intake token" });
    const body = await parseBody(req);
    const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : [body.row || body];
    if (rows.length > 5000) return json(res, 400, { ok: false, error: "Send at most 5000 rows at a time" });
    const summary = Leads.ingestLeadRows(state, rows, { distribution: state.settings.leadDistribution, source: "form" });
    if (summary.added || summary.updated) await storage.write(state);
    return json(res, 200, { ok: true, ...summary });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || "Could not read these leads" });
  } finally {
    release();
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  if (method === "POST" && url.pathname === "/api/lead-intake") return handleLeadIntake(req, res, url);
  const initialAuth = requireAuth(req, res);
  if (!initialAuth) return;

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
    refreshAgentTokens(state);
    const context = authContext(req, state);
    if (context.role === "sales" && !salesCanAccessApi(method, url.pathname, context)) {
      return json(res, 403, { error: "This login can only access student operations." });
    }
    if (context.role === "sales" && context.agentId) agentLastSeen.set(context.agentId, now());
    if (method === "GET" && url.pathname === "/api/state") {
      const sensitiveLocked = !hasAuth() && hasSensitiveStudentData(state);
      return json(res, 200, {
        state: withoutPush(sensitiveLocked ? publicStateWithoutStudentData(state) : stateForUser(state, context)),
        push: pushInfo(state, context),
        authEnabled: hasAuth(),
        sensitiveLocked,
        currentUser: publicUser(context),
        leadSheetSync: context.role === "sales" ? null : lastSheetSync,
        leadStats: sensitiveLocked ? [] : Leads.leadStats(state).map((row) => ({ ...row, lastSeenAt: agentLastSeen.get(row.agentId) || "" })),
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

    if (method === "GET" && url.pathname === "/api/report") {
      const query = url.searchParams;
      const format = (query.get("format") || "json").toLowerCase();
      if (!["json", "csv", "md"].includes(format)) return json(res, 400, { error: "format must be json, csv, or md" });
      // Without login, student names and payments stay out of the export (same rule as /api/state).
      const studentDataAllowed = hasAuth() || !hasSensitiveStudentData(state);
      const report = buildReport(state, {
        preset: query.get("preset") || "",
        from: query.get("from") || "",
        to: query.get("to") || "",
        today: todayIn(process.env.REPORT_TIME_ZONE || "Africa/Casablanca"),
        includePersonal: studentDataAllowed && query.get("personal") === "1",
        includeStudents: studentDataAllowed,
        respectDataStart: query.get("allData") !== "1",
      });
      let body;
      let contentType;
      try {
        if (format === "csv") { body = toCsv(report, (query.get("table") || "all").toLowerCase()); contentType = "text/csv; charset=utf-8"; }
        else if (format === "md") { body = toMarkdown(report); contentType = "text/markdown; charset=utf-8"; }
        else { body = JSON.stringify(report, null, 2); contentType = "application/json; charset=utf-8"; }
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
      const headers = { "Content-Type": contentType, "Cache-Control": "no-store" };
      if (query.get("download") === "1") {
        const table = format === "csv" && query.get("table") && query.get("table") !== "all" ? `-${query.get("table")}` : "";
        headers["Content-Disposition"] = `attachment; filename="cmcg-report-${report.meta.period.from}_${report.meta.period.to}${table}.${format}"`;
      }
      res.writeHead(200, securityHeaders(headers));
      return res.end(body);
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
      return json(res, 200, { seeded: true, result, state: withoutPush(stateForUser(state, context)) });
    }

    if (method === "POST" && url.pathname === "/api/restore") {
      const body = await parseBody(req);
      const restored = normalizeState(body.state || body);
      const entityCount = restored.programs.length + restored.agents.length + restored.campaigns.length
        + restored.groups.length + restored.students.length + restored.payments.length
        + restored.adSets.length + restored.creatives.length + restored.leads.length + restored.dailyLogs.length;
      if (!entityCount) return json(res, 400, { error: "This backup does not contain CRM records" });
      restored.meta.restoredAt = now();
      if (state.push) restored.push = state.push; // phones stay subscribed after a restore
      await storage.write(restored);
      return json(res, 200, { restored: true, state: withoutPush(restored) });
    }

    if (method === "POST" && url.pathname === "/api/settings/scoring") {
      const body = await parseBody(req);
      const scoring = normalizeScoringSettings(body);
      state.settings.scoring = scoring;
      await storage.write(state);
      return json(res, 200, { settings: state.settings });
    }

    if (method === "POST" && url.pathname === "/api/settings/profit") {
      const body = await parseBody(req);
      const next = { ...state.settings.profit, ...body };
      if (!(finiteNumber(next.breakEvenCostPerRegistered) > 0)) return json(res, 400, { error: "Break-even cost per registration must be greater than 0" });
      if (next.dataStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(next.dataStartDate))) return json(res, 400, { error: "Choose a valid start date" });
      if (body.revenuePerRegistered !== undefined && !(finiteNumber(body.revenuePerRegistered) >= 0)) return json(res, 400, { error: "Revenue per registered student must be 0 or more" });
      if (body.exchangeRate !== undefined && !(finiteNumber(body.exchangeRate) > 0)) return json(res, 400, { error: "The exchange rate must be greater than 0" });
      state.settings.profit = normalizeProfitSettings(next);
      await storage.write(state);
      return json(res, 200, { settings: state.settings });
    }

    if (method === "POST" && url.pathname === "/api/reset-data") {
      const reset = emptyState();
      reset.centre = { ...reset.centre, ...(state.centre || {}) };
      reset.settings = { ...reset.settings, currency: state.settings?.currency || reset.settings.currency, profit: normalizeProfitSettings(state.settings?.profit || {}), leadDistribution: state.settings?.leadDistribution, leadIntake: state.settings?.leadIntake, channelOverrides: state.settings?.channelOverrides };
      if (state.push) reset.push = state.push;
      reset.meta.resetAt = now();
      await storage.write(reset);
      return json(res, 200, { reset: true, state: withoutPush(reset) });
    }

    if (method === "POST" && url.pathname === "/api/meta-import") {
      const body = await parseBody(req);
      if (!cleanText(body.csv)) return json(res, 400, { error: "Choose a Meta Ads CSV report" });
      const result = importMetaCsv(state, body.csv, body.filename);
      Leads.reattributeLeads(state);
      await storage.write(state);
      return json(res, 200, { result, state: withoutPush(state) });
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
      // No agent in the names: use the one picked in the form, if any (leaving it empty is allowed).
      const pickedAgent = state.agents.find((agent) => agent.id === cleanText(body.agentId));
      if (!target.agentId && pickedAgent) target.agentId = pickedAgent.id;
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

    if (method === "POST" && url.pathname === "/api/goals") {
      const body = await parseBody(req);
      const goal = normalizeGoal({ id: id("goal"), ...body });
      if (!goal.target) return json(res, 400, { error: "Enter a goal target greater than zero" });
      if (!goal.from || !goal.to) return json(res, 400, { error: "Choose a start and end date for the goal" });
      if (goal.type === "custom" && !goal.metric) return json(res, 400, { error: "Choose which metric this custom goal tracks" });
      state.goals.push(goal);
      await storage.write(state);
      return json(res, 201, goal);
    }

    const goalMatch = url.pathname.match(/^\/api\/goals\/([^/]+)$/);
    if (method === "PATCH" && goalMatch) {
      const body = await parseBody(req);
      const goal = state.goals.find((item) => item.id === goalMatch[1]);
      if (!goal) return json(res, 404, { error: "Goal not found" });
      Object.assign(goal, body, { id: goal.id, createdAt: goal.createdAt });
      normalizeGoal(goal);
      if (!goal.target) return json(res, 400, { error: "Enter a goal target greater than zero" });
      goal.updatedAt = now();
      await storage.write(state);
      return json(res, 200, goal);
    }
    if (method === "DELETE" && goalMatch) {
      const index = state.goals.findIndex((item) => item.id === goalMatch[1]);
      if (index === -1) return json(res, 404, { error: "Goal not found" });
      const [removed] = state.goals.splice(index, 1);
      await storage.write(state);
      return json(res, 200, { removed: true, goal: removed });
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

    if (method === "DELETE" && studentMatch) {
      const student = state.students.find((item) => item.id === studentMatch[1]);
      if (!student) return json(res, 404, { error: "Student not found" });
      if (context.role === "sales" && student.agentId !== context.agentId) return json(res, 403, { error: "This student belongs to another sales agent." });
      // Remove the student entirely: their record, payments, and timeline events.
      const removedPayments = state.payments.filter((p) => p.studentId === student.id).length;
      state.payments = state.payments.filter((p) => p.studentId !== student.id);
      state.events = state.events.filter((e) => e.studentId !== student.id);
      state.students = state.students.filter((s) => s.id !== student.id);
      await storage.write(state);
      return json(res, 200, { removed: true, student: { id: student.id, name: student.name }, removedPayments });
    }

    if (method === "POST" && url.pathname === "/api/agents") {
      const body = await parseBody(req);
      const item = {
        id: id("agt"),
        name: cleanText(body.name),
        whatsapp: cleanText(body.whatsapp),
        aliases: cleanAliases(body.aliases),
        code: cleanText(body.code).toLocaleUpperCase().slice(0, 4),
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
        if (body.aliases !== undefined) agent.aliases = cleanAliases(body.aliases);
        if (body.code !== undefined) agent.code = cleanText(body.code).toLocaleUpperCase().slice(0, 4);
        agent.active = body.active !== false && body.active !== "false";
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

    // ---- Lead pipeline (form leads from Google Sheets + WhatsApp leads) ----
    const isAdmin = context.role !== "sales";
    const leadAgentName = (agentId) => state.agents.find((agent) => agent.id === agentId)?.name || "";
    if (method === "POST" && url.pathname === "/api/lead-intake/token") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can change the intake link" });
      state.settings.leadIntake = { token: crypto.randomBytes(18).toString("hex") };
      await storage.write(state);
      return json(res, 200, { token: state.settings.leadIntake.token });
    }
    if (method === "POST" && url.pathname === "/api/settings/lead-distribution") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can change lead distribution" });
      const body = await parseBody(req);
      state.settings.leadDistribution = Leads.normalizeDistribution({ ...state.settings.leadDistribution, ...body, templates: { ...state.settings.leadDistribution.templates, ...(body.templates || {}) } });
      await storage.write(state);
      return json(res, 200, { settings: state.settings });
    }
    if (method === "POST" && url.pathname === "/api/settings/channels") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can change channels" });
      const body = await parseBody(req);
      if (body.splitFrom !== undefined) {
        const from = cleanText(body.splitFrom);
        if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return json(res, 400, { error: "Choose a valid date" });
        state.settings.splitTestFrom = from;
        await storage.write(state);
        return json(res, 200, { settings: state.settings });
      }
      const campaign = state.campaigns.find((item) => item.id === cleanText(body.campaignId));
      if (!campaign) return json(res, 400, { error: "Choose a valid campaign" });
      const channel = cleanText(body.channel);
      if (channel && !["form", "whatsapp", "exclude"].includes(channel)) return json(res, 400, { error: "Channel must be form, whatsapp or exclude" });
      if (channel) state.settings.channelOverrides[campaign.id] = channel;
      else delete state.settings.channelOverrides[campaign.id];
      await storage.write(state);
      return json(res, 200, { settings: state.settings });
    }
    if (method === "POST" && /^\/api\/push\/(?:subscribe|unsubscribe|test)$/.test(url.pathname)) {
      const owner = pushOwner(context);
      if (!owner) return json(res, 403, { error: "No agent for this login" });
      const body = await parseBody(req);
      ensurePushKeys(state);
      const subscription = body.subscription || {};
      if (url.pathname.endsWith("/subscribe")) {
        if (!/^https:\/\//.test(String(subscription.endpoint || "")) || !subscription.keys?.p256dh || !subscription.keys?.auth) return json(res, 400, { error: "Invalid subscription" });
        state.push.subscriptions = state.push.subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
        state.push.subscriptions.push({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, owner, device: cleanText(body.device).slice(0, 80), createdAt: now() });
        await storage.write(state);
        return json(res, 200, { ok: true, devices: state.push.subscriptions.filter((item) => item.owner === owner).length });
      }
      if (url.pathname.endsWith("/unsubscribe")) {
        state.push.subscriptions = state.push.subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
        await storage.write(state);
        return json(res, 200, { ok: true });
      }
      const targets = state.push.subscriptions.filter((item) => item.owner === owner);
      const results = await sendPushAll(state, targets, { title: "🔔 التنبيهات تعمل", body: "هكذا ستصلك كل رسالة جديدة، حتى والتطبيق مغلق.", tag: "test", url: "/#view=leads" });
      return json(res, 200, { sent: results.sent, devices: targets.length });
    }
    if (method === "POST" && url.pathname === "/api/crm-leads/sync") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can sync the sheet" });
      const body = await parseBody(req);
      if (typeof body.sheetUrl === "string") {
        if (body.sheetUrl && !sheetCsvUrl(body.sheetUrl)) return json(res, 400, { error: "Paste the Google Sheet link" });
        state.settings.leadIntake = { ...state.settings.leadIntake, sheetUrl: cleanText(body.sheetUrl) };
        await storage.write(state);
      }
      return json(res, 200, { sync: await syncLeadSheet(state) });
    }
    if (method === "POST" && url.pathname === "/api/crm-leads/import") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can import leads" });
      const body = await parseBody(req);
      const rows = parseCsv(String(body.csv || ""));
      if (!rows.length) return json(res, 400, { error: "This file has no lead rows" });
      const summary = Leads.ingestLeadRows(state, rows, { distribution: state.settings.leadDistribution, source: "form" });
      await storage.write(state);
      return json(res, 200, summary);
    }
    if (method === "POST" && url.pathname === "/api/crm-leads/demo") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can add demo leads" });
      const body = await parseBody(req);
      if (body.action === "remove") {
        const removed = Leads.removeDemoLeads(state);
        await storage.write(state);
        return json(res, 200, { removed });
      }
      const hidden = state.settings.leadDistribution.agents || {};
      const agentIds = state.agents.filter((agent) => agent.active !== false && !hidden[agent.id]?.hidden).map((agent) => agent.id);
      if (!agentIds.length) return json(res, 400, { error: "Add an agent first" });
      const created = Leads.createDemoLeads(state, agentIds);
      await storage.write(state);
      return json(res, 201, { created: created.length });
    }
    if (method === "POST" && url.pathname === "/api/crm-leads/transfer") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can transfer leads" });
      const body = await parseBody(req);
      try {
        const result = Leads.transferLeads(state, {
          from: Array.isArray(body.from) ? body.from.map(cleanText) : [],
          statuses: Array.isArray(body.statuses) ? body.statuses.map(cleanText) : [],
          to: Array.isArray(body.to) ? body.to.map(cleanText) : [],
          by: context.label || context.username,
          dryRun: body.dryRun === true,
        });
        if (!body.dryRun && result.moved) await storage.write(state);
        return json(res, 200, result);
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
    }
    if (method === "POST" && url.pathname === "/api/crm-leads/redistribute") {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can distribute leads" });
      let assigned = 0;
      state.crmLeads.filter((lead) => !lead.agentId && !Leads.CLOSED_STATUSES.has(lead.status)).forEach((lead) => {
        const agentId = Leads.pickAgent(state, lead, { ...state.settings.leadDistribution, mode: state.settings.leadDistribution.mode === "manual" ? "balanced" : state.settings.leadDistribution.mode });
        if (!agentId) return;
        lead.agentId = agentId;
        lead.assignedAt = now();
        Leads.syncLeadOutcomes(state, lead);
        assigned += 1;
      });
      await storage.write(state);
      return json(res, 200, { assigned });
    }
    if (method === "POST" && url.pathname === "/api/crm-leads") {
      const body = await parseBody(req);
      if (!isAdmin && !context.agentId) return json(res, 403, { error: "This sales login is not linked to an agent." });
      const agentId = isAdmin ? cleanText(body.agentId) : context.agentId;
      if (agentId && !state.agents.some((agent) => agent.id === agentId)) return json(res, 400, { error: "Choose a valid sales agent" });
      const lead = Leads.createManualLead(state, body, { by: context.label || context.username, agentId });
      await storage.write(state);
      return json(res, 201, lead);
    }
    const agentLinkMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/access-link$/);
    if (agentLinkMatch && (method === "POST" || method === "DELETE")) {
      if (!isAdmin) return json(res, 403, { error: "Only an admin can manage agent links" });
      const agent = state.agents.find((item) => item.id === agentLinkMatch[1]);
      if (!agent) return json(res, 404, { error: "Agent not found" });
      agent.accessToken = method === "POST" ? crypto.randomBytes(16).toString("hex") : "";
      await storage.write(state);
      refreshAgentTokens(state);
      return json(res, 200, { token: agent.accessToken, path: agent.accessToken ? `/a/${agent.accessToken}` : "" });
    }
    const crmLeadVcard = url.pathname.match(/^\/api\/crm-leads\/([^/]+)\/vcard$/);
    if (method === "GET" && crmLeadVcard) {
      const lead = state.crmLeads.find((item) => item.id === crmLeadVcard[1]);
      if (!lead || (!isAdmin && lead.agentId !== context.agentId)) return json(res, 404, { error: "Lead not found" });
      const campaign = state.campaigns.find((item) => item.id === lead.campaignId);
      const filename = (cleanText(lead.name) || lead.phone || "lead").replace(/[^\p{L}\p{N} _-]+/gu, "").slice(0, 60) || "lead";
      res.writeHead(200, securityHeaders({
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="lead.vcf"; filename*=UTF-8''${encodeURIComponent(filename)}.vcf`,
        "Cache-Control": "no-store",
      }));
      return res.end(Leads.leadVcard(lead, { campaignName: campaign?.name || lead.meta?.formName || "" }));
    }
    const crmLeadMatch = url.pathname.match(/^\/api\/crm-leads\/([^/]+)$/);
    if (crmLeadMatch && (method === "PATCH" || method === "DELETE")) {
      const lead = state.crmLeads.find((item) => item.id === crmLeadMatch[1]);
      if (!lead || (!isAdmin && lead.agentId !== context.agentId)) return json(res, 404, { error: "Lead not found" });
      if (method === "DELETE") {
        if (!isAdmin) return json(res, 403, { error: "Only an admin can delete leads" });
        state.crmLeads = state.crmLeads.filter((item) => item.id !== lead.id);
        state.outcomes = state.outcomes.filter((outcome) => outcome.leadId !== lead.id);
        await storage.write(state);
        return json(res, 200, { removed: true });
      }
      const body = await parseBody(req);
      if (body.agentId !== undefined) {
        if (!isAdmin) return json(res, 403, { error: "Only an admin can reassign leads" });
        const agentId = cleanText(body.agentId);
        if (agentId && !state.agents.some((agent) => agent.id === agentId)) return json(res, 400, { error: "Choose a valid sales agent" });
        if (agentId !== lead.agentId) {
          lead.history = lead.history || [];
          lead.history.push({ at: now(), type: "reassigned", from: leadAgentName(lead.agentId), to: leadAgentName(agentId), by: context.label || context.username });
          lead.agentId = agentId;
          lead.assignedAt = now();
        }
      }
      if (isAdmin && (body.creativeId !== undefined || body.adSetId !== undefined || body.campaignId !== undefined)) {
        const ad = state.creatives.find((item) => item.id === cleanText(body.creativeId));
        const adSet = state.adSets.find((item) => item.id === (cleanText(body.adSetId) || ad?.adSetId));
        const campaign = state.campaigns.find((item) => item.id === (cleanText(body.campaignId) || adSet?.campaignId));
        Object.assign(lead, { creativeId: ad?.id || "", adSetId: adSet?.id || "", campaignId: campaign?.id || "" });
      }
      try {
        Leads.updateLead(state, lead, body, context.label || context.username);
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
      await storage.write(state);
      return json(res, 200, lead);
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

    if (method === "POST" && url.pathname === "/api/manual-budget") {
      const body = await parseBody(req);
      const total = nonNegativeMoney(body.amount ?? body.spend);
      if (!total) return json(res, 400, { error: "Enter a budget amount greater than zero" });
      // Resolve the attachment level. Any of agent/campaign/adSet, or center-wide (none).
      const level = cleanText(body.level || "center").toLocaleLowerCase();
      let adSetId = "";
      let campaignId = "";
      let agentId = "";
      if (level === "adset") {
        const adSet = state.adSets.find((item) => item.id === cleanText(body.targetId));
        if (!adSet) return json(res, 400, { error: "Choose a valid ad set" });
        adSetId = adSet.id; campaignId = adSet.campaignId || ""; agentId = adSet.agentId || "";
      } else if (level === "campaign") {
        const campaign = state.campaigns.find((item) => item.id === cleanText(body.targetId));
        if (!campaign) return json(res, 400, { error: "Choose a valid campaign" });
        campaignId = campaign.id;
      } else if (level === "agent") {
        const agent = state.agents.find((item) => item.id === cleanText(body.targetId));
        if (!agent) return json(res, 400, { error: "Choose a valid agent" });
        agentId = agent.id;
      } else if (level !== "center") {
        return json(res, 400, { error: "Invalid budget level" });
      }
      // Build the day list from the window and split the total evenly.
      const from = validDateInput(body.from);
      const to = validDateInput(body.to) || from;
      if (!from) return json(res, 400, { error: "Choose a start date" });
      const days = [];
      for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
        if (days.length > 366) break; // guard against absurd ranges
      }
      if (!days.length) return json(res, 400, { error: "The date range is empty" });
      const perDay = Number((total / days.length).toFixed(2));
      const batchId = id("mbudget");
      const created = days.map((date, index) => {
        // Put any rounding remainder on the last day so the batch sums exactly.
        const spend = index === days.length - 1 ? Number((total - perDay * (days.length - 1)).toFixed(2)) : perDay;
        const log = {
          id: id("log"), source: "manual", batchId,
          date, reportingStart: date, reportingEnd: date,
          creativeId: "", adSetId, campaignId, agentId,
          spend, messages: 0,
          label: cleanText(body.label),
          notes: cleanText(body.notes),
          createdAt: now(),
        };
        state.dailyLogs.push(log);
        return log;
      });
      await storage.write(state);
      return json(res, 201, { batchId, level, days: days.length, total, logs: created });
    }

    const dailyLogMatch = url.pathname.match(/^\/api\/daily-logs\/([^/]+)$/);
    if (method === "DELETE" && dailyLogMatch) {
      const target = dailyLogMatch[1];
      // Allow deleting a single manual log or a whole manual batch by batchId.
      const before = state.dailyLogs.length;
      state.dailyLogs = state.dailyLogs.filter((log) => log.source === "manual" && (log.id === target || log.batchId === target) ? false : true);
      const removed = before - state.dailyLogs.length;
      if (!removed) return json(res, 404, { error: "No manual budget entry matched" });
      await storage.write(state);
      return json(res, 200, { removed });
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

function agentCookie(req, token) {
  const secure = req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").includes("https");
  return `${AGENT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}${secure ? "; Secure" : ""}`;
}

function sendAgentLinkExpired(res) {
  res.writeHead(403, securityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Set-Cookie": `${AGENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  }));
  res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMCG</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0b4f4a;color:#fff;display:grid;min-height:100vh;place-items:center;text-align:center"><main style="padding:28px;max-width:420px"><h1>تغيّر رابطك 🔗</h1><p style="opacity:.85;line-height:1.7">اطلبي رابطك الجديد من الإدارة، وافتحيه مرة واحدة في هاتفك. لا حاجة لكلمة سر.</p></main></body></html>`);
}

async function handleAgentLink(req, res, token) {
  const page = (title, text) => {
    res.writeHead(403, securityHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }));
    res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMCG</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0b4f4a;color:#fff;display:grid;min-height:100vh;place-items:center;text-align:center"><main style="padding:28px;max-width:420px"><h1>${title}</h1><p style="opacity:.85;line-height:1.7">${text}</p></main></body></html>`);
  };
  if (!storageReady) return page("لحظة…", "النظام قيد التشغيل، أعيدي فتح الرابط بعد ثوانٍ.");
  const state = await storage.read();
  refreshAgentTokens(state);
  const agent = state.agents.find((item) => item.accessToken === token && item.active !== false);
  if (!agent) return page("الرابط غير صالح", "تم تغيير هذا الرابط أو إلغاؤه. اطلبي رابطاً جديداً من الإدارة.");
  res.writeHead(302, securityHeaders({
    "Set-Cookie": agentCookie(req, token),
    Location: "/#view=leads",
    "Cache-Control": "no-store",
  }));
  return res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const linkMatch = url.pathname.match(/^\/a\/([a-f0-9]{32})\/?$/);
  if (linkMatch) return handleAgentLink(req, res, linkMatch[1]);
  if (url.pathname === "/manifest.webmanifest") return sendManifest(req, res);
  // Public, secret-free assets the browser fetches without a login (icons, push worker).
  if (["/sw.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"].includes(url.pathname)) return serveStatic(req, res);
  // /admin: forget an agent link opened in this browser and go back to the admin CRM.
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    res.writeHead(302, securityHeaders({
      "Set-Cookie": `${AGENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      Location: "/",
      "Cache-Control": "no-store",
    }));
    return res.end();
  }
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  if (OPERATIONS_ROUTES.has(url.pathname) && !hasAuth()) return sendOperationsLockedPage(res);
  const agentToken = cookieValue(req, AGENT_COOKIE);
  if (agentToken && !basicCredentials(req).username) {
    const viaLink = agentFromCookie(req);
    // A changed or blocked link: explain instead of showing a password box.
    if (!viaLink) return sendAgentLinkExpired(res);
    // Each visit renews the login for another 180 days, so agents never log in again.
    if (url.pathname === "/" || url.pathname === "/index.html") res.setHeader("Set-Cookie", agentCookie(req, agentToken));
    return serveStatic(req, res);
  }
  if (!requireAuth(req, res)) return;
  return serveStatic(req, res);
});

// ---------- Push alerts for new leads ----------
// Each new lead rings the assigned agent at once, again at 5, 15 and 30 minutes
// while it is still not called (reminders only 09:00-21:00 Morocco time); the
// admin gets the first alert and an escalation at 15 minutes.
const ALERT_STEPS = [0, 5, 15, 30];
function withoutPush(state) {
  if (!state || !state.push) return state;
  const { push, ...rest } = state;
  return rest;
}
function pushOwner(context) {
  if (context.role === "sales") return context.agentId || "";
  return "admin";
}
function ensurePushKeys(state) {
  if (state.push?.publicKey && state.push?.privateKey) {
    state.push.subscriptions = Array.isArray(state.push.subscriptions) ? state.push.subscriptions : [];
    return false;
  }
  state.push = { ...Push.generateVapidKeys(), since: now(), subscriptions: [] };
  return true;
}
function pushInfo(state, context) {
  const owner = pushOwner(context);
  return { publicKey: state.push?.publicKey || "", devices: (state.push?.subscriptions || []).filter((item) => item.owner === owner).length };
}
function moroccoHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Casablanca" }).format(date));
}
async function sendPushAll(state, targets, data) {
  const keys = { publicKey: state.push.publicKey, privateKey: state.push.privateKey };
  const gone = [];
  let sent = 0;
  await Promise.all(targets.map(async (subscription) => {
    try {
      const status = await Push.sendPush(subscription, data, keys, { ttl: 6 * 3600, urgency: "high", topic: data.tag });
      if (status === 404 || status === 410) gone.push(subscription.endpoint);
      else if (status >= 200 && status < 300) sent += 1;
    } catch {}
  }));
  return { sent, gone };
}
let leadAlertsRunning = false;
async function runLeadAlerts() {
  if (!storageReady || leadAlertsRunning) return;
  leadAlertsRunning = true;
  try {
    const jobs = [];
    let snapshot = null;
    const release = await acquireMutationLock();
    try {
      const state = await storage.read();
      if (ensurePushKeys(state)) { await storage.write(state); return; }
      if (!state.push.subscriptions.length) return;
      const since = Date.parse(state.push.since) || 0;
      const nowMs = Date.now();
      const awake = moroccoHour() >= 9 && moroccoHour() < 21;
      (state.crmLeads || []).forEach((lead) => {
        if (lead.demo || lead.status !== "new" || !lead.agentId) return;
        const start = Date.parse(lead.assignedAt || lead.createdAt) || 0;
        if (start < since || nowMs - start > 6 * 3600 * 1000) return;
        const count = Number(lead.alerts?.count || 0);
        if (count >= ALERT_STEPS.length || nowMs < start + ALERT_STEPS[count] * 60000) return;
        if (count > 0 && !awake) return;
        lead.alerts = { count: count + 1, lastAt: now() };
        jobs.push({ lead: { id: lead.id, name: lead.name, phone: lead.phone, agentId: lead.agentId, adName: lead.meta?.adName || "" }, level: count, minutes: Math.round((nowMs - start) / 60000) });
      });
      if (jobs.length) await storage.write(state);
      snapshot = state;
    } finally {
      release();
    }
    if (!jobs.length || !snapshot) return;
    const gone = [];
    for (const { lead, level, minutes } of jobs) {
      const who = lead.name || (lead.phone ? `+${lead.phone}` : "رسالة جديدة");
      const rawName = snapshot.agents.find((agent) => agent.id === lead.agentId)?.name || "";
      const agentName = rawName.charAt(0).toLocaleUpperCase() + rawName.slice(1);
      const base = { tag: `lead-${lead.id}`, url: `/#view=leads&lead=${lead.id}`, leadId: lead.id, phone: lead.phone };
      const agentTargets = snapshot.push.subscriptions.filter((item) => item.owner === lead.agentId);
      const agentData = level === 0
        ? { ...base, title: `🔥 رسالة جديدة: ${who}`, body: `اتصلي الآن وهي ساخنة${lead.adName ? ` · ${lead.adName}` : ""}`, level }
        : { ...base, title: `⏰ لم تتصلي بعد بـ ${who}`, body: `مرّت ${minutes} دقيقة. كل دقيقة تقلّل فرصة الحجز، اتصلي الآن 📞`, level };
      const results = [await sendPushAll(snapshot, agentTargets, agentData)];
      const adminTargets = snapshot.push.subscriptions.filter((item) => item.owner === "admin");
      if (level === 0) results.push(await sendPushAll(snapshot, adminTargets, { ...base, title: `📥 رسالة جديدة لـ ${agentName}`, body: who, level, admin: true }));
      if (level === 2) results.push(await sendPushAll(snapshot, adminTargets, { ...base, title: `🚨 ${agentName} لم تتصل بعد`, body: `${who} ينتظر منذ ${minutes} دقيقة`, level, admin: true }));
      results.forEach((result) => gone.push(...result.gone));
    }
    if (gone.length) {
      const release2 = await acquireMutationLock();
      try {
        const state = await storage.read();
        state.push.subscriptions = (state.push.subscriptions || []).filter((item) => !gone.includes(item.endpoint));
        await storage.write(state);
      } finally {
        release2();
      }
    }
  } catch (error) {
    console.error("Lead alerts failed:", error.message);
  } finally {
    leadAlertsRunning = false;
  }
}

// Installable app: an agent's home-screen icon reopens her own link.
function sendManifest(req, res) {
  const agentToken = cookieValue(req, AGENT_COOKIE);
  const viaLink = agentToken ? agentFromCookie(req) : null;
  res.writeHead(200, securityHeaders({ "Content-Type": MIME[".webmanifest"], "Cache-Control": "no-store" }));
  res.end(JSON.stringify({
    name: viaLink ? `CMCG · ${viaLink.agentName || "الرسائل"}` : "CMCG CRM",
    short_name: viaLink ? "CMCG رسائل" : "CMCG CRM",
    start_url: viaLink ? `/a/${agentToken}` : "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b4f4a",
    theme_color: "#0f766e",
    dir: viaLink ? "rtl" : "auto",
    lang: viaLink ? "ar" : "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }));
}

function sheetCsvUrl(link) {
  const id = String(link || "").match(/\/d\/([\w-]{20,})/)?.[1] || (/^[\w-]{20,}$/.test(String(link || "")) ? link : "");
  if (!id) return "";
  const gid = String(link).match(/[#&?]gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// heldState: called from a request that already holds the mutation lock.
async function syncLeadSheet(heldState = null) {
  if (!storageReady) return lastSheetSync;
  const csvUrl = sheetCsvUrl((heldState || await storage.read()).settings?.leadIntake?.sheetUrl);
  if (!csvUrl) return lastSheetSync;
  try {
    const response = await fetch(csvUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    if (!response.ok || /^\s*</.test(text)) throw new Error("لا يمكن قراءة الورقة: شاركيها «أي شخص لديه الرابط · عارض»");
    const rows = parseCsv(text);
    const release = heldState ? () => {} : await acquireMutationLock();
    try {
      const state = heldState || await storage.read();
      const summary = Leads.ingestLeadRows(state, rows, { distribution: state.settings.leadDistribution, source: "form" });
      if (summary.added) await storage.write(state);
      lastSheetSync = { at: new Date().toISOString(), added: summary.added, rows: rows.length, error: "" };
      if (summary.added) {
        console.log(`Google Sheet: ${summary.added} new lead(s)`);
        setTimeout(() => runLeadAlerts().catch(() => {}), 500);
      }
    } finally {
      release();
    }
  } catch (error) {
    const message = /fetch failed|timeout|abort|ENOTFOUND|ECONN/i.test(error.message || "") ? "تعذّر الوصول إلى Google، ستُعاد المحاولة بعد دقيقة" : error.message;
    lastSheetSync = { ...lastSheetSync, at: new Date().toISOString(), error: message || "فشلت المزامنة" };
  }
  return lastSheetSync;
}

server.listen(PORT, () => {
  console.log(`CMCG CRM listening on http://localhost:${PORT}`);
});

storage.init().then(async () => {
  storageReady = true;
  try { refreshAgentTokens(await storage.read()); } catch {}
  // Keep form leads tied to their own Meta campaign (fixes old same-name matches).
  try {
    const release = await acquireMutationLock();
    try {
      const state = await storage.read();
      const fixed = Leads.reattributeLeads(state);
      if (fixed) { await storage.write(state); console.log(`Re-attributed ${fixed} form lead(s)`); }
    } finally {
      release();
    }
  } catch (error) { console.error("Lead re-attribution failed:", error.message); }
  // One-time clean-up: the demo leads have done their job.
  try {
    const state = await storage.read();
    if (!state.settings?.demoLeadsWipedAt && (state.crmLeads || []).some((lead) => lead.demo)) {
      const removed = Leads.removeDemoLeads(state);
      state.settings.demoLeadsWipedAt = new Date().toISOString();
      await storage.write(state);
      console.log(`Removed ${removed} demo lead(s)`);
    }
  } catch (error) { console.error("Demo leads clean-up failed:", error.message); }
  if (process.env.CRM_PUSH !== "0") {
    runLeadAlerts().catch(() => {});
    setInterval(() => runLeadAlerts().catch(() => {}), 30 * 1000).unref();
  }
  if (process.env.CRM_SHEET_SYNC !== "0") {
    syncLeadSheet().catch(() => {});
    setInterval(() => syncLeadSheet().catch(() => {}), 60 * 1000).unref();
  }
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
