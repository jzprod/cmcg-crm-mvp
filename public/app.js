let state = null;
let authEnabled = false;
let storageInfo = null;
let pendingRestore = null;
let pendingMetaFile = null;
let toastTimer = null;

const pageMeta = {
  dashboard: ["Overview", "Your advertising and enrollment results at a glance."],
  performance: ["Performance", "Compare ads, ad sets, campaigns, objectives, and agents."],
  outcomes: ["Outcomes", "Appointments, visits, and registered students."],
  agents: ["Agents", "Manage automatic ad-set assignment."],
  data: ["Import & data", "Synchronize Meta Ads and protect your CRM data."],
};
const outcomeMeta = {
  booked: { label: "Booked appointment", short: "Booked", className: "booked" },
  showed: { label: "Showed, no registration", short: "Showed", className: "showed" },
  registered: { label: "Registered student", short: "Registered", className: "registered" },
};
const groupLabels = { ad: "Ad", adSet: "Ad set", campaign: "Campaign", agent: "Agent" };
const filters = { from: "", to: "", agentId: "", objective: "", campaignId: "", search: "" };
let groupBy = "ad";

const columnDefinitions = [
  { key: "entity", label: "Name", required: true },
  { key: "agent", label: "Agent", default: true },
  { key: "objective", label: "Objective", default: true },
  { key: "spend", label: "Spend", default: true, numeric: true },
  { key: "messages", label: "Messages", default: true, numeric: true },
  { key: "booked", label: "Booked", default: true, numeric: true },
  { key: "showed", label: "Showed, no registration", default: true, numeric: true },
  { key: "registered", label: "Registered", default: true, numeric: true },
  { key: "costBooked", label: "Cost / booked", default: false, numeric: true },
  { key: "costRegistered", label: "Cost / registered", default: true, numeric: true },
  { key: "campaign", label: "Campaign", default: false },
  { key: "adSet", label: "Ad set", default: false },
  { key: "code", label: "Short code", default: false },
  { key: "delivery", label: "Delivery", default: false },
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
    if (Array.isArray(stored)) return new Set([...stored, "entity", "action"]);
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

function normalizeState() {
  ["adAccounts", "programs", "agents", "campaigns", "adSets", "creatives", "imports", "outcomes", "leads", "dailyLogs"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
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
  storageInfo = data.storage;
  render();
  const requestedPanel = window.location.hash.slice(1).replace(/^view=/, "");
  if (pageMeta[requestedPanel]) showPanel(requestedPanel, false);
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
  return state.outcomes.filter((outcome) => overlapsRange(outcome.date, outcome.date)
    && relationMatches(relationForOutcome(outcome), [outcome.personName, outcome.phone, outcome.notes].join(" ")));
}

function emptyMetrics() {
  return { spend: 0, messages: 0, messagesReplied: 0, results: 0, impressions: 0, reach: 0, linkClicks: 0, shopClicks: 0, clicksAll: 0, landingPageViews: 0, booked: 0, showed: 0, registered: 0 };
}

function addLogMetrics(target, log) {
  ["spend", "messages", "messagesReplied", "results", "impressions", "reach", "linkClicks", "shopClicks", "clicksAll", "landingPageViews"].forEach((key) => { target[key] += Number(log[key] || 0); });
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

function performanceRows(type = groupBy, useFilters = true) {
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
    if (row) row[outcome.type] += 1;
  });
  return [...rows.values()].sort((a, b) => {
    const aCost = a.registered ? a.spend / a.registered : Number.POSITIVE_INFINITY;
    const bCost = b.registered ? b.spend / b.registered : Number.POSITIVE_INFINITY;
    return aCost - bCost || b.registered - a.registered || b.booked - a.booked || b.messages - a.messages;
  });
}

function overallMetrics(useFilters = true) {
  const values = emptyMetrics();
  const logs = useFilters ? filteredLogs() : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes() : state.outcomes;
  logs.forEach((log) => addLogMetrics(values, log));
  outcomes.forEach((outcome) => { values[outcome.type] += 1; });
  values.visited = values.showed + values.registered;
  return values;
}

function renderKpis() {
  const values = overallMetrics(false);
  const items = [
    ["Spend", money(values.spend), "from Meta reports", "neutral"],
    ["Messages", number(values.messages), cost(values.spend, values.messages) + " each", "blue"],
    ["Booked", number(values.booked), cost(values.spend, values.booked) + " each", "amber"],
    ["Visited", number(values.visited), `${values.showed} without registration`, "violet"],
    ["Registered", number(values.registered), cost(values.spend, values.registered) + " each", "green"],
  ];
  document.getElementById("kpis").innerHTML = items.map(([label, value, detail, style]) => `<article class="kpi ${style}"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  const welcome = document.getElementById("welcomeState");
  welcome.classList.toggle("hidden", state.imports.length > 0);
  if (!state.imports.length) welcome.innerHTML = `<div><strong>Start with your Meta Ads report</strong><p>Import the saved CSV once. Campaigns, ad sets, ads, spend, and messages will appear automatically.</p></div><button class="button primary" type="button" data-open-import>Import first report</button>`;
}

function renderFunnel() {
  const values = overallMetrics(false);
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

function renderOverviewTables() {
  const ads = performanceRows("ad", false).slice(0, 7);
  document.getElementById("overviewRows").innerHTML = ads.length ? ads.map((row) => `<tr><td>${entityCell(row, "ad")}</td><td>${escapeHtml(row.relation.agent?.name || "Unassigned")}</td><td class="number-cell">${money(row.spend)}</td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.showed + row.registered}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td><td>${addOutcomeButton("ad", row.targetId, row.name)}</td></tr>`).join("") : '<tr><td colspan="9" class="empty">Import a Meta Ads report to see performance.</td></tr>';
  const agents = performanceRows("agent", false).filter((row) => row.key !== "__unassigned");
  document.getElementById("agentRows").innerHTML = agents.length ? agents.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.showed}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td></tr>`).join("") : '<tr><td colspan="6" class="empty">Add agents to compare their results.</td></tr>';
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
    agent: escapeHtml(relation.agent?.name || (groupBy === "agent" ? row.name : "Unassigned")),
    objective: escapeHtml(relation.objective || relation.adSet?.objective || relation.campaign?.objective || "—"),
    spend: money(row.spend), messages: number(row.messages), booked: row.booked, showed: row.showed, registered: `<strong>${row.registered}</strong>`,
    costBooked: cost(row.spend, row.booked), costRegistered: cost(row.spend, row.registered),
    campaign: escapeHtml(relation.campaign?.name || (groupBy === "campaign" ? row.name : "—")),
    adSet: escapeHtml(relation.adSet?.name || (groupBy === "adSet" ? row.name : "—")),
    code: relation.ad?.code ? `<span class="code">${escapeHtml(relation.ad.code)}</span>` : "—",
    delivery: escapeHtml(relation.ad?.deliveryStatus || relation.adSet?.deliveryStatus || relation.campaign?.deliveryStatus || "—"),
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
  const columns = columnDefinitions.filter((column) => visibleColumns.has(column.key));
  document.getElementById("performanceCount").textContent = `${rows.length} ${groupBy === "ad" ? "ads" : groupBy === "adSet" ? "ad sets" : groupBy === "campaign" ? "campaigns" : "agents"}`;
  document.getElementById("performanceTable").innerHTML = `<table><thead><tr>${columns.map((column) => `<th class="${column.numeric ? "number-cell" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((column) => `<td class="${column.numeric ? "number-cell" : ""}">${cellValue(column, row)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="empty">No performance matches these filters.</td></tr>`}</tbody></table>`;
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
    return (!type || outcome.type === type) && (!query || haystack.includes(query));
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
  const rows = performanceRows("agent", false);
  document.getElementById("agentDirectorySummary").textContent = `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"} · names match case-insensitively`;
  document.getElementById("agentCards").innerHTML = state.agents.length ? state.agents.map((agent) => {
    const adSets = state.adSets.filter((adSet) => adSet.agentId === agent.id);
    const metrics = rows.find((row) => row.key === agent.id) || emptyMetrics();
    return `<article class="card agent-card"><div class="agent-avatar" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</div><div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.whatsapp || "No WhatsApp number")}</small></div><div class="agent-stat"><strong>${adSets.length}</strong><span>matched ad sets</span></div><div class="agent-stat"><strong>${metrics.registered || 0}</strong><span>registrations</span></div><button class="row-add" type="button" data-add-outcome data-level="agent" data-target="${escapeHtml(agent.id)}" aria-label="Add outcome for ${escapeHtml(agent.name)}">+</button></article>`;
  }).join("") : '<div class="empty card">Add your first sales agent. Existing imported ad sets will be matched immediately.</div>';
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  document.getElementById("unassignedAdSets").innerHTML = unassigned.length ? unassigned.map((adSet) => `<div class="simple-list-row"><div><strong>${escapeHtml(adSet.name)}</strong><small>${escapeHtml(byId(state.campaigns, adSet.campaignId)?.name || "Unknown campaign")}</small></div><span class="status-pill ${adSet.agentMatchStatus === "ambiguous" ? "warning" : ""}">${adSet.agentMatchStatus === "ambiguous" ? "Multiple names found" : "No matching agent"}</span></div>`).join("") : '<div class="empty success-empty">All imported ad sets are assigned.</div>';
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
  const counts = [[state.adAccounts.length, "accounts"], [state.campaigns.length, "campaigns"], [state.adSets.length, "ad sets"], [state.creatives.length, "ads"], [state.outcomes.length, "outcomes"], [state.imports.length, "imports"]];
  document.getElementById("systemCounts").innerHTML = counts.map(([value, label]) => `<span class="system-count"><strong>${value}</strong> ${label}</span>`).join("");
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
  hydrateFilters();
  document.getElementById("authWarning").classList.toggle("hidden", authEnabled);
  renderKpis(); renderFunnel(); renderAttention(); renderOverviewTables(); renderPerformance(); renderOutcomes(); renderAgents(); renderImports(); renderStorage();
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

function fillOutcomeTargets(preferred = "") {
  const level = document.getElementById("assignmentLevel").value;
  const target = document.getElementById("outcomeTarget");
  const label = groupLabels[level];
  document.getElementById("targetLabel").textContent = label;
  const options = targetOptions(level);
  target.replaceChildren(option(options.length ? `Select ${label.toLocaleLowerCase()}` : `No ${label.toLocaleLowerCase()} available`, ""));
  options.forEach((item) => target.append(option(item.label, item.id)));
  if (options.some((item) => item.id === preferred)) target.value = preferred;
  document.getElementById("assignmentHint").textContent = level === "ad" ? "Best choice when you know the exact creative." : level === "adSet" ? "Use when you know the ad set but not the exact ad." : level === "campaign" ? "Use when only the campaign is known." : "Use when you only know the sales agent.";
}

function openOutcome({ level = "ad", targetId = "", type = "" } = {}) {
  const form = document.getElementById("outcomeForm");
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  form.elements.assignmentLevel.value = level;
  if (type && form.elements.type) form.querySelector(`input[name="type"][value="${CSS.escape(type)}"]`).checked = true;
  fillOutcomeTargets(targetId);
  document.getElementById("outcomeDialog").showModal();
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
      await api("/api/outcomes", { method: "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("outcomeDialog").close();
      await load(); toast("Outcome saved");
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
  const add = event.target.closest("[data-add-outcome]");
  if (add) openOutcome({ level: add.dataset.level || "ad", targetId: add.dataset.target || "" });
  if (event.target.closest("[data-close-outcome]")) document.getElementById("outcomeDialog").close();
  const grouping = event.target.closest("[data-group]");
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
  const filter = event.target.closest("[data-filter]");
  if (filter) { filters[filter.dataset.filter] = filter.value; renderPerformance(); renderKpis(); renderFunnel(); renderOverviewTables(); }
  const column = event.target.closest("[data-column]");
  if (column) {
    if (column.checked) visibleColumns.add(column.dataset.column); else visibleColumns.delete(column.dataset.column);
    localStorage.setItem("cmcg-visible-columns", JSON.stringify([...visibleColumns]));
    renderPerformance();
  }
});

document.addEventListener("input", (event) => {
  const filter = event.target.closest('[data-filter="search"]');
  if (filter) { filters.search = filter.value; renderPerformance(); }
});

document.getElementById("clearFilters").addEventListener("click", () => {
  Object.keys(filters).forEach((key) => { filters[key] = ""; });
  hydrateFilters(); render();
});
document.getElementById("assignmentLevel").addEventListener("change", () => fillOutcomeTargets());
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

load().catch((error) => toast(error.message, "error"));
