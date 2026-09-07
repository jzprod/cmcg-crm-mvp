let state = null;
let authEnabled = false;
let sensitiveLocked = false;
let storageInfo = null;
let pendingRestore = null;
let pendingMetaFile = null;
let toastTimer = null;
let editingAgentId = "";
let editingStudentId = "";
let paymentStudentId = "";
let detailStudentId = "";
let plannerSuggestions = [];

const pageMeta = {
  dashboard: ["Overview", "Your advertising and enrollment results at a glance."],
  performance: ["Performance", "Compare ads, ad sets, campaigns, objectives, and agents."],
  outcomes: ["Outcomes", "Appointments, visits, and registered students."],
  groups: ["Groupes & paiements", "Planning, capacité, inscriptions, avances et historique étudiant."],
  agents: ["Agents", "Manage automatic ad-set assignment."],
  data: ["Import & data", "Synchronize Meta Ads and protect your CRM data."],
};
const outcomeMeta = {
  booked: { label: "Booked appointment", short: "Booked", className: "booked" },
  showed: { label: "Showed, no registration", short: "Showed", className: "showed" },
  registered: { label: "Registered student", short: "Registered", className: "registered" },
};
const groupLabels = { ad: "Ad", adSet: "Ad set", campaign: "Campaign", agent: "Agent" };
const periodLabels = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", thisWeek: "This week", thisMonth: "This month", thisYear: "This year", lifetime: "Lifetime", custom: "Custom" };
const overviewMetricDefinitions = {
  spend: { label: "Spend", color: "#0f172a", format: (row) => money(row.spend) },
  messages: { label: "Messages", color: "#2563eb", format: (row) => number(row.messages) },
  booked: { label: "Booked", color: "#d97706", format: (row) => number(row.booked) },
  visited: { label: "Visited", color: "#7c3aed", format: (row) => number(row.visited) },
  registered: { label: "Registered", color: "#16a34a", format: (row) => number(row.registered) },
  costRegisteredEfficiency: { label: "Cost/register improves", color: "#dc2626", inverted: true, format: (row) => row.registered ? cost(row.spend, row.registered) : "-" },
};
const filters = { from: "", to: "", agentId: "", objective: "", campaignId: "", search: "" };
const operationsFilters = { trainingId: "", timing: "", payment: "", search: "" };
let groupBy = "ad";
let sortBy = "quality";
let selectedPeriod = localStorage.getItem("cmcg-report-period") || "last7";

function readOverviewMetrics() {
  try {
    const stored = JSON.parse(localStorage.getItem("cmcg-overview-metrics") || "[]");
    if (Array.isArray(stored)) {
      const valid = stored.filter((key) => overviewMetricDefinitions[key]);
      if (valid.length) return new Set(valid);
    }
  } catch {}
  return new Set(["messages", "registered", "costRegisteredEfficiency"]);
}

let selectedOverviewMetrics = readOverviewMetrics();

const columnDefinitions = [
  { key: "entity", label: "Name", required: true },
  { key: "quality", label: "Business quality", required: true },
  { key: "status", label: "Status", default: true },
  { key: "agent", label: "Agent", default: true },
  { key: "objective", label: "Objective", default: true },
  { key: "spend", label: "Spend", default: true, numeric: true },
  { key: "messages", label: "Messages", default: true, numeric: true },
  { key: "booked", label: "Booked", default: true, numeric: true },
  { key: "visits", label: "Total visits", default: true, numeric: true },
  { key: "showed", label: "Showed, no registration", default: true, numeric: true },
  { key: "registered", label: "Registered", default: true, numeric: true },
  { key: "costBooked", label: "Cost / booked", default: true, numeric: true },
  { key: "costVisit", label: "Cost / visit", default: true, numeric: true },
  { key: "costShowed", label: "Cost / showed only", default: false, numeric: true },
  { key: "costRegistered", label: "Cost / registered", default: true, numeric: true },
  { key: "showRate", label: "Show rate", default: false, numeric: true },
  { key: "closeRate", label: "Close rate", default: false, numeric: true },
  { key: "agentClosing", label: "Agent closing", default: false },
  { key: "campaign", label: "Campaign", default: false },
  { key: "adSet", label: "Ad set", default: false },
  { key: "code", label: "Short code", default: false },
  { key: "delivery", label: "Delivery", default: false },
  { key: "deliveryLevel", label: "Delivery level", default: false },
  { key: "resultType", label: "Result type", default: false },
  { key: "results", label: "Meta results", default: false, numeric: true },
  { key: "costPerResult", label: "Cost / Meta result", default: false, numeric: true },
  { key: "messagesReplied", label: "Messages replied", default: false, numeric: true },
  { key: "impressions", label: "Impressions", default: false, numeric: true },
  { key: "reach", label: "Reach (reported sum)", default: false, numeric: true },
  { key: "frequency", label: "Frequency", default: false, numeric: true },
  { key: "linkClicks", label: "Link clicks", default: false, numeric: true },
  { key: "shopClicks", label: "Shop clicks", default: false, numeric: true },
  { key: "clicksAll", label: "All clicks", default: false, numeric: true },
  { key: "ctr", label: "Link CTR", default: false, numeric: true },
  { key: "cpc", label: "Link CPC", default: false, numeric: true },
  { key: "ctrAll", label: "All-click CTR", default: false, numeric: true },
  { key: "cpcAll", label: "All-click CPC", default: false, numeric: true },
  { key: "cpm", label: "CPM", default: false, numeric: true },
  { key: "landingPageViews", label: "Landing-page views", default: false, numeric: true },
  { key: "costLandingPageView", label: "Cost / landing-page view", default: false, numeric: true },
  { key: "qualityRanking", label: "Quality ranking", default: false },
  { key: "engagementRanking", label: "Engagement ranking", default: false },
  { key: "conversionRanking", label: "Conversion ranking", default: false },
  { key: "reportingStart", label: "Reporting starts", default: false },
  { key: "reportingEnd", label: "Reporting ends", default: false },
  { key: "account", label: "Account", default: false },
  { key: "accountId", label: "Account ID", default: false },
  { key: "campaignId", label: "Campaign ID", default: false },
  { key: "adSetId", label: "Ad set ID", default: false },
  { key: "adId", label: "Ad ID", default: false },
  { key: "pageId", label: "Page ID", default: false },
  { key: "action", label: "", required: true },
];

function defaultColumns() {
  return columnDefinitions.filter((column) => column.required || column.default).map((column) => column.key);
}

function readColumns() {
  try {
    const stored = JSON.parse(localStorage.getItem("cmcg-visible-columns"));
    const currentVersion = localStorage.getItem("cmcg-columns-version");
    if (Array.isArray(stored) && currentVersion === "3") return new Set([...stored, "entity", "quality", "action"]);
    localStorage.setItem("cmcg-columns-version", "3");
  } catch {}
  return new Set(defaultColumns());
}

let visibleColumns = readColumns();
const byId = (items, id) => (items || []).find((item) => item.id === id) || null;
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const number = (value) => new Intl.NumberFormat("en-MA", { maximumFractionDigits: 2 }).format(Number(value || 0));
const currency = () => state?.settings?.currency || "USD";
const money = (value) => `${new Intl.NumberFormat("en-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency()}`;
const cost = (spend, count) => (count ? money(spend / count) : "—");
const legacyWelcomeMessage = "مرحباً، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان:";

const percent = (value) => Number.isFinite(Number(value)) ? `${number(Number(value) * 100)}%` : "-";

function dateInputValue(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function periodRange(preset = selectedPeriod, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "lifetime") return { from: "", to: "" };
  if (preset === "today") return { from: dateInputValue(today), to: dateInputValue(today) };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: dateInputValue(yesterday), to: dateInputValue(yesterday) };
  }
  if (preset === "thisWeek") {
    const day = today.getDay() || 7;
    return { from: dateInputValue(addDays(today, 1 - day)), to: dateInputValue(today) };
  }
  if (preset === "thisMonth") return { from: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: dateInputValue(today) };
  if (preset === "thisYear") return { from: dateInputValue(new Date(today.getFullYear(), 0, 1)), to: dateInputValue(today) };
  return { from: dateInputValue(addDays(today, -6)), to: dateInputValue(today) };
}

function savePeriod() {
  localStorage.setItem("cmcg-report-period", selectedPeriod);
  localStorage.setItem("cmcg-report-from", filters.from || "");
  localStorage.setItem("cmcg-report-to", filters.to || "");
}

function updatePeriodControls() {
  const preset = document.getElementById("periodPreset");
  if (!preset) return;
  preset.value = selectedPeriod;
  document.getElementById("periodFrom").value = filters.from || "";
  document.getElementById("periodTo").value = filters.to || "";
  document.getElementById("periodSummary").textContent = selectedPeriod === "lifetime" ? "All dates" : `${filters.from || "Start"} to ${filters.to || "Today"}`;
}

function applyPeriodPreset(preset = "last7", shouldRender = true) {
  selectedPeriod = periodLabels[preset] ? preset : "last7";
  if (selectedPeriod === "custom") {
    filters.from = localStorage.getItem("cmcg-report-from") || filters.from;
    filters.to = localStorage.getItem("cmcg-report-to") || filters.to;
  } else {
    const range = periodRange(selectedPeriod);
    filters.from = range.from;
    filters.to = range.to;
  }
  savePeriod();
  updatePeriodControls();
  if (shouldRender && state) render();
}

function initializePeriod() {
  selectedPeriod = periodLabels[selectedPeriod] ? selectedPeriod : "last7";
  if (selectedPeriod === "custom") {
    filters.from = localStorage.getItem("cmcg-report-from") || "";
    filters.to = localStorage.getItem("cmcg-report-to") || "";
  } else {
    const range = periodRange(selectedPeriod);
    filters.from = range.from;
    filters.to = range.to;
  }
}

initializePeriod();

function normalizeState() {
  ["adAccounts", "programs", "groups", "students", "payments", "agents", "campaigns", "adSets", "creatives", "imports", "outcomes", "leads", "dailyLogs", "events"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
  state.settings = state.settings || {};
  state.settings.scoring = CmcgQuality.normalizeSettings(state.settings.scoring || state.settings);
  state.groups.forEach((group) => {
    group.days = Array.isArray(group.days) ? group.days : String(group.days || "").split(",").map((item) => item.trim()).filter(Boolean);
    group.attendanceMode = group.attendanceMode === "flexible_shift" ? "flexible_shift" : "fixed";
    group.alternateDays = Array.isArray(group.alternateDays) ? group.alternateDays : String(group.alternateDays || "").split(",").map((item) => item.trim()).filter(Boolean);
    group.alternateTimeStart = group.alternateTimeStart || "";
    group.alternateTimeEnd = group.alternateTimeEnd || "";
  });
}

function scoringTargets() {
  return CmcgQuality.deriveTargets(state?.settings || {}, []);
}

function formatSavedAt(value) {
  if (!value) return "No saved changes yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved" : `Saved ${date.toLocaleString()}`;
}

function toast(message, type = "success") {
  const element = document.getElementById("toast");
  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.toggle("error", type === "error");
  element.classList.remove("hidden");
  toastTimer = setTimeout(() => element.classList.add("hidden"), 3600);
}

async function api(route, options = {}) {
  const response = await fetch(route, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  const data = await api("/api/state");
  state = data.state;
  normalizeState();
  authEnabled = data.authEnabled;
  sensitiveLocked = Boolean(data.sensitiveLocked);
  storageInfo = data.storage;
  render();
  const requestedPanel = panelFromLocation();
  if (pageMeta[requestedPanel]) showPanel(requestedPanel, false);
}

function panelFromLocation() {
  const hashPanel = window.location.hash.slice(1).replace(/^view=/, "");
  if (pageMeta[hashPanel]) return hashPanel;
  if (["/groups", "/students", "/operations", "/planning"].includes(window.location.pathname)) return "groups";
  return "";
}

function option(label, value = "") {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function relationForAd(ad) {
  const adSet = byId(state.adSets, ad?.adSetId);
  const campaign = byId(state.campaigns, adSet?.campaignId);
  const account = byId(state.adAccounts, campaign?.accountId);
  const agent = byId(state.agents, adSet?.agentId);
  return { ad, adSet, campaign, account, agent, objective: adSet?.objective || campaign?.objective || "" };
}

function relationForLog(log) {
  return relationForAd(byId(state.creatives, log.creativeId));
}

function relationForOutcome(outcome) {
  const ad = byId(state.creatives, outcome.creativeId);
  const adSet = byId(state.adSets, outcome.adSetId || ad?.adSetId);
  const campaign = byId(state.campaigns, outcome.campaignId || adSet?.campaignId);
  const agent = byId(state.agents, outcome.agentId || adSet?.agentId);
  return { ad, adSet, campaign, agent, objective: adSet?.objective || campaign?.objective || "" };
}

function overlapsRange(start, end) {
  return (!filters.from || (end || start) >= filters.from) && (!filters.to || start <= filters.to);
}

function relationMatches(relation, text = "") {
  if (filters.agentId && relation.agent?.id !== filters.agentId) return false;
  if (filters.objective && relation.objective !== filters.objective) return false;
  if (filters.campaignId && relation.campaign?.id !== filters.campaignId) return false;
  if (filters.search) {
    const haystack = [relation.ad?.name, relation.adSet?.name, relation.campaign?.name, relation.agent?.name, relation.objective, text].join(" ").toLocaleLowerCase();
    if (!haystack.includes(filters.search.toLocaleLowerCase())) return false;
  }
  return true;
}

function filteredLogs() {
  return state.dailyLogs.filter((log) => {
    const start = log.reportingStart || log.date || "";
    const end = log.reportingEnd || log.date || start;
    return overlapsRange(start, end) && relationMatches(relationForLog(log));
  });
}

function filteredOutcomes() {
  return state.outcomes.filter((outcome) => overlapsRange(outcome.sourceDate || outcome.date, outcome.date)
    && relationMatches(relationForOutcome(outcome), [outcome.personName, outcome.phone, outcome.notes].join(" ")));
}

function emptyMetrics() {
  return { spend: 0, messages: 0, messagesReplied: 0, results: 0, impressions: 0, reach: 0, linkClicks: 0, shopClicks: 0, clicksAll: 0, landingPageViews: 0, booked: 0, showed: 0, registered: 0, visits: 0, firstActivityDate: "", lastActivityDate: "" };
}

function recordActivityDate(target, value) {
  const date = dateOnly(value);
  if (!date) return;
  if (!target.firstActivityDate || date < target.firstActivityDate) target.firstActivityDate = date;
  if (!target.lastActivityDate || date > target.lastActivityDate) target.lastActivityDate = date;
}

function addLogMetrics(target, log) {
  ["spend", "messages", "messagesReplied", "results", "impressions", "reach", "linkClicks", "shopClicks", "clicksAll", "landingPageViews"].forEach((key) => { target[key] += Number(log[key] || 0); });
  recordActivityDate(target, log.reportingStart || log.date);
  recordActivityDate(target, log.reportingEnd || log.date);
}

function groupKeyForRelation(relation, type) {
  if (type === "ad") return relation.ad?.id || "";
  if (type === "adSet") return relation.adSet?.id || "";
  if (type === "campaign") return relation.campaign?.id || "";
  return relation.agent?.id || "__unassigned";
}

function groupDescriptor(key, type) {
  if (key === "__unassigned") return { key, name: "Unassigned", targetId: "", relation: {} };
  if (type === "ad") {
    const ad = byId(state.creatives, key);
    return { key, name: ad?.name || "Unknown ad", targetId: ad?.id || "", relation: relationForAd(ad) };
  }
  if (type === "adSet") {
    const adSet = byId(state.adSets, key);
    const campaign = byId(state.campaigns, adSet?.campaignId);
    const account = byId(state.adAccounts, campaign?.accountId);
    const agent = byId(state.agents, adSet?.agentId);
    return { key, name: adSet?.name || "Unknown ad set", targetId: adSet?.id || "", relation: { adSet, campaign, account, agent, objective: adSet?.objective || campaign?.objective || "" } };
  }
  if (type === "campaign") {
    const campaign = byId(state.campaigns, key);
    const account = byId(state.adAccounts, campaign?.accountId);
    return { key, name: campaign?.name || "Unknown campaign", targetId: campaign?.id || "", relation: { campaign, account, objective: campaign?.objective || "" } };
  }
  const agent = byId(state.agents, key);
  return { key, name: agent?.name || "Unknown agent", targetId: agent?.id || "", relation: { agent } };
}

function performanceRows(type = groupBy, useFilters = true, criterion = sortBy) {
  const rows = new Map();
  function ensure(key) {
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { ...groupDescriptor(key, type), ...emptyMetrics(), latestLog: null });
    return rows.get(key);
  }
  const logs = useFilters ? filteredLogs() : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes() : state.outcomes;
  logs.forEach((log) => {
    const relation = relationForLog(log);
    const row = ensure(groupKeyForRelation(relation, type));
    if (!row) return;
    addLogMetrics(row, log);
    if (!row.latestLog || String(log.reportingEnd || log.date) > String(row.latestLog.reportingEnd || row.latestLog.date)) row.latestLog = log;
  });
  outcomes.forEach((outcome) => {
    const relation = relationForOutcome(outcome);
    const key = groupKeyForRelation(relation, type);
    if (type === "ad" && outcome.assignmentLevel !== "ad") return;
    if (type === "adSet" && !outcome.adSetId) return;
    if (type === "campaign" && !outcome.campaignId) return;
    if (type === "agent" && !outcome.agentId) return;
    const row = ensure(key);
    if (row) {
      row[outcome.type] += 1;
      if (outcome.type === "registered" || outcome.type === "showed") row.visits += 1;
      recordActivityDate(row, outcome.sourceDate || outcome.date);
      recordActivityDate(row, outcome.date);
    }
  });
  return CmcgQuality.sortRows(CmcgQuality.scoreRows([...rows.values()], state.settings), criterion);
}

function overallMetrics(useFilters = true) {
  const values = emptyMetrics();
  const logs = useFilters ? filteredLogs() : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes() : state.outcomes;
  logs.forEach((log) => addLogMetrics(values, log));
  outcomes.forEach((outcome) => {
    values[outcome.type] += 1;
    if (outcome.type === "registered" || outcome.type === "showed") values.visits += 1;
  });
  values.visited = values.visits;
  return values;
}

function overviewDailyRows() {
  const rows = new Map();
  const ensure = (date) => {
    const key = dateOnly(date);
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { date: key, ...emptyMetrics(), visited: 0 });
    return rows.get(key);
  };
  filteredLogs().forEach((log) => {
    const row = ensure(log.reportingEnd || log.date || log.reportingStart);
    if (!row) return;
    addLogMetrics(row, log);
  });
  filteredOutcomes().forEach((outcome) => {
    const row = ensure(outcome.sourceDate || outcome.date);
    if (!row) return;
    row[outcome.type] += 1;
    if (outcome.type === "registered" || outcome.type === "showed") row.visits += 1;
    row.visited = row.visits;
  });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30).map((row) => ({ ...row, visited: row.visits }));
}

function metricRawValue(key, row) {
  if (key === "visited") return row.visited || row.visits || 0;
  if (key === "costRegisteredEfficiency") return row.registered ? row.spend / row.registered : null;
  return Number(row[key] || 0);
}

function metricDisplayValue(key, row) {
  const definition = overviewMetricDefinitions[key];
  if (!definition) return "";
  return definition.format(row);
}

function chartPath(points) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderOverviewChart() {
  const container = document.getElementById("overviewChart");
  if (!container) return;
  const rows = overviewDailyRows();
  const metrics = [...selectedOverviewMetrics].filter((key) => overviewMetricDefinitions[key]);
  if (!rows.length || !metrics.length) {
    container.innerHTML = '<div class="empty chart-empty">Click one or more cards above after importing reports to build the trend graph.</div>';
    return;
  }
  const width = 920;
  const height = 320;
  const pad = { left: 38, right: 24, top: 24, bottom: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (rows.length === 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const yFor = (score) => pad.top + innerHeight - (Math.max(0, Math.min(100, score)) / 100) * innerHeight;

  const series = metrics.map((key) => {
    const raw = rows.map((row) => metricRawValue(key, row));
    const usable = raw.filter((value) => value !== null && Number.isFinite(value));
    const max = Math.max(...usable, 0);
    const min = Math.min(...usable);
    const points = raw.map((value, index) => {
      if (value === null || !Number.isFinite(value)) return null;
      let score = 0;
      if (key === "costRegisteredEfficiency") {
        score = usable.length <= 1 || max === min ? 100 : ((max - value) / (max - min)) * 100;
      } else {
        score = max ? (value / max) * 100 : 0;
      }
      return { x: xFor(index), y: yFor(score), raw: value, row: rows[index] };
    }).filter(Boolean);
    return { key, points, definition: overviewMetricDefinitions[key], latest: rows.at(-1) };
  });

  const grid = [0, 25, 50, 75, 100].map((value) => {
    const y = yFor(value);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" /><text x="10" y="${y + 4}">${value}</text>`;
  }).join("");
  const xLabels = rows.filter((_, index) => index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0).map((row, index, labels) => {
    const rowIndex = rows.indexOf(row);
    return `<text x="${xFor(rowIndex)}" y="${height - 14}" text-anchor="${index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}">${escapeHtml(row.date.slice(5))}</text>`;
  }).join("");
  const lines = series.map(({ key, points, definition }) => {
    if (!points.length) return "";
    const pathPoints = points.length === 1 ? [{ ...points[0], x: pad.left }, { ...points[0], x: width - pad.right }] : points;
    return `<path d="${chartPath(pathPoints)}" stroke="${definition.color}" /><g>${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" stroke="${definition.color}"><title>${escapeHtml(definition.label)} - ${escapeHtml(point.row.date)} - ${escapeHtml(metricDisplayValue(key, point.row))}</title></circle>`).join("")}</g>`;
  }).join("");
  const legend = series.map(({ key, definition, latest }) => `<span class="chart-legend-item" style="--legend-color:${definition.color}"><i></i><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(metricDisplayValue(key, latest))}${definition.inverted ? " · up means cheaper" : ""}</small></span>`).join("");
  container.innerHTML = `<div class="chart-legend">${legend}</div><svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Overview trend graph">${grid}<g class="trend-lines">${lines}</g><g class="trend-axis">${xLabels}</g></svg><p class="chart-note">Lines are scaled 0-100 so different metrics can sit on one graph. For cost per registered, the line is reversed: higher means the cost is lower.</p>`;
}

function renderKpis() {
  const values = overallMetrics(true);
  const items = [
    ["Spend", money(values.spend), "from Meta reports", "neutral", "spend"],
    ["Messages", number(values.messages), cost(values.spend, values.messages) + " each", "blue", "messages"],
    ["Booked", number(values.booked), cost(values.spend, values.booked) + " each", "amber", "booked"],
    ["Visited", number(values.visited), `${values.showed} without registration`, "violet", "visited"],
    ["Registered", number(values.registered), cost(values.spend, values.registered) + " each", "green", "registered"],
    ["Cost / registered", cost(values.spend, values.registered), "graph rises when cost falls", "red", "costRegisteredEfficiency"],
  ];
  document.getElementById("kpis").innerHTML = items.map(([label, value, detail, style, metric]) => `<button class="kpi ${style} ${selectedOverviewMetrics.has(metric) ? "selected" : ""}" type="button" data-kpi-metric="${metric}" aria-pressed="${selectedOverviewMetrics.has(metric)}"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></button>`).join("");
  renderOverviewChart();
  const welcome = document.getElementById("welcomeState");
  welcome.classList.toggle("hidden", state.imports.length > 0);
  if (!state.imports.length) welcome.innerHTML = `<div><strong>Start with your Meta Ads report</strong><p>Import the saved CSV once. Campaigns, ad sets, ads, spend, and messages will appear automatically.</p></div><button class="button primary" type="button" data-open-import>Import first report</button>`;
}

function renderFunnel() {
  const values = overallMetrics(true);
  const data = [["Messages", values.messages], ["Booked", values.booked], ["Visits", values.visited], ["Registered", values.registered]];
  const maximum = Math.max(1, ...data.map(([, value]) => value));
  document.getElementById("funnel").innerHTML = data.map(([label, value]) => {
    const width = Math.max(value ? 3 : 0, Math.round((value / maximum) * 100));
    return `<div class="funnel-row"><span>${label}</span><div class="funnel-track" role="img" aria-label="${escapeHtml(label)}: ${value}"><span style="width:${width}%"></span></div><strong>${number(value)}</strong></div>`;
  }).join("");
}

function renderAttention() {
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  const ambiguous = unassigned.filter((adSet) => adSet.agentMatchStatus === "ambiguous").length;
  const latest = state.imports[0];
  const items = [
    { value: unassigned.length, label: "Unassigned ad sets", detail: unassigned.length ? "Add agents whose names appear in these ad sets." : "Every imported ad set has an agent.", action: "agents" },
    { value: ambiguous, label: "Ambiguous matches", detail: ambiguous ? "More than one agent name was found." : "No conflicting agent names found.", action: "agents" },
    { value: latest ? new Date(latest.importedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Never", label: "Last report import", detail: latest ? `${latest.rows} ad rows synchronized.` : "Import your first Meta Ads CSV.", action: "data" },
  ];
  document.getElementById("attentionList").innerHTML = items.map((item) => `<button type="button" data-tab-link="${item.action}" class="attention-item"><span class="attention-value">${escapeHtml(item.value)}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6 1.4-1.4 7.4 7.4-7.4 7.4L9 18Z"/></svg></button>`).join("");
}

function addOutcomeButton(level, targetId, label) {
  if (!targetId) return "";
  return `<button class="row-add" type="button" data-add-outcome data-level="${level}" data-target="${escapeHtml(targetId)}" aria-label="Add outcome for ${escapeHtml(label)}" title="Add outcome">+</button>`;
}

function qualityBadge(row) {
  const band = CmcgQuality.qualityBand(row);
  const score = row.qualityScore === null || row.qualityScore === undefined ? "-" : row.qualityScore;
  const confidence = row.qualityConfidence?.label || "Low confidence";
  const detail = band.key === "pending" ? `Inside ${row.closingWindowDays || scoringTargets().closingWindowDays}-day closing window` : confidence;
  return `<span class="quality-badge quality-${band.key}" title="${escapeHtml(detail)}"><strong>${score}</strong><span>${escapeHtml(band.label)}<small>${escapeHtml(row.qualityConfidence?.key || "low")}</small></span></span>`;
}

function agentClosingBadge(row) {
  const band = row.agentClosingStatus || { key: "none", label: "No data" };
  const score = row.agentClosingScore === null || row.agentClosingScore === undefined ? "-" : row.agentClosingScore;
  return `<span class="quality-badge quality-${band.key}" title="Agent score uses show rate and visit-to-registration close rate"><strong>${score}</strong><span>${escapeHtml(band.label)}<small>sales</small></span></span>`;
}

function statusPill(row) {
  const band = CmcgQuality.qualityBand(row);
  const confidence = row.qualityConfidence?.label || "Low confidence";
  return `<span class="status-pill quality-${band.key}" title="${escapeHtml(confidence)}">${escapeHtml(band.label)}</span>`;
}

function qualityRowClass(row) {
  return `quality-row-${CmcgQuality.qualityBand(row).key}`;
}

function renderOverviewTables() {
  const ads = performanceRows("ad", true, "quality").slice(0, 7);
  document.getElementById("overviewRows").innerHTML = ads.length ? ads.map((row) => `<tr class="${qualityRowClass(row)}"><td>${entityCell(row, "ad")}</td><td>${qualityBadge(row)}</td><td>${escapeHtml(row.relation.agent?.name || "Unassigned")}</td><td class="number-cell">${money(row.spend)}</td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.visits}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td><td>${addOutcomeButton("ad", row.targetId, row.name)}</td></tr>`).join("") : '<tr><td colspan="10" class="empty">Import a Meta Ads report to see performance.</td></tr>';
  const agents = performanceRows("agent", true, "quality").filter((row) => row.key !== "__unassigned");
  document.getElementById("agentRows").innerHTML = agents.length ? agents.map((row) => `<tr class="${qualityRowClass(row)}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${qualityBadge(row)}</td><td>${agentClosingBadge(row)}</td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.visits}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td></tr>`).join("") : '<tr><td colspan="8" class="empty">Add agents to compare their results.</td></tr>';
}

function entityCell(row, type = groupBy) {
  const relation = row.relation;
  let context = "";
  if (type === "ad") context = [relation.adSet?.name, relation.campaign?.name].filter(Boolean).join(" · ");
  if (type === "adSet") context = relation.campaign?.name || "";
  if (type === "campaign") context = relation.objective || "";
  if (type === "agent") context = row.key === "__unassigned" ? "Create a matching agent" : "Matched from ad set names";
  return `<div class="entity-cell"><strong>${escapeHtml(row.name)}</strong>${context ? `<small>${escapeHtml(context)}</small>` : ""}</div>`;
}

function cellValue(column, row) {
  const relation = row.relation || {};
  const latest = row.latestLog || {};
  const values = {
    entity: entityCell(row),
    quality: qualityBadge(row),
    status: statusPill(row),
    agentClosing: groupBy === "agent" ? agentClosingBadge(row) : "-",
    agent: escapeHtml(relation.agent?.name || (groupBy === "agent" ? row.name : "Unassigned")),
    objective: escapeHtml(relation.objective || relation.adSet?.objective || relation.campaign?.objective || "—"),
    spend: money(row.spend), messages: number(row.messages), booked: row.booked, visits: row.visits, showed: row.showed, registered: `<strong>${row.registered}</strong>`,
    costBooked: cost(row.spend, row.booked), costVisit: cost(row.spend, row.visits), costShowed: cost(row.spend, row.showed), costRegistered: cost(row.spend, row.registered),
    showRate: percent(row.showRate), closeRate: percent(row.closeRate),
    campaign: escapeHtml(relation.campaign?.name || (groupBy === "campaign" ? row.name : "—")),
    adSet: escapeHtml(relation.adSet?.name || (groupBy === "adSet" ? row.name : "—")),
    code: relation.ad?.code ? `<span class="code">${escapeHtml(relation.ad.code)}</span>` : "—",
    delivery: escapeHtml(relation.ad?.deliveryStatus || relation.adSet?.deliveryStatus || relation.campaign?.deliveryStatus || "—"),
    deliveryLevel: escapeHtml(relation.ad?.deliveryLevel || latest.raw?.["Delivery level"] || "—"),
    resultType: escapeHtml(latest.resultType || "—"), results: number(row.results), costPerResult: cost(row.spend, row.results), messagesReplied: number(row.messagesReplied),
    impressions: number(row.impressions), reach: number(row.reach), frequency: row.reach ? number(row.impressions / row.reach) : "—",
    linkClicks: number(row.linkClicks), shopClicks: number(row.shopClicks), clicksAll: number(row.clicksAll), ctr: row.impressions ? `${number((row.linkClicks / row.impressions) * 100)}%` : "—",
    cpc: row.linkClicks ? money(row.spend / row.linkClicks) : "—", ctrAll: row.impressions ? `${number((row.clicksAll / row.impressions) * 100)}%` : "—", cpcAll: row.clicksAll ? money(row.spend / row.clicksAll) : "—",
    cpm: row.impressions ? money((row.spend / row.impressions) * 1000) : "—", landingPageViews: number(row.landingPageViews), costLandingPageView: cost(row.spend, row.landingPageViews),
    qualityRanking: escapeHtml(latest.qualityRanking || "—"), engagementRanking: escapeHtml(latest.engagementRanking || "—"), conversionRanking: escapeHtml(latest.conversionRanking || "—"),
    reportingStart: escapeHtml(latest.reportingStart || latest.date || "—"), reportingEnd: escapeHtml(latest.reportingEnd || latest.date || "—"),
    account: escapeHtml(relation.account?.name || "—"), accountId: escapeHtml(relation.account?.metaAccountId || "—"),
    campaignId: escapeHtml(relation.campaign?.metaCampaignId || "—"), adSetId: escapeHtml(relation.adSet?.metaAdSetId || "—"), adId: escapeHtml(relation.ad?.metaAdId || "—"),
    pageId: escapeHtml(relation.ad?.pageId || "—"),
    action: addOutcomeButton(groupBy, row.targetId, row.name),
  };
  return values[column.key] ?? escapeHtml(latest[column.key] || "—");
}

function renderColumnOptions() {
  document.getElementById("columnOptions").innerHTML = columnDefinitions.filter((column) => !column.required).map((column) => `<label><input type="checkbox" data-column="${column.key}" ${visibleColumns.has(column.key) ? "checked" : ""} /><span>${escapeHtml(column.label)}</span></label>`).join("");
}

function renderPerformance() {
  const rows = performanceRows();
  const agentColumns = new Set(["agentClosing", "showRate", "closeRate"]);
  const columns = columnDefinitions.filter((column) => {
    if (groupBy !== "agent" && column.key === "agentClosing") return false;
    return visibleColumns.has(column.key) || (groupBy === "agent" && agentColumns.has(column.key));
  });
  document.getElementById("performanceCount").textContent = `${rows.length} ${groupBy === "ad" ? "ads" : groupBy === "adSet" ? "ad sets" : groupBy === "campaign" ? "campaigns" : "agents"}`;
  document.getElementById("performanceTable").innerHTML = `<table><thead><tr>${columns.map((column) => `<th class="${column.numeric ? "number-cell" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr class="${qualityRowClass(row)}">${columns.map((column) => `<td class="${column.numeric ? "number-cell" : ""}">${cellValue(column, row)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="empty">No performance matches these filters.</td></tr>`}</tbody></table>`;
  renderColumnOptions();
}

function outcomeSource(outcome) {
  const relation = relationForOutcome(outcome);
  if (outcome.assignmentLevel === "ad") return { name: relation.ad?.name || "Unknown ad", detail: relation.adSet?.name || "Ad" };
  if (outcome.assignmentLevel === "adSet") return { name: relation.adSet?.name || "Unknown ad set", detail: relation.campaign?.name || "Ad set" };
  if (outcome.assignmentLevel === "campaign") return { name: relation.campaign?.name || "Unknown campaign", detail: "Campaign" };
  return { name: relation.agent?.name || "Unknown agent", detail: "Agent" };
}

function visibleOutcomes() {
  const query = document.getElementById("outcomeSearch").value.trim().toLocaleLowerCase();
  const type = document.getElementById("outcomeTypeFilter").value;
  return [...state.outcomes].filter((outcome) => {
    const source = outcomeSource(outcome);
    const relation = relationForOutcome(outcome);
    const haystack = [outcome.personName, outcome.phone, outcome.notes, source.name, relation.agent?.name].join(" ").toLocaleLowerCase();
    return overlapsRange(outcome.sourceDate || outcome.date, outcome.date) && (!type || outcome.type === type) && (!query || haystack.includes(query));
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function renderOutcomes() {
  const outcomes = visibleOutcomes();
  document.getElementById("outcomeCount").textContent = `${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"}`;
  document.getElementById("outcomeRows").innerHTML = outcomes.length ? outcomes.map((outcome) => {
    const meta = outcomeMeta[outcome.type] || { label: outcome.type, className: "" };
    const source = outcomeSource(outcome);
    const agent = relationForOutcome(outcome).agent;
    return `<tr><td>${escapeHtml(outcome.date)}</td><td><span class="outcome-pill ${meta.className}">${escapeHtml(meta.label)}</span></td><td><div class="entity-cell"><strong>${escapeHtml(outcome.personName || "Not entered")}</strong><small>${escapeHtml(outcome.phone || "No phone")}</small></div></td><td><div class="entity-cell"><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></td><td>${escapeHtml(agent?.name || "—")}</td><td>${escapeHtml(outcome.notes || "—")}</td><td><button class="delete-button" type="button" data-delete-outcome="${escapeHtml(outcome.id)}" aria-label="Delete outcome" title="Delete"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7ZM9 9v8h2V9H9Zm4 0v8h2V9h-2ZM8 3h8l1 1h4v2H3V4h4l1-1Z"/></svg></button></td></tr>`;
  }).join("") : '<tr><td colspan="7" class="empty">No outcomes recorded yet. Use “Add outcome” to begin.</td></tr>';
}

function renderAgents() {
  const rows = performanceRows("agent", true);
  document.getElementById("agentDirectorySummary").textContent = `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"} · names match case-insensitively`;
  document.getElementById("agentCards").innerHTML = state.agents.length ? state.agents.map((agent) => {
    const adSets = state.adSets.filter((adSet) => adSet.agentId === agent.id);
    const metrics = rows.find((row) => row.key === agent.id) || emptyMetrics();
    return `<article class="card agent-card"><div class="agent-avatar" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</div><div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.whatsapp || "No WhatsApp number")}</small></div><div class="agent-stat"><strong>${adSets.length}</strong><span>matched ad sets</span></div><div class="agent-stat"><strong>${metrics.registered || 0}</strong><span>registrations</span></div><div class="agent-stat closing-stat">${agentClosingBadge(metrics)}</div><div class="agent-actions"><button class="row-add" type="button" data-add-outcome data-level="agent" data-target="${escapeHtml(agent.id)}" aria-label="Add outcome for ${escapeHtml(agent.name)}">+</button><button class="icon-button small" type="button" data-edit-agent="${escapeHtml(agent.id)}" aria-label="Edit ${escapeHtml(agent.name)}" title="Edit agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16.6 10.9-10.9 2.4 2.4L7.4 19H5v-2.4ZM17.1 4.5l1.1-1.1c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2l-1.1 1.1-2.4-2.4Z"/></svg></button><button class="delete-button small" type="button" data-delete-agent="${escapeHtml(agent.id)}" aria-label="Delete ${escapeHtml(agent.name)}" title="Delete agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7ZM9 9v8h2V9H9Zm4 0v8h2V9h-2ZM8 3h8l1 1h4v2H3V4h4l1-1Z"/></svg></button></div></article>`;
  }).join("") : '<div class="empty card">Add your first sales agent. Existing imported ad sets will be matched immediately.</div>';
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  document.getElementById("unassignedAdSets").innerHTML = unassigned.length ? unassigned.map((adSet) => `<div class="simple-list-row"><div><strong>${escapeHtml(adSet.name)}</strong><small>${escapeHtml(byId(state.campaigns, adSet.campaignId)?.name || "Unknown campaign")}</small></div><span class="status-pill ${adSet.agentMatchStatus === "ambiguous" ? "warning" : ""}">${adSet.agentMatchStatus === "ambiguous" ? "Multiple names found" : "No matching agent"}</span></div>`).join("") : '<div class="empty success-empty">All imported ad sets are assigned.</div>';
}

function groupTraining(group) { return byId(state.programs, group?.programId); }
function studentGroup(student) { return byId(state.groups, student?.groupId); }
function studentTraining(student) { return groupTraining(studentGroup(student)); }
function studentPaid(student) { return state.payments.filter((payment) => payment.studentId === student?.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0); }
function studentRemaining(student) { return Math.max(0, Number(student?.totalDue || 0) - studentPaid(student)); }
function groupSchedule(group) {
  const main = `${(group.days || []).join(", ") || "No days"} - ${group.timeStart || "?"}-${group.timeEnd || "?"}`;
  if (group?.attendanceMode !== "flexible_shift") return main;
  const alternate = `${(group.alternateDays?.length ? group.alternateDays : group.days || []).join(", ")} - ${group.alternateTimeStart || "?"}-${group.alternateTimeEnd || "?"}`;
  return `${main} · Nidam shift: ${alternate}`;
}
function groupTimeKeys(group) {
  const keys = [];
  if (group?.timeStart || group?.timeEnd) keys.push(`${group.timeStart || ""}-${group.timeEnd || ""}`);
  if (group?.attendanceMode === "flexible_shift" && (group.alternateTimeStart || group.alternateTimeEnd)) keys.push(`${group.alternateTimeStart || ""}-${group.alternateTimeEnd || ""}`);
  return [...new Set(keys.filter((value) => value !== "-"))];
}
function minutesForTime(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}
function timeRangesOverlap(startA, endA, startB, endB) {
  const aStart = minutesForTime(startA);
  const aEnd = minutesForTime(endA);
  const bStart = minutesForTime(startB);
  const bEnd = minutesForTime(endB);
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false;
  return aStart < bEnd && bStart < aEnd;
}
function dayNames(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
function dayOverlap(a = [], b = []) {
  const normalized = new Set(a.map((day) => day.toLocaleLowerCase()));
  return b.some((day) => normalized.has(day.toLocaleLowerCase()));
}
function groupOverlapsSlot(group, days, start, end) {
  const mainOverlap = dayOverlap(group.days || [], days) && timeRangesOverlap(group.timeStart, group.timeEnd, start, end);
  const alternateOverlap = group.attendanceMode === "flexible_shift"
    && dayOverlap(group.alternateDays?.length ? group.alternateDays : group.days || [], days)
    && timeRangesOverlap(group.alternateTimeStart, group.alternateTimeEnd, start, end);
  return mainOverlap || alternateOverlap;
}
function slotPressure(days, start, end) {
  const conflicts = state.groups.filter((group) => group.status !== "done" && groupOverlapsSlot(group, days, start, end));
  const fullness = conflicts.reduce((sum, group) => sum + groupStats(group).fullness, 0);
  return { conflicts, score: (conflicts.length * 100) + fullness };
}
function hydratePlannerControls() {
  const select = document.getElementById("plannerTraining");
  if (!select) return;
  const current = select.value;
  select.replaceChildren(option("Créer une nouvelle formation", ""));
  state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(`${program.name}${program.durationLabel ? ` - ${program.durationLabel}` : ""}`, program.id)));
  if (state.programs.some((program) => program.id === current)) select.value = current;
}
function buildPlannerSuggestions() {
  const preferredMode = document.getElementById("plannerMode")?.value || "fixed";
  const targetCapacity = Math.max(1, Number(document.getElementById("plannerCapacity")?.value || 20));
  const dayOptions = [
    "Monday, Wednesday",
    "Tuesday, Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    ...state.groups.map((group) => (group.days || []).join(", ")).filter(Boolean),
  ];
  const timeOptions = [
    ["09:00", "11:00"],
    ["10:00", "12:00"],
    ["12:00", "14:00"],
    ["14:00", "16:00"],
    ["16:00", "18:00"],
    ["18:00", "20:00"],
    ...state.groups.map((group) => [group.timeStart, group.timeEnd]).filter(([start, end]) => start && end),
  ];
  const uniqueDays = [...new Set(dayOptions)];
  const uniqueTimes = [...new Map(timeOptions.map(([start, end]) => [`${start}-${end}`, [start, end]])).values()];
  const candidates = [];
  uniqueDays.forEach((daysText) => {
    const days = dayNames(daysText);
    uniqueTimes.forEach(([start, end]) => {
      const pressure = slotPressure(days, start, end);
      candidates.push({ daysText, days, start, end, capacity: targetCapacity, attendanceMode: "fixed", pressure });
      if (preferredMode === "flexible_shift") {
        const alternate = Number(start.slice(0, 2)) < 14 ? ["18:00", "20:00"] : ["10:00", "12:00"];
        const alternatePressure = slotPressure(days, alternate[0], alternate[1]);
        candidates.push({
          daysText,
          days,
          start,
          end,
          capacity: targetCapacity,
          attendanceMode: "flexible_shift",
          alternateDaysText: daysText,
          alternateTimeStart: alternate[0],
          alternateTimeEnd: alternate[1],
          pressure: { conflicts: [...pressure.conflicts, ...alternatePressure.conflicts], score: pressure.score + alternatePressure.score + 15 },
        });
      }
    });
  });
  return candidates
    .sort((a, b) => a.pressure.score - b.pressure.score || a.daysText.localeCompare(b.daysText) || a.start.localeCompare(b.start))
    .slice(0, 4);
}
function renderPlannerSuggestions() {
  const container = document.getElementById("plannerSuggestions");
  if (!container) return;
  plannerSuggestions = buildPlannerSuggestions();
  if (!plannerSuggestions.length) {
    container.innerHTML = '<div class="empty">Ajoutez une formation ou un groupe existant pour recevoir des propositions.</div>';
    return;
  }
  container.innerHTML = plannerSuggestions.map((suggestion, index) => {
    const conflicts = suggestion.pressure.conflicts.length;
    const label = conflicts ? `${conflicts} conflit${conflicts === 1 ? "" : "s"} possible${conflicts === 1 ? "" : "s"}` : "Créneau libre";
    const className = conflicts ? "quality-watch" : "quality-strong";
    const shift = suggestion.attendanceMode === "flexible_shift" ? `<small>Nidam shift: ${escapeHtml(suggestion.alternateDaysText)} ${escapeHtml(suggestion.alternateTimeStart)}-${escapeHtml(suggestion.alternateTimeEnd)}</small>` : "<small>Groupe fixe</small>";
    return `<article class="planner-suggestion"><div><span class="status-pill ${className}">${escapeHtml(label)}</span><strong>${escapeHtml(suggestion.daysText)} · ${escapeHtml(suggestion.start)}-${escapeHtml(suggestion.end)}</strong>${shift}<small>Capacité proposée: ${number(suggestion.capacity)} étudiants</small></div><button class="button secondary" type="button" data-create-plan="${index}">Créer ce planning</button></article>`;
  }).join("");
}
async function createSuggestedPlan(index) {
  if (!studentDataUnlocked()) return;
  const suggestion = plannerSuggestions[Number(index)];
  if (!suggestion) return toast("Relancez les propositions avant de créer le groupe", "error");
  const selectedProgramId = document.getElementById("plannerTraining")?.value || "";
  const newTrainingName = document.getElementById("plannerTrainingName")?.value.trim() || "";
  const durationLabel = document.getElementById("plannerDuration")?.value.trim() || "";
  if (!selectedProgramId && !newTrainingName) return toast("Choisissez une formation ou tapez le nom de la nouvelle formation", "error");
  let programId = selectedProgramId;
  if (!programId) {
    const program = await api("/api/programs", { method: "POST", body: JSON.stringify({ name: newTrainingName, durationLabel }) });
    programId = program.id;
  }
  const program = byId(state.programs, programId);
  await api("/api/groups", {
    method: "POST",
    body: JSON.stringify({
      programId,
      name: `${program?.name || newTrainingName} ${suggestion.start}`,
      durationLabel: durationLabel || program?.durationLabel || "",
      days: suggestion.daysText,
      timeStart: suggestion.start,
      timeEnd: suggestion.end,
      capacity: suggestion.capacity,
      attendanceMode: suggestion.attendanceMode,
      alternateDays: suggestion.alternateDaysText || "",
      alternateTimeStart: suggestion.alternateTimeStart || "",
      alternateTimeEnd: suggestion.alternateTimeEnd || "",
    }),
  });
  await load();
  toast("Planning créé. Vérifiez le groupe puis ajoutez les étudiants.");
}
function groupPrice(group) {
  const training = groupTraining(group);
  return Number(group?.discountedPrice || group?.price || training?.discountedPrice || training?.basePrice || 0);
}
function groupStats(group) {
  const students = state.students.filter((student) => student.groupId === group.id && student.status !== "cancelled");
  const paid = students.reduce((sum, student) => sum + studentPaid(student), 0);
  const due = students.reduce((sum, student) => sum + Number(student.totalDue || 0), 0);
  const capacity = Math.max(1, Number(group.capacity || 1));
  return { students, enrolled: students.length, capacity, spots: Math.max(0, capacity - students.length), fullness: Math.min(100, Math.round((students.length / capacity) * 100)), paid, remaining: Math.max(0, due - paid) };
}
function paymentState(student) {
  const paid = studentPaid(student);
  const remaining = studentRemaining(student);
  if (!paid) return "none";
  return remaining > 0 ? "balance" : "paid";
}
function paymentBadge(student) {
  const stateName = paymentState(student);
  const label = stateName === "paid" ? "Payé" : stateName === "balance" ? "Reste à payer" : "Aucun paiement";
  const className = stateName === "paid" ? "quality-strong" : stateName === "balance" ? "quality-watch" : "quality-weak";
  return `<span class="status-pill ${className}">${label}</span>`;
}
function filteredGroups() {
  return state.groups.filter((group) => {
    const training = groupTraining(group);
    const text = [group.name, training?.name, group.days?.join(" "), group.timeStart, group.timeEnd, group.alternateDays?.join(" "), group.alternateTimeStart, group.alternateTimeEnd, group.notes].join(" ").toLocaleLowerCase();
    if (operationsFilters.trainingId && group.programId !== operationsFilters.trainingId) return false;
    if (operationsFilters.timing && !groupTimeKeys(group).includes(operationsFilters.timing)) return false;
    if (operationsFilters.search && !text.includes(operationsFilters.search.toLocaleLowerCase())) return false;
    return true;
  });
}
function filteredStudents() {
  return state.students.filter((student) => {
    const group = studentGroup(student);
    const training = studentTraining(student);
    const agent = byId(state.agents, student.agentId);
    const text = [student.name, student.phone, student.notes, group?.name, training?.name, agent?.name].join(" ").toLocaleLowerCase();
    if (operationsFilters.trainingId && group?.programId !== operationsFilters.trainingId) return false;
    if (operationsFilters.timing && !groupTimeKeys(group).includes(operationsFilters.timing)) return false;
    if (operationsFilters.payment && paymentState(student) !== operationsFilters.payment) return false;
    if (operationsFilters.search && !text.includes(operationsFilters.search.toLocaleLowerCase())) return false;
    return true;
  });
}
function hydrateOperationsControls() {
  document.querySelectorAll('[data-ops-filter="trainingId"]').forEach((select) => {
    const current = operationsFilters.trainingId;
    select.replaceChildren(option("Toutes les formations", ""));
    state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(program.name, program.id)));
    select.value = current;
  });
  document.querySelectorAll('[data-ops-filter="timing"]').forEach((select) => {
    const current = operationsFilters.timing;
    const timings = [...new Set(state.groups.flatMap(groupTimeKeys))].sort();
    select.replaceChildren(option("Tous les horaires", ""));
    timings.forEach((timing) => select.append(option(timing, timing)));
    select.value = current;
  });
  document.querySelectorAll("[data-ops-filter]").forEach((control) => { control.value = operationsFilters[control.dataset.opsFilter] || ""; });
  hydratePlannerControls();
}
function renderOperationsKpis() {
  const groups = filteredGroups();
  const students = filteredStudents();
  const capacity = groups.reduce((sum, group) => sum + Math.max(0, Number(group.capacity || 0)), 0);
  const occupied = groups.reduce((sum, group) => sum + groupStats(group).enrolled, 0);
  const remainingSpots = Math.max(0, capacity - occupied);
  const totalPaid = students.reduce((sum, student) => sum + studentPaid(student), 0);
  const totalRemaining = students.reduce((sum, student) => sum + studentRemaining(student), 0);
  const items = [
    ["Groupes", number(groups.length), "groupes filtrés", "neutral"],
    ["Places utilisées", `${number(occupied)} / ${number(capacity)}`, `${number(remainingSpots)} places restantes`, "blue"],
    ["Étudiants", number(students.length), "registre filtré", "green"],
    ["Encaissé", money(totalPaid), "paiements enregistrés", "violet"],
    ["Reste à payer", money(totalRemaining), "à relancer", totalRemaining ? "amber" : "green"],
  ];
  document.getElementById("operationsKpis").innerHTML = items.map(([label, value, detail, style]) => `<article class="kpi ${style}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
}
function renderGroupCards() {
  const groups = filteredGroups();
  document.getElementById("groupCards").innerHTML = groups.length ? groups.map((group) => {
    const training = groupTraining(group);
    const stats = groupStats(group);
    const full = stats.spots === 0;
    return `<article class="card group-card ${full ? "is-full" : ""}"><div class="group-card-head"><div><span class="status-pill ${full ? "quality-watch" : "quality-strong"}">${full ? "Complet" : `${stats.spots} places libres`}</span><h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(training?.name || "Formation inconnue")} ${group.durationLabel ? `- ${escapeHtml(group.durationLabel)}` : ""}</p></div><strong>${stats.fullness}%</strong></div><div class="capacity-bar" role="img" aria-label="${stats.enrolled} of ${stats.capacity} seats used"><span style="width:${stats.fullness}%"></span></div><div class="group-meta"><span>${escapeHtml(groupSchedule(group))}</span><span>${escapeHtml(group.startDate || "Pas de date début")} ${group.endDate ? `à ${escapeHtml(group.endDate)}` : ""}</span><span>${money(groupPrice(group))} prix par défaut</span></div><div class="group-numbers"><span><strong>${stats.enrolled}</strong> étudiants</span><span><strong>${money(stats.paid)}</strong> payé</span><span><strong>${money(stats.remaining)}</strong> reste</span></div><div class="agent-actions"><button class="button secondary" type="button" data-view-group="${escapeHtml(group.id)}">Voir étudiants</button><button class="button primary" type="button" data-open-student data-group="${escapeHtml(group.id)}">Inscrire</button></div></article>`;
  }).join("") : '<div class="empty card">Aucun groupe pour le moment. Ajoutez une formation, puis créez le premier groupe planifié.</div>';
}
function renderStudentRows() {
  const students = filteredStudents().sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)) || a.name.localeCompare(b.name));
  document.getElementById("studentRows").innerHTML = students.length ? students.map((student) => {
    const group = studentGroup(student);
    const training = studentTraining(student);
    const agent = byId(state.agents, student.agentId);
    return `<tr><td><button class="link-button" type="button" data-student-detail="${escapeHtml(student.id)}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.phone || "Sans téléphone")}</small></button></td><td><div class="entity-cell"><strong>${escapeHtml(group?.name || "Sans groupe")}</strong><small>${escapeHtml(training?.name || "Formation inconnue")} - ${escapeHtml(group ? groupSchedule(group) : "")}</small></div></td><td>${escapeHtml(agent?.name || "Non assigné")}</td><td>${escapeHtml(student.registeredAt || "-")}</td><td class="number-cell">${money(studentPaid(student))}</td><td class="number-cell"><strong>${money(studentRemaining(student))}</strong></td><td>${paymentBadge(student)}</td><td><div class="agent-actions"><button class="row-add" type="button" data-add-payment="${escapeHtml(student.id)}" aria-label="Ajouter paiement pour ${escapeHtml(student.name)}">+</button><button class="icon-button small" type="button" data-edit-student="${escapeHtml(student.id)}" aria-label="Modifier ${escapeHtml(student.name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16.6 10.9-10.9 2.4 2.4L7.4 19H5v-2.4ZM17.1 4.5l1.1-1.1c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2l-1.1 1.1-2.4-2.4Z"/></svg></button></div></td></tr>`;
  }).join("") : '<tr><td colspan="8" class="empty">Aucun étudiant ne correspond à ces filtres.</td></tr>';
}
function renderPaymentAlerts() {
  const rows = filteredStudents().filter((student) => studentRemaining(student) > 0).sort((a, b) => studentRemaining(b) - studentRemaining(a)).slice(0, 12);
  document.getElementById("paymentAlerts").innerHTML = rows.length ? rows.map((student) => {
    const group = studentGroup(student);
    return `<div class="simple-list-row"><div><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(group?.name || "Sans groupe")} - payé ${money(studentPaid(student))}</small></div><div class="balance-actions"><strong>${money(studentRemaining(student))}</strong><button class="row-add" type="button" data-add-payment="${escapeHtml(student.id)}" aria-label="Ajouter paiement pour ${escapeHtml(student.name)}">+</button></div></div>`;
  }).join("") : '<div class="empty success-empty">Aucun reste à payer dans cette vue.</div>';
}
function renderOperations() {
  if (!document.getElementById("operationsKpis")) return;
  document.getElementById("studentSecurityWarning")?.classList.toggle("hidden", authEnabled && !sensitiveLocked);
  hydrateOperationsControls();
  renderOperationsKpis();
  renderPlannerSuggestions();
  renderGroupCards();
  renderPaymentAlerts();
  renderStudentRows();
}

function studentDataUnlocked() {
  if (authEnabled && !sensitiveLocked) return true;
  toast("Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir les données étudiants.", "error");
  document.getElementById("studentSecurityWarning")?.classList.remove("hidden");
  return false;
}

function renderImports() {
  document.getElementById("importRows").innerHTML = state.imports.length ? state.imports.slice(0, 20).map((item) => `<tr><td>${escapeHtml(new Date(item.importedAt).toLocaleString())}</td><td><strong>${escapeHtml(item.filename)}</strong></td><td class="number-cell">${item.rows}</td><td class="number-cell">${item.campaignsAdded}</td><td class="number-cell">${item.adSetsAdded}</td><td class="number-cell">${item.adsAdded}</td><td class="number-cell">${item.metricsUpdated}</td></tr>`).join("") : '<tr><td colspan="7" class="empty">No Meta Ads reports imported yet.</td></tr>';
}

function renderStorage() {
  const persistent = Boolean(storageInfo?.persistent);
  const badge = document.getElementById("storageBadge");
  badge.classList.toggle("persistent", persistent);
  badge.querySelector("strong").textContent = storageInfo?.label || "Unknown";
  document.getElementById("storageWarning").classList.toggle("hidden", persistent);
  document.getElementById("storageTitle").textContent = storageInfo?.label || "Unknown storage";
  document.getElementById("storageDescription").textContent = persistent ? "MySQL storage is active. Automatic snapshots are kept before every change." : "Local JSON is for development only. Configure MySQL before entering production data.";
  document.getElementById("lastSaved").textContent = formatSavedAt(state.meta?.updatedAt);
  const counts = [[state.adAccounts.length, "accounts"], [state.campaigns.length, "campaigns"], [state.adSets.length, "ad sets"], [state.creatives.length, "ads"], [state.groups.length, "groups"], [state.students.length, "students"], [state.payments.length, "payments"], [state.outcomes.length, "outcomes"], [state.imports.length, "imports"]];
  document.getElementById("systemCounts").innerHTML = counts.map(([value, label]) => `<span class="system-count"><strong>${value}</strong> ${label}</span>`).join("");
}

function renderScoringSettings() {
  const notice = document.getElementById("scoringNotice");
  if (!notice) return;
  const rows = performanceRows(groupBy, true, "quality");
  const targets = rows[0]?.qualityTargets || CmcgQuality.deriveTargets(state.settings, rows);
  if (!targets.configured) {
    notice.className = "alert info scoring-alert";
    notice.innerHTML = `<div><strong>Automatic scoring is learning from your real data.</strong><span>Import Meta reports and record booked appointments, visits, and registrations. The CRM will build cost benchmarks as outcomes arrive.</span></div>`;
    return;
  }
  notice.className = "alert info scoring-alert";
  const registered = targets.targetCostRegistered ? `Registration benchmark: ${money(targets.targetCostRegistered)}.` : "Registration benchmark is still learning.";
  const visit = targets.targetCostVisit ? `Visit benchmark: ${money(targets.targetCostVisit)}.` : "";
  const booked = targets.targetCostBooked ? `Booked benchmark: ${money(targets.targetCostBooked)}.` : "";
  notice.innerHTML = `<div><strong>Automatic scoring is active.</strong><span>${escapeHtml(registered)} ${escapeHtml(visit)} ${escapeHtml(booked)} Rows mature after ${targets.closingWindowDays} days.</span></div>`;
}

function hydrateSortOptions() {
  const select = document.getElementById("performanceSort");
  if (!select || select.dataset.ready === "true") return;
  const options = [
    ["quality", "Business quality - highest"],
    ["agentClosing", "Agent closing - highest"],
    ["spendHigh", "Spend - highest"],
    ["spendLow", "Spend - lowest"],
    ["booked", "Booked appointments - most"],
    ["visits", "Total visits - most"],
    ["showed", "Showed, no registration - most"],
    ["registered", "Registered students - most"],
    ["costBooked", "Cost / booked - lowest"],
    ["costVisit", "Cost / visit - lowest"],
    ["costRegistered", "Cost / registered - lowest"],
    ["showRate", "Show rate - highest"],
    ["closeRate", "Close rate - highest"],
    ["messages", "Messages - most"],
  ];
  select.replaceChildren(...options.map(([value, label]) => option(label, value)));
  select.value = sortBy;
  select.dataset.ready = "true";
}

function hydrateFilters() {
  const objectives = [...new Set(state.campaigns.map((campaign) => campaign.objective).filter(Boolean))].sort();
  document.querySelectorAll('[data-filter="agentId"]').forEach((select) => {
    select.replaceChildren(option("All agents", ""));
    state.agents.forEach((agent) => select.append(option(agent.name, agent.id)));
  });
  document.querySelectorAll('[data-filter="objective"]').forEach((select) => {
    select.replaceChildren(option("All objectives", ""));
    objectives.forEach((objective) => select.append(option(objective, objective)));
  });
  document.querySelectorAll('[data-filter="campaignId"]').forEach((select) => {
    select.replaceChildren(option("All campaigns", ""));
    state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name)).forEach((campaign) => select.append(option(campaign.name, campaign.id)));
  });
  document.querySelectorAll("[data-filter]").forEach((control) => { control.value = filters[control.dataset.filter] || ""; });
}

function render() {
  updatePeriodControls();
  hydrateFilters();
  hydrateSortOptions();
  document.getElementById("authWarning").classList.toggle("hidden", authEnabled);
  renderKpis(); renderFunnel(); renderAttention(); renderOverviewTables(); renderPerformance(); renderOutcomes(); renderOperations(); renderAgents(); renderImports(); renderStorage(); renderScoringSettings();
}

function showPanel(name, updateHash = true) {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((item) => item.classList.toggle("active", item.id === name));
  const meta = pageMeta[name] || ["CMCG CRM", ""];
  document.getElementById("pageTitle").textContent = meta[0];
  document.getElementById("pageSubtitle").textContent = meta[1];
  if (updateHash && window.location.hash !== `#view=${name}`) window.history.replaceState(null, "", `#view=${name}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function targetOptions(level) {
  if (level === "ad") return state.creatives.filter((ad) => ad.metaAdId).sort((a, b) => a.name.localeCompare(b.name)).map((ad) => { const relation = relationForAd(ad); return { id: ad.id, label: `${ad.name} · ${relation.adSet?.name || "No ad set"} · ${relation.agent?.name || "Unassigned"}` }; });
  if (level === "adSet") return state.adSets.filter((adSet) => adSet.metaAdSetId).sort((a, b) => a.name.localeCompare(b.name)).map((adSet) => ({ id: adSet.id, label: `${adSet.name} · ${byId(state.campaigns, adSet.campaignId)?.name || "No campaign"}` }));
  if (level === "campaign") return state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name)).map((campaign) => ({ id: campaign.id, label: `${campaign.name} · ${campaign.objective || "No objective"}` }));
  return state.agents.filter((agent) => agent.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((agent) => ({ id: agent.id, label: agent.name }));
}

function fillSelect(select, rows, emptyLabel, labelForRow) {
  const current = select.value;
  select.replaceChildren(option(emptyLabel, ""));
  rows.forEach((row) => select.append(option(labelForRow(row), row.id)));
  if (rows.some((row) => row.id === current)) select.value = current;
}

function ensureOutcomeTargetId() {
  const visibleTarget = document.getElementById("outcomeTarget");
  let hiddenTarget = document.getElementById("outcomeTargetId");
  visibleTarget.removeAttribute("name");
  visibleTarget.required = false;
  if (!hiddenTarget) {
    hiddenTarget = document.createElement("input");
    hiddenTarget.type = "hidden";
    hiddenTarget.id = "outcomeTargetId";
    hiddenTarget.name = "targetId";
    visibleTarget.after(hiddenTarget);
  }
  return hiddenTarget;
}

function ensureOutcomeHierarchy() {
  let hierarchy = document.getElementById("outcomeHierarchy");
  if (hierarchy) return hierarchy;
  hierarchy = document.createElement("div");
  hierarchy.id = "outcomeHierarchy";
  hierarchy.className = "form-grid outcome-hierarchy hidden";
  hierarchy.innerHTML = `<label><span>Campaign</span><select id="outcomeCampaign"></select></label><label><span>Ad set</span><select id="outcomeAdSet"></select></label><label><span>Ad</span><select id="outcomeAd"></select></label>`;
  document.getElementById("assignmentHint").before(hierarchy);
  ["outcomeCampaign", "outcomeAdSet", "outcomeAd"].forEach((idName) => {
    document.getElementById(idName).addEventListener("change", () => syncOutcomeHierarchy());
  });
  return hierarchy;
}

function preferredOutcomePath(level, targetId) {
  if (!targetId) return {};
  if (level === "ad") {
    const ad = byId(state.creatives, targetId);
    const relation = relationForAd(ad);
    return { campaignId: relation.campaign?.id || "", adSetId: relation.adSet?.id || "", adId: ad?.id || "" };
  }
  if (level === "adSet") {
    const adSet = byId(state.adSets, targetId);
    return { campaignId: byId(state.campaigns, adSet?.campaignId)?.id || "", adSetId: adSet?.id || "", adId: "" };
  }
  if (level === "campaign") return { campaignId: byId(state.campaigns, targetId)?.id || "", adSetId: "", adId: "" };
  return {};
}

function syncOutcomeHierarchy(preferred = {}) {
  const level = document.getElementById("assignmentLevel").value;
  const campaignSelect = document.getElementById("outcomeCampaign");
  const adSetSelect = document.getElementById("outcomeAdSet");
  const adSelect = document.getElementById("outcomeAd");
  const hiddenTarget = ensureOutcomeTargetId();
  const campaigns = state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(campaignSelect, campaigns, campaigns.length ? "Choose campaign" : "No campaign available", (campaign) => `${campaign.name} - ${campaign.objective || "No objective"}`);
  if (preferred.campaignId && campaigns.some((campaign) => campaign.id === preferred.campaignId)) campaignSelect.value = preferred.campaignId;

  const adSets = state.adSets.filter((adSet) => adSet.metaAdSetId && adSet.campaignId === campaignSelect.value).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(adSetSelect, adSets, campaignSelect.value ? (adSets.length ? "Choose ad set" : "No ad sets in this campaign") : "Choose campaign first", (adSet) => `${adSet.name} - ${byId(state.agents, adSet.agentId)?.name || "Unassigned"}`);
  adSetSelect.disabled = !campaignSelect.value;
  if (preferred.adSetId && adSets.some((adSet) => adSet.id === preferred.adSetId)) adSetSelect.value = preferred.adSetId;

  const ads = state.creatives.filter((ad) => ad.metaAdId && ad.adSetId === adSetSelect.value).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(adSelect, ads, adSetSelect.value ? (ads.length ? "Choose exact ad" : "No ads in this ad set") : "Choose ad set first", (ad) => `${ad.name} - ${ad.code || "no code"}`);
  adSelect.disabled = !adSetSelect.value;
  if (preferred.adId && ads.some((ad) => ad.id === preferred.adId)) adSelect.value = preferred.adId;

  hiddenTarget.value = level === "campaign" ? campaignSelect.value : level === "adSet" ? adSetSelect.value : adSelect.value;
}

function fillOutcomeTargets(preferred = "") {
  const level = document.getElementById("assignmentLevel").value;
  const target = document.getElementById("outcomeTarget");
  const label = groupLabels[level];
  const hiddenTarget = ensureOutcomeTargetId();
  const hierarchy = ensureOutcomeHierarchy();
  const targetWrapper = target.closest("label");
  document.getElementById("targetLabel").textContent = label;
  if (level !== "agent") {
    targetWrapper.classList.add("hidden");
    hierarchy.classList.remove("hidden");
    document.getElementById("outcomeAdSet").closest("label").classList.toggle("hidden", level === "campaign");
    document.getElementById("outcomeAd").closest("label").classList.toggle("hidden", level !== "ad");
    syncOutcomeHierarchy(preferredOutcomePath(level, preferred));
    document.getElementById("assignmentHint").textContent = level === "ad" ? "Choose campaign, then ad set, then exact ad so duplicate ad names stay separate." : level === "adSet" ? "Choose campaign first, then the ad set that produced the outcome." : "Choose the campaign that produced the outcome.";
    return;
  }

  targetWrapper.classList.remove("hidden");
  hierarchy.classList.add("hidden");
  const options = targetOptions(level);
  target.replaceChildren(option(options.length ? `Select ${label.toLocaleLowerCase()}` : `No ${label.toLocaleLowerCase()} available`, ""));
  options.forEach((item) => target.append(option(item.label, item.id)));
  if (options.some((item) => item.id === preferred)) target.value = preferred;
  hiddenTarget.value = target.value;
  document.getElementById("assignmentHint").textContent = "Use when you only know the sales agent.";
}

function openOutcome({ level = "ad", targetId = "", type = "" } = {}) {
  const form = document.getElementById("outcomeForm");
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  if (form.elements.sourceDate) form.elements.sourceDate.value = "";
  form.elements.assignmentLevel.value = level;
  if (type && form.elements.type) form.querySelector(`input[name="type"][value="${CSS.escape(type)}"]`).checked = true;
  fillOutcomeTargets(targetId);
  document.getElementById("outcomeDialog").showModal();
}

function ensureAgentDialog() {
  let dialog = document.getElementById("agentDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "agentDialog";
  dialog.className = "modal";
  dialog.innerHTML = `<form id="agentEditForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Sales agent</p><h2>Edit agent</h2><p>Renaming an agent rematches imported ad sets by name, ignoring uppercase/lowercase.</p></div><button class="icon-button" type="button" data-close-agent aria-label="Close agent form"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg></button></div><div class="form-grid"><label><span>Agent name</span><input name="name" required placeholder="Souad" autocomplete="off" /></label><label><span>WhatsApp <em>optional</em></span><input name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="+212 6..." /></label></div><p class="form-hint">If this exact name appears in campaign, ad set, or ad names, those rows will be assigned to the agent automatically.</p><div class="modal-actions"><button class="button secondary" type="button" data-close-agent>Cancel</button><button class="button primary" type="submit">Save agent</button></div></form>`;
  document.body.append(dialog);
  return dialog;
}

function openAgentEditor(agentId) {
  const agent = byId(state.agents, agentId);
  if (!agent) return toast("Agent not found", "error");
  const dialog = ensureAgentDialog();
  const form = dialog.querySelector("form");
  editingAgentId = agent.id;
  form.reset();
  form.elements.name.value = agent.name || "";
  form.elements.whatsapp.value = agent.whatsapp || "";
  dialog.showModal();
  form.elements.name.focus();
}

function ensureOperationsDialogs() {
  if (document.getElementById("trainingDialog")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="trainingDialog" class="modal"><form id="trainingForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Formation · تكوين</p><h2>Ajouter formation</h2><p>Nom du cours, durée, prix normal et prix remisé.</p></div><button class="icon-button" type="button" data-close-training aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Nom formation</span><input name="name" required placeholder="Comptabilité 3 mois" autocomplete="off" /></label><label><span>Durée</span><input name="durationLabel" placeholder="3 mois, 5 mois, année complète" /></label><label><span>Prix normal</span><input name="basePrice" type="number" min="0" step="0.01" placeholder="0" /></label><label><span>Prix remisé</span><input name="discountedPrice" type="number" min="0" step="0.01" placeholder="0" /></label></div><label><span>Notes <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Ce que la formation inclut"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-training>Annuler</button><button class="button primary" type="submit">Enregistrer formation</button></div></form></dialog>
    <dialog id="groupDialog" class="modal outcome-modal"><form id="groupForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Groupe · فوج</p><h2>Ajouter groupe</h2><p>Créez un créneau avec capacité, prix, et option nidam shift.</p></div><button class="icon-button" type="button" data-close-group aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Formation</span><select id="groupProgram" name="programId" required></select></label><label><span>Nom groupe</span><input name="name" placeholder="Groupe soir A" autocomplete="off" /></label><label><span>Jours</span><input name="days" required placeholder="Monday, Wednesday" /></label><label><span>Début</span><input name="timeStart" type="time" required /></label><label><span>Fin</span><input name="timeEnd" type="time" required /></label><label><span>Mode présence</span><select id="groupAttendanceMode" name="attendanceMode"><option value="fixed">Groupe fixe</option><option value="flexible_shift">Nidam shift matin/soir</option></select></label><label class="shift-field hidden"><span>Jours shift alternatif</span><input name="alternateDays" placeholder="Monday, Wednesday" /></label><label class="shift-field hidden"><span>Début shift alternatif</span><input name="alternateTimeStart" type="time" /></label><label class="shift-field hidden"><span>Fin shift alternatif</span><input name="alternateTimeEnd" type="time" /></label><label><span>Capacité</span><input name="capacity" type="number" min="1" step="1" value="20" required /></label><label><span>Prix groupe</span><input name="price" type="number" min="0" step="0.01" placeholder="Prix formation" /></label><label><span>Prix remisé</span><input name="discountedPrice" type="number" min="0" step="0.01" placeholder="Optionnel" /></label><label><span>Date début</span><input name="startDate" type="date" /></label><label><span>Date fin</span><input name="endDate" type="date" /></label><label><span>Statut</span><select name="status"><option value="active">Actif</option><option value="full">Complet</option><option value="paused">Pause</option><option value="done">Terminé</option></select></label></div><label><span>Notes <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Salle, formateur, timing spécial"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-group>Annuler</button><button class="button primary" type="submit">Enregistrer groupe</button></div></form></dialog>
    <dialog id="studentDialog" class="modal outcome-modal"><form id="studentForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Inscription étudiant · تسجيل</p><h2 id="studentDialogTitle">Inscrire étudiant</h2><p>Assignez l'étudiant au groupe et enregistrez le prix convenu.</p></div><button class="icon-button" type="button" data-close-student aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Nom étudiant</span><input name="name" required autocomplete="name" placeholder="Nom complet" /></label><label><span>Téléphone</span><input name="phone" inputmode="tel" autocomplete="tel" placeholder="+212 6..." /></label><label><span>Groupe</span><select id="studentGroup" name="groupId" required></select></label><label><span>Agent commercial</span><select id="studentAgent" name="agentId"></select></label><label><span>Date inscription</span><input name="registeredAt" type="date" required /></label><label><span>Mode paiement</span><select name="paymentPlan"><option value="full">Paiement total</option><option value="installments">Paiement par tranches</option></select></label><label><span>Prix final</span><input name="totalDue" type="number" min="0" step="0.01" required /></label><label id="initialPaymentField"><span>Payé maintenant</span><input name="initialPaid" type="number" min="0" step="0.01" placeholder="0" /></label><label><span>Statut</span><select name="status"><option value="registered">Inscrit</option><option value="active">Actif</option><option value="completed">Terminé</option><option value="paused">Pause</option><option value="cancelled">Annulé</option></select></label></div><label><span>Notes <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Accord paiement, documents, remarques"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-student>Annuler</button><button class="button primary" type="submit">Enregistrer étudiant</button></div></form></dialog>
    <dialog id="paymentDialog" class="modal"><form id="paymentForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Paiement · أداء</p><h2>Ajouter paiement</h2><p id="paymentStudentName">Enregistrer un paiement étudiant.</p></div><button class="icon-button" type="button" data-close-payment aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Montant</span><input name="amount" type="number" min="0.01" step="0.01" required /></label><label><span>Date paiement</span><input name="paidAt" type="date" required /></label><label><span>Méthode</span><select name="method"><option value="cash">Espèces</option><option value="transfer">Virement</option><option value="card">Carte</option><option value="other">Autre</option></select></label></div><label><span>Note <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Reçu, tranche, rappel"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-payment>Annuler</button><button class="button primary" type="submit">Enregistrer paiement</button></div></form></dialog>
    <dialog id="studentDetailDialog" class="modal outcome-modal"><div class="modal-content"><div class="modal-head"><div><p class="section-kicker">Historique étudiant · تتبع</p><h2 id="studentDetailTitle">Historique étudiant</h2><p>Inscription, modifications et paiements dans une seule trace.</p></div><button class="icon-button" type="button" data-close-student-detail aria-label="Fermer">×</button></div><div id="studentDetailBody"></div><div class="modal-actions"><button class="button secondary" type="button" data-close-student-detail>Fermer</button><button class="button primary" type="button" data-edit-current-student>Modifier étudiant</button></div></div></dialog>
  `);
}

function hydrateGroupProgramSelect() {
  const select = document.getElementById("groupProgram");
  select.replaceChildren(option("Choisir formation", ""));
  state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(`${program.name}${program.durationLabel ? ` - ${program.durationLabel}` : ""}`, program.id)));
}

function syncGroupShiftFields() {
  const form = document.getElementById("groupForm");
  if (!form) return;
  const flexible = form.elements.attendanceMode?.value === "flexible_shift";
  form.querySelectorAll(".shift-field").forEach((field) => field.classList.toggle("hidden", !flexible));
  ["alternateDays", "alternateTimeStart", "alternateTimeEnd"].forEach((name) => {
    if (form.elements[name]) form.elements[name].required = flexible;
  });
  if (flexible && form.elements.days?.value && !form.elements.alternateDays.value) {
    form.elements.alternateDays.value = form.elements.days.value;
  }
}

function hydrateStudentSelects(preferredGroupId = "") {
  const groupSelect = document.getElementById("studentGroup");
  const agentSelect = document.getElementById("studentAgent");
  groupSelect.replaceChildren(option("Choisir groupe", ""));
  state.groups.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((group) => {
    const stats = groupStats(group);
    groupSelect.append(option(`${group.name} - ${groupTraining(group)?.name || "Formation"} - ${stats.spots} places libres`, group.id));
  });
  if (preferredGroupId && state.groups.some((group) => group.id === preferredGroupId)) groupSelect.value = preferredGroupId;
  agentSelect.replaceChildren(option("Non assigné", ""));
  state.agents.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((agent) => agentSelect.append(option(agent.name, agent.id)));
}

function setStudentDefaultPrice() {
  if (editingStudentId) return;
  const form = document.getElementById("studentForm");
  const group = byId(state.groups, form.elements.groupId.value);
  form.elements.totalDue.value = group ? groupPrice(group).toFixed(2) : "";
}

function openTrainingForm() {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  const form = document.getElementById("trainingForm");
  form.reset();
  form.elements.name.value = document.getElementById("plannerTrainingName")?.value.trim() || "";
  form.elements.durationLabel.value = document.getElementById("plannerDuration")?.value.trim() || "";
  document.getElementById("trainingDialog").showModal();
  form.elements.name.focus();
}

function openGroupForm(prefill = {}) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  if (!state.programs.length) return toast("Ajoutez une formation avant de créer un groupe", "error");
  const form = document.getElementById("groupForm");
  hydrateGroupProgramSelect();
  form.reset();
  form.elements.capacity.value = prefill.capacity || 20;
  form.elements.programId.value = prefill.programId || "";
  form.elements.days.value = prefill.days || "";
  form.elements.timeStart.value = prefill.timeStart || "";
  form.elements.timeEnd.value = prefill.timeEnd || "";
  form.elements.attendanceMode.value = prefill.attendanceMode || "fixed";
  form.elements.alternateDays.value = prefill.alternateDays || "";
  form.elements.alternateTimeStart.value = prefill.alternateTimeStart || "";
  form.elements.alternateTimeEnd.value = prefill.alternateTimeEnd || "";
  syncGroupShiftFields();
  document.getElementById("groupDialog").showModal();
  (form.elements.programId.value ? form.elements.name : form.elements.programId).focus();
}

function openStudentForm({ studentId = "", groupId = "" } = {}) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  if (!state.groups.length) return toast("Ajoutez un groupe avant d'inscrire des étudiants", "error");
  const form = document.getElementById("studentForm");
  const student = byId(state.students, studentId);
  editingStudentId = student?.id || "";
  form.reset();
  hydrateStudentSelects(groupId || student?.groupId || "");
  document.getElementById("studentDialogTitle").textContent = student ? "Modifier étudiant" : "Inscrire étudiant";
  document.getElementById("initialPaymentField").classList.toggle("hidden", Boolean(student));
  form.elements.registeredAt.value = student?.registeredAt || new Date().toISOString().slice(0, 10);
  form.elements.status.value = student?.status || "registered";
  form.elements.paymentPlan.value = student?.paymentPlan || "full";
  if (student) {
    form.elements.name.value = student.name || "";
    form.elements.phone.value = student.phone || "";
    form.elements.groupId.value = student.groupId || "";
    form.elements.agentId.value = student.agentId || "";
    form.elements.totalDue.value = Number(student.totalDue || 0).toFixed(2);
    form.elements.notes.value = student.notes || "";
  } else {
    setStudentDefaultPrice();
  }
  document.getElementById("studentDialog").showModal();
  form.elements.name.focus();
}

function openPaymentForm(studentId) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  const student = byId(state.students, studentId);
  if (!student) return toast("Étudiant introuvable", "error");
  paymentStudentId = student.id;
  const form = document.getElementById("paymentForm");
  form.reset();
  form.elements.paidAt.value = new Date().toISOString().slice(0, 10);
  form.elements.amount.value = studentRemaining(student) ? studentRemaining(student).toFixed(2) : "";
  document.getElementById("paymentStudentName").textContent = `${student.name} - reste ${money(studentRemaining(student))}`;
  document.getElementById("paymentDialog").showModal();
  form.elements.amount.focus();
}

function eventDescription(event) {
  if (event.type === "registered") return `Inscrit avec prix convenu ${money(event.details?.totalDue || 0)}`;
  if (event.type === "payment_added") return `Paiement enregistré: ${money(event.details?.amount || 0)} le ${escapeHtml(event.details?.paidAt || "")}`;
  if (event.type === "updated") return "Détails étudiant modifiés";
  return event.type.replaceAll("_", " ");
}

function openStudentDetail(studentId) {
  ensureOperationsDialogs();
  const student = byId(state.students, studentId);
  if (!student) return toast("Étudiant introuvable", "error");
  detailStudentId = student.id;
  const group = studentGroup(student);
  const training = studentTraining(student);
  const agent = byId(state.agents, student.agentId);
  const payments = state.payments.filter((payment) => payment.studentId === student.id).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const events = state.events.filter((event) => event.studentId === student.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById("studentDetailTitle").textContent = student.name;
  document.getElementById("studentDetailBody").innerHTML = `<div class="student-detail-grid"><article class="mini-ledger"><span>Formation</span><strong>${escapeHtml(training?.name || "Inconnue")}</strong><small>${escapeHtml(group?.name || "Sans groupe")} - ${escapeHtml(group ? groupSchedule(group) : "")}</small></article><article class="mini-ledger"><span>Agent commercial</span><strong>${escapeHtml(agent?.name || "Non assigné")}</strong><small>${escapeHtml(student.phone || "Sans téléphone")}</small></article><article class="mini-ledger"><span>Paiement</span><strong>${money(studentPaid(student))} / ${money(student.totalDue)}</strong><small>${money(studentRemaining(student))} reste</small></article></div><h3>Historique paiements</h3><div class="simple-list">${payments.length ? payments.map((payment) => `<div class="simple-list-row"><div><strong>${money(payment.amount)}</strong><small>${escapeHtml(payment.paidAt)} - ${escapeHtml(payment.method || "cash")}</small></div><span>${escapeHtml(payment.notes || "")}</span></div>`).join("") : '<div class="empty">Aucun paiement enregistré.</div>'}</div><h3>Trace complète</h3><ol class="timeline">${events.length ? events.map((event) => `<li><strong>${escapeHtml(eventDescription(event))}</strong><small>${escapeHtml(new Date(event.createdAt).toLocaleString())}</small></li>`).join("") : '<li><strong>Ancien dossier étudiant</strong><small>Aucun événement enregistré.</small></li>'}</ol>`;
  document.getElementById("studentDetailDialog").showModal();
}

function selectMetaFile(file) {
  if (!file) return;
  if (!file.name.toLocaleLowerCase().endsWith(".csv")) return toast("Choose the CSV version of your Meta report", "error");
  if (file.size > 9_000_000) return toast("The CSV is larger than 9 MB", "error");
  pendingMetaFile = file;
  const selected = document.getElementById("selectedFile");
  selected.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${number(file.size / 1024)} KB · ready to import</span>`;
  selected.classList.remove("hidden");
  document.getElementById("importCsvButton").disabled = false;
}

function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"], button:not([type])');
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Saving…"; }
  try {
    if (form.id === "outcomeForm") {
      const payload = formPayload(form);
      if (!payload.targetId) throw new Error("Choose where this outcome came from");
      await api("/api/outcomes", { method: "POST", body: JSON.stringify(payload) });
      document.getElementById("outcomeDialog").close();
      await load(); toast("Outcome saved");
    } else if (form.id === "trainingForm") {
      await api("/api/programs", { method: "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("trainingDialog").close();
      await load(); toast("Training saved");
    } else if (form.id === "groupForm") {
      await api("/api/groups", { method: "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("groupDialog").close();
      await load(); toast("Group saved");
    } else if (form.id === "studentForm") {
      const payload = formPayload(form);
      const route = editingStudentId ? `/api/students/${editingStudentId}` : "/api/students";
      await api(route, { method: editingStudentId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      editingStudentId = "";
      document.getElementById("studentDialog").close();
      await load(); toast("Student saved");
    } else if (form.id === "paymentForm") {
      if (!paymentStudentId) throw new Error("Choose a student first");
      await api(`/api/students/${paymentStudentId}/payments`, { method: "POST", body: JSON.stringify(formPayload(form)) });
      paymentStudentId = "";
      document.getElementById("paymentDialog").close();
      await load(); toast("Payment saved");
    } else if (form.id === "agentEditForm") {
      if (!editingAgentId) throw new Error("Choose an agent to edit");
      await api(`/api/agents/${editingAgentId}`, { method: "PATCH", body: JSON.stringify(formPayload(form)) });
      editingAgentId = "";
      document.getElementById("agentDialog").close();
      await load(); toast("Agent updated and ad sets rematched");
    } else if (form.dataset.create === "agents") {
      await api("/api/agents", { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset(); await load(); toast("Agent added and ad sets rematched");
    }
  } catch (error) { toast(error.message, "error"); }
  finally { if (button) { button.disabled = false; button.textContent = original; } }
});

document.addEventListener("click", async (event) => {
  const tab = event.target.closest(".tab");
  if (tab) showPanel(tab.dataset.tab);
  const tabLink = event.target.closest("[data-tab-link]");
  if (tabLink) showPanel(tabLink.dataset.tabLink);
  if (event.target.closest("[data-open-import]")) { showPanel("data"); setTimeout(() => document.getElementById("metaCsvFile").focus(), 250); }
  if (event.target.closest("[data-go-performance]")) showPanel("performance");
  if (event.target.closest("#openResetData")) document.getElementById("resetDataDialog").showModal();
  if (event.target.closest("[data-open-training]")) openTrainingForm();
  if (event.target.closest("[data-open-group]")) openGroupForm();
  if (event.target.closest("[data-run-planner]")) {
    renderPlannerSuggestions();
    document.getElementById("plannerSuggestions")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const createPlan = event.target.closest("[data-create-plan]");
  if (createPlan) {
    const button = createPlan;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Création...";
    try { await createSuggestedPlan(button.dataset.createPlan); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = original; }
  }
  const openStudent = event.target.closest("[data-open-student]");
  if (openStudent) openStudentForm({ groupId: openStudent.dataset.group || "" });
  if (event.target.closest("[data-close-training]")) document.getElementById("trainingDialog")?.close();
  if (event.target.closest("[data-close-group]")) document.getElementById("groupDialog")?.close();
  if (event.target.closest("[data-close-student]")) { editingStudentId = ""; document.getElementById("studentDialog")?.close(); }
  if (event.target.closest("[data-close-payment]")) { paymentStudentId = ""; document.getElementById("paymentDialog")?.close(); }
  if (event.target.closest("[data-close-student-detail]")) document.getElementById("studentDetailDialog")?.close();
  const viewGroup = event.target.closest("[data-view-group]");
  if (viewGroup) {
    const group = byId(state.groups, viewGroup.dataset.viewGroup);
    if (group) {
      operationsFilters.trainingId = group.programId || "";
      operationsFilters.timing = `${group.timeStart}-${group.timeEnd}`;
      operationsFilters.search = group.name || "";
      renderOperations();
      document.getElementById("studentRows")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  const addPayment = event.target.closest("[data-add-payment]");
  if (addPayment) openPaymentForm(addPayment.dataset.addPayment);
  const editStudent = event.target.closest("[data-edit-student]");
  if (editStudent) openStudentForm({ studentId: editStudent.dataset.editStudent });
  const studentDetail = event.target.closest("[data-student-detail]");
  if (studentDetail) openStudentDetail(studentDetail.dataset.studentDetail);
  if (event.target.closest("[data-edit-current-student]")) {
    document.getElementById("studentDetailDialog")?.close();
    openStudentForm({ studentId: detailStudentId });
  }
  const kpiMetric = event.target.closest("[data-kpi-metric]");
  if (kpiMetric) {
    const metric = kpiMetric.dataset.kpiMetric;
    if (selectedOverviewMetrics.has(metric)) selectedOverviewMetrics.delete(metric); else selectedOverviewMetrics.add(metric);
    if (!selectedOverviewMetrics.size) selectedOverviewMetrics.add(metric);
    localStorage.setItem("cmcg-overview-metrics", JSON.stringify([...selectedOverviewMetrics]));
    renderKpis();
  }
  const add = event.target.closest("[data-add-outcome]");
  if (add) openOutcome({ level: add.dataset.level || "ad", targetId: add.dataset.target || "" });
  if (event.target.closest("[data-close-outcome]")) document.getElementById("outcomeDialog").close();
  if (event.target.closest("[data-close-agent]")) document.getElementById("agentDialog")?.close();
  const editAgent = event.target.closest("[data-edit-agent]");
  if (editAgent) openAgentEditor(editAgent.dataset.editAgent);
  const deleteAgent = event.target.closest("[data-delete-agent]");
  if (deleteAgent) {
    const agent = byId(state.agents, deleteAgent.dataset.deleteAgent);
    if (agent && confirm(`Delete ${agent.name}? This removes the agent and clears old links, but keeps your imported ad data and outcomes.`)) {
      try { await api(`/api/agents/${agent.id}`, { method: "DELETE" }); await load(); toast("Agent deleted and ad sets rematched"); }
      catch (error) { toast(error.message, "error"); }
    }
  }
  const grouping = event.target.closest(".group-switch [data-group]");
  if (grouping) {
    groupBy = grouping.dataset.group;
    document.querySelectorAll("[data-group]").forEach((item) => item.classList.toggle("active", item.dataset.group === groupBy));
    renderPerformance();
  }
  const remove = event.target.closest("[data-delete-outcome]");
  if (remove && confirm("Delete this outcome? This cannot be undone.")) {
    try { await api(`/api/outcomes/${remove.dataset.deleteOutcome}`, { method: "DELETE" }); await load(); toast("Outcome deleted"); }
    catch (error) { toast(error.message, "error"); }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "periodPreset") { applyPeriodPreset(event.target.value); return; }
  if (event.target.id === "periodFrom" || event.target.id === "periodTo") {
    selectedPeriod = "custom";
    filters.from = document.getElementById("periodFrom").value;
    filters.to = document.getElementById("periodTo").value;
    savePeriod();
    updatePeriodControls();
    render();
    return;
  }
  if (event.target.id === "studentGroup") setStudentDefaultPrice();
  if (event.target.id === "groupAttendanceMode") syncGroupShiftFields();
  if (event.target.id === "plannerTraining") {
    const program = byId(state.programs, event.target.value);
    const duration = document.getElementById("plannerDuration");
    if (program?.durationLabel && duration && !duration.value) duration.value = program.durationLabel;
    renderPlannerSuggestions();
  }
  if (event.target.id === "plannerMode") renderPlannerSuggestions();
  const opsFilter = event.target.closest("[data-ops-filter]");
  if (opsFilter) { operationsFilters[opsFilter.dataset.opsFilter] = opsFilter.value; renderOperations(); }
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    filters[filter.dataset.filter] = filter.value;
    if (filter.dataset.filter === "from" || filter.dataset.filter === "to") {
      selectedPeriod = "custom";
      savePeriod();
      updatePeriodControls();
    }
    renderPerformance(); renderKpis(); renderFunnel(); renderOverviewTables(); renderOutcomes();
  }
  if (event.target.id === "performanceSort") { sortBy = event.target.value; renderPerformance(); }
  const column = event.target.closest("[data-column]");
  if (column) {
    if (column.checked) visibleColumns.add(column.dataset.column); else visibleColumns.delete(column.dataset.column);
    localStorage.setItem("cmcg-visible-columns", JSON.stringify([...visibleColumns]));
    renderPerformance();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#plannerTrainingName, #plannerDuration, #plannerCapacity")) renderPlannerSuggestions();
  if (event.target.closest("#groupForm") && event.target.name === "days") syncGroupShiftFields();
  const opsFilter = event.target.closest('[data-ops-filter="search"]');
  if (opsFilter) { operationsFilters.search = opsFilter.value; renderOperations(); }
  const filter = event.target.closest('[data-filter="search"]');
  if (filter) { filters.search = filter.value; renderPerformance(); }
});

document.getElementById("clearFilters").addEventListener("click", () => {
  Object.keys(filters).forEach((key) => { filters[key] = ""; });
  applyPeriodPreset("last7", false);
  hydrateFilters(); render();
});
document.getElementById("assignmentLevel").addEventListener("change", () => fillOutcomeTargets());
document.getElementById("outcomeTarget").addEventListener("change", (event) => { ensureOutcomeTargetId().value = event.target.value; });
document.getElementById("outcomeSearch").addEventListener("input", renderOutcomes);
document.getElementById("outcomeTypeFilter").addEventListener("change", renderOutcomes);
document.getElementById("refreshBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await load(); toast("Data refreshed"); } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
});

document.getElementById("metaCsvFile").addEventListener("change", (event) => selectMetaFile(event.target.files[0]));
const importCard = document.getElementById("importCard");
["dragenter", "dragover"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.add("dragging"); }));
["dragleave", "drop"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.remove("dragging"); }));
importCard.addEventListener("drop", (event) => selectMetaFile(event.dataTransfer.files[0]));
document.getElementById("importCsvButton").addEventListener("click", async (event) => {
  if (!pendingMetaFile) return;
  const button = event.currentTarget; const original = button.textContent; button.disabled = true; button.textContent = "Synchronizing…";
  try {
    const result = await api("/api/meta-import", { method: "POST", body: JSON.stringify({ filename: pendingMetaFile.name, csv: await pendingMetaFile.text() }) });
    pendingMetaFile = null; document.getElementById("metaCsvFile").value = ""; document.getElementById("selectedFile").classList.add("hidden");
    await load();
    const summary = result.result;
    toast(`${summary.rows} rows synced · ${summary.adsAdded} new ads · ${summary.metricsUpdated} updated`);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = !pendingMetaFile; button.textContent = original; }
});

document.getElementById("restoreFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error("Backup file is larger than 10 MB");
    pendingRestore = JSON.parse(await file.text());
    const candidate = pendingRestore.state || pendingRestore;
    const total = ["agents", "campaigns", "adSets", "creatives", "outcomes", "dailyLogs"].reduce((sum, key) => sum + (Array.isArray(candidate[key]) ? candidate[key].length : 0), 0);
    if (!total) throw new Error("This file does not contain CRM records");
    document.getElementById("restoreSummary").textContent = `This backup contains ${total} CRM records. Current data will be replaced after a safety backup is created.`;
    document.getElementById("restoreDialog").showModal();
  } catch (error) { pendingRestore = null; event.target.value = ""; toast(error.message, "error"); }
});
document.getElementById("confirmRestore").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!pendingRestore) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = "Restoring…";
  try { await api("/api/restore", { method: "POST", body: JSON.stringify(pendingRestore) }); pendingRestore = null; document.getElementById("restoreFile").value = ""; document.getElementById("restoreDialog").close(); await load(); toast("Backup restored successfully"); }
  catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Restore backup"; }
});

document.getElementById("confirmResetData").addEventListener("click", async (event) => {
  event.preventDefault();
  const button = event.currentTarget;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Resetting...";
  try {
    await api("/api/reset-data", { method: "POST", body: JSON.stringify({ confirm: true }) });
    document.getElementById("resetDataDialog").close();
    await load();
    toast("CRM data reset. Import your first real report.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

load().catch((error) => toast(error.message, "error"));
