let state = null;
let authEnabled = false;
let storageInfo = null;
let pendingRestore = null;
let toastTimer = null;

const pageTitles = { dashboard: "Overview", setup: "Campaign setup", leads: "Leads", logs: "Ad spend", data: "Data & backup" };
const stages = [
  ["new", "New"], ["contacted", "Contacted"], ["qualified", "Qualified"], ["booked", "Booked date"],
  ["showed", "Showed up"], ["no_show", "No-show"], ["registered", "Registered"], ["lost", "Lost"],
];

const byId = (items, id) => items.find((item) => item.id === id) || null;
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (value) => `${new Intl.NumberFormat("en-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} MAD`;
const fmt = (value) => (Number.isFinite(value) && value > 0 ? money(value) : "–");
const stageLabel = (value) => stages.find(([key]) => key === value)?.[1] || value || "Unknown";

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
  toastTimer = setTimeout(() => element.classList.add("hidden"), 3200);
}

async function api(route, options = {}) {
  const response = await fetch(route, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  const data = await api("/api/state");
  state = data.state;
  authEnabled = data.authEnabled;
  storageInfo = data.storage;
  render();
}

function option(label, value = "") {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function fillSelect(select) {
  const type = select.dataset.options;
  const current = select.value;
  select.innerHTML = "";
  const placeholders = { programs: "Select training", agents: "Select sales agent", campaigns: "Select campaign", adSets: "Select ad set", creatives: "Select creative code" };
  select.append(option(placeholders[type] || "Select", ""));
  if (type === "programs") state.programs.forEach((item) => select.append(option(item.name, item.id)));
  if (type === "agents") state.agents.filter((item) => item.active !== false).forEach((item) => select.append(option(item.name, item.id)));
  if (type === "campaigns") state.campaigns.forEach((item) => {
    const program = byId(state.programs, item.programId);
    select.append(option(`${item.name} · ${program?.name || "No training"}`, item.id));
  });
  if (type === "adSets") state.adSets.forEach((item) => {
    const agent = byId(state.agents, item.agentId);
    select.append(option(`${item.name} · ${agent?.name || "No agent"}`, item.id));
  });
  if (type === "creatives") state.creatives.forEach((item) => select.append(option(`${item.code} · ${item.name}`, item.id)));
  if ([...select.options].some((item) => item.value === current)) select.value = current;
}

function hydrateFilters() {
  const programFilter = document.getElementById("programFilter");
  const agentFilter = document.getElementById("agentFilter");
  const currentProgram = programFilter.value;
  const currentAgent = agentFilter.value;
  programFilter.replaceChildren(option("All trainings", ""));
  agentFilter.replaceChildren(option("All sales agents", ""));
  state.programs.forEach((item) => programFilter.append(option(item.name, item.id)));
  state.agents.forEach((item) => agentFilter.append(option(item.name, item.id)));
  if ([...programFilter.options].some((item) => item.value === currentProgram)) programFilter.value = currentProgram;
  if ([...agentFilter.options].some((item) => item.value === currentAgent)) agentFilter.value = currentAgent;
}

function relationForCreative(creative) {
  const adSet = byId(state.adSets, creative?.adSetId);
  const campaign = byId(state.campaigns, adSet?.campaignId);
  const program = byId(state.programs, campaign?.programId);
  const agent = byId(state.agents, adSet?.agentId);
  return { adSet, campaign, program, agent };
}

function leadInRange(lead) {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const date = dateOnly(lead.createdAt);
  return (!from || date >= from) && (!to || date <= to);
}

function logInRange(log) {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  return (!from || log.date >= from) && (!to || log.date <= to);
}

function filteredLeads() {
  const programId = document.getElementById("programFilter").value;
  const agentId = document.getElementById("agentFilter").value;
  return state.leads.filter((lead) => leadInRange(lead)
    && (!programId || lead.programId === programId)
    && (!agentId || lead.agentId === agentId));
}

function filteredLogs() {
  const programId = document.getElementById("programFilter").value;
  const agentId = document.getElementById("agentFilter").value;
  return state.dailyLogs.filter((log) => {
    const creative = byId(state.creatives, log.creativeId);
    const relation = relationForCreative(creative);
    return logInRange(log)
      && (!programId || log.programId === programId)
      && (!agentId || relation.agent?.id === agentId);
  });
}

function computeRows() {
  const leads = filteredLeads();
  const logs = filteredLogs();
  return state.creatives.map((creative) => {
    const relation = relationForCreative(creative);
    const creativeLeads = leads.filter((lead) => lead.creativeId === creative.id || lead.code === creative.code);
    const creativeLogs = logs.filter((log) => log.creativeId === creative.id);
    const spend = creativeLogs.reduce((sum, log) => sum + Number(log.spend || 0), 0);
    const messages = creativeLogs.reduce((sum, log) => sum + Number(log.messages || 0), 0);
    const booked = creativeLeads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
    const showed = creativeLeads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
    const registered = creativeLeads.filter((lead) => lead.stage === "registered").length;
    return { creative, relation, spend, messages, leads: creativeLeads.length, booked, showed, registered,
      cpl: creativeLeads.length ? spend / creativeLeads.length : 0,
      cpReg: registered ? spend / registered : 0,
      efficiency: spend ? (registered / spend) * 1000 : 0 };
  }).sort((a, b) => b.efficiency - a.efficiency || b.registered - a.registered || b.leads - a.leads);
}

function metrics() {
  const leads = filteredLeads();
  const logs = filteredLogs();
  const spend = logs.reduce((sum, log) => sum + Number(log.spend || 0), 0);
  const messages = logs.reduce((sum, log) => sum + Number(log.messages || 0), 0);
  const booked = leads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
  const showed = leads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
  const registered = leads.filter((lead) => lead.stage === "registered").length;
  return { leads, logs, spend, messages, booked, showed, registered };
}

function renderKpis() {
  const values = metrics();
  const items = [
    ["Spend", money(values.spend), "entered in daily logs"], ["Messages", values.messages, "from ad reporting"],
    ["Leads", values.leads.length, `${fmt(values.leads.length ? values.spend / values.leads.length : 0)} CPL`],
    ["Booked", values.booked, `${fmt(values.booked ? values.spend / values.booked : 0)} per booking`],
    ["Showed", values.showed, `${fmt(values.showed ? values.spend / values.showed : 0)} per show-up`],
    ["Registered", values.registered, `${fmt(values.registered ? values.spend / values.registered : 0)} per student`],
  ];
  document.getElementById("kpis").innerHTML = items.map(([label, value, detail]) => `<article class="kpi"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
}

function renderFunnel() {
  const values = metrics();
  const qualified = values.leads.filter((lead) => ["qualified", "booked", "showed", "registered"].includes(lead.stage)).length;
  const stagesData = [["Leads", values.leads.length], ["Qualified", qualified], ["Booked", values.booked], ["Showed", values.showed], ["Registered", values.registered]];
  const maximum = Math.max(1, values.leads.length);
  document.getElementById("funnel").innerHTML = stagesData.map(([label, value]) => {
    const percentage = Math.round((value / maximum) * 100);
    return `<div class="funnel-row"><span>${label}</span><div class="funnel-track" role="img" aria-label="${label}: ${value}, ${percentage}% of leads"><span style="width:${percentage}%"></span></div><span class="funnel-value">${value} · ${percentage}%</span></div>`;
  }).join("");
}

function renderUpcomingAppointments() {
  const now = Date.now();
  const upcoming = state.leads.filter((lead) => lead.appointmentAt && new Date(lead.appointmentAt).getTime() >= now && !["lost", "registered"].includes(lead.stage))
    .sort((a, b) => String(a.appointmentAt).localeCompare(String(b.appointmentAt))).slice(0, 5);
  document.getElementById("upcomingAppointments").innerHTML = upcoming.length
    ? `<div class="appointment-list">${upcoming.map((lead) => { const agent = byId(state.agents, lead.agentId); return `<div class="appointment"><div><strong>${escapeHtml(lead.phone || `Lead ${lead.code}`)}</strong><small>${escapeHtml(agent?.name || "No agent")}</small></div><time>${escapeHtml(new Date(lead.appointmentAt).toLocaleString())}</time></div>`; }).join("")}</div>`
    : '<div class="empty">No upcoming appointments.</div>';
}

function renderScoreRows(rows) {
  const maximum = Math.max(1, ...rows.map((row) => row.efficiency));
  document.getElementById("scoreRows").innerHTML = rows.length ? rows.map((row) => {
    const width = Math.round((row.efficiency / maximum) * 100);
    return `<tr><td><span class="code">${escapeHtml(row.creative.code)}</span></td><td><strong>${escapeHtml(row.creative.name)}</strong><br><span class="pill">${escapeHtml(row.relation.program?.name || "–")}</span></td><td>${escapeHtml(row.relation.agent?.name || "–")}</td><td>${escapeHtml(row.relation.adSet?.objective || "–")}</td><td>${money(row.spend)}</td><td>${row.messages}</td><td>${row.leads}</td><td>${row.booked}</td><td>${row.showed}</td><td>${row.registered}</td><td>${fmt(row.cpl)}</td><td>${fmt(row.cpReg)}</td><td><div class="bar" title="${row.efficiency.toFixed(2)} registrations per 1000 MAD"><span style="width:${width}%"></span></div></td></tr>`;
  }).join("") : '<tr><td colspan="13" class="empty">Complete campaign setup to start tracking performance.</td></tr>';
}

function renderAgentScore() {
  const leads = filteredLeads();
  const rows = state.agents.map((agent) => {
    const agentLeads = leads.filter((lead) => lead.agentId === agent.id);
    const booked = agentLeads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
    const showed = agentLeads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
    const registered = agentLeads.filter((lead) => lead.stage === "registered").length;
    return `<tr><td><strong>${escapeHtml(agent.name)}</strong></td><td>${agentLeads.length}</td><td>${booked}</td><td>${showed}</td><td>${registered}</td><td>${booked ? Math.round((showed / booked) * 100) : 0}%</td><td>${showed ? Math.round((registered / showed) * 100) : 0}%</td></tr>`;
  });
  document.getElementById("agentScore").innerHTML = `<div class="section-head"><div><h3>Sales agent quality</h3><p>Conversion quality separated from media-buying performance.</p></div></div><div class="table-wrap"><table><thead><tr><th>Agent</th><th>Leads</th><th>Booked</th><th>Showed</th><th>Registered</th><th>Show rate</th><th>Close rate</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="7" class="empty">No sales agents yet.</td></tr>'}</tbody></table></div>`;
}

function welcomeMessage(creative) {
  return `مرحبا، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان: ${creative.code}`;
}

function renderCodeCards() {
  document.getElementById("codeCards").innerHTML = state.creatives.length ? state.creatives.map((creative) => {
    const relation = relationForCreative(creative);
    return `<article class="card code-card"><div class="code-card-head"><div><strong>${escapeHtml(creative.name)}</strong><p>${escapeHtml(relation.program?.name || "No training")} · ${escapeHtml(relation.agent?.name || "No agent")}</p></div><span class="code">${escapeHtml(creative.code)}</span></div><p class="message" dir="rtl">${escapeHtml(welcomeMessage(creative))}</p><p class="message">${escapeHtml(relation.adSet?.name || "No ad set")} · ${escapeHtml(creative.format)} · ${escapeHtml(creative.language)}</p><button type="button" data-copy="${escapeHtml(creative.id)}" class="button secondary">Copy welcome message</button></article>`;
  }).join("") : '<div class="empty">No creative codes yet.</div>';
}

function renderSetupSummary() {
  const items = [[state.programs.length, "Trainings"], [state.agents.length, "Sales agents"], [state.campaigns.length, "Campaigns"], [state.adSets.length, "Ad sets"], [state.creatives.length, "Creatives"]];
  document.getElementById("setupSummary").innerHTML = items.map(([value, label]) => `<article class="summary-item"><strong>${value}</strong><span>${label}</span></article>`).join("");
}

function visibleLeads() {
  const query = document.getElementById("leadSearch").value.trim().toLocaleLowerCase();
  const stage = document.getElementById("leadStageFilter").value;
  return [...state.leads].filter((lead) => {
    const agent = byId(state.agents, lead.agentId);
    const haystack = [lead.code, lead.phone, lead.notes, lead.lostReason, agent?.name].join(" ").toLocaleLowerCase();
    return (!stage || lead.stage === stage) && (!query || haystack.includes(query));
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function renderLeadRows() {
  const leads = visibleLeads();
  document.getElementById("leadCount").textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;
  document.getElementById("leadRows").innerHTML = leads.length ? leads.map((lead) => {
    const agent = byId(state.agents, lead.agentId);
    const stageOptions = stages.map(([value, label]) => `<option value="${value}" ${lead.stage === value ? "selected" : ""}>${label}</option>`).join("");
    return `<tr data-lead="${escapeHtml(lead.id)}"><td>${escapeHtml(dateOnly(lead.createdAt))}</td><td><span class="code">${escapeHtml(lead.code || "–")}</span></td><td>${escapeHtml(agent?.name || "–")}</td><td><input data-field="phone" value="${escapeHtml(lead.phone || "")}" aria-label="Phone for ${escapeHtml(lead.code)}"></td><td><select data-field="stage" aria-label="Stage for ${escapeHtml(lead.code)}">${stageOptions}</select></td><td><input data-field="appointmentAt" type="datetime-local" value="${escapeHtml((lead.appointmentAt || "").slice(0, 16))}" aria-label="Appointment for ${escapeHtml(lead.code)}"></td><td><input data-field="amountPaid" type="number" min="0" step="1" value="${escapeHtml(lead.amountPaid || "")}" aria-label="Paid amount for ${escapeHtml(lead.code)}"></td><td><input data-field="lostReason" value="${escapeHtml(lead.lostReason || "")}" placeholder="Reason" aria-label="Lost reason for ${escapeHtml(lead.code)}"></td><td><input data-field="notes" value="${escapeHtml(lead.notes || "")}" placeholder="Notes" aria-label="Notes for ${escapeHtml(lead.code)}"></td><td><button type="button" data-save-lead="${escapeHtml(lead.id)}" class="button primary">Save</button></td></tr>`;
  }).join("") : '<tr><td colspan="10" class="empty">No leads match this view.</td></tr>';
}

function renderLogRows() {
  const logs = [...state.dailyLogs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  document.getElementById("logRows").innerHTML = logs.length ? logs.map((log) => {
    const creative = byId(state.creatives, log.creativeId);
    const relation = relationForCreative(creative);
    return `<tr><td>${escapeHtml(log.date)}</td><td><span class="code">${escapeHtml(creative?.code || "–")}</span></td><td>${escapeHtml(creative?.name || "–")}</td><td>${escapeHtml(relation.agent?.name || "–")}</td><td>${money(log.spend)}</td><td>${Number(log.messages || 0)}</td><td>${escapeHtml(log.notes || "")}</td></tr>`;
  }).join("") : '<tr><td colspan="7" class="empty">No daily spend has been entered.</td></tr>';
}

function renderStorage() {
  const persistent = Boolean(storageInfo?.persistent);
  const badge = document.getElementById("storageBadge");
  badge.classList.toggle("persistent", persistent);
  badge.querySelector("strong").textContent = storageInfo?.label || "Unknown";
  document.getElementById("storageWarning").classList.toggle("hidden", persistent);
  document.getElementById("storageTitle").textContent = storageInfo?.label || "Unknown storage";
  document.getElementById("storageDescription").textContent = persistent
    ? "Deployment-safe MySQL storage is active. Automatic database snapshots are kept before changes."
    : "Local JSON is suitable for development only. Hostinger redeployments can replace this file.";
  document.getElementById("lastSaved").textContent = formatSavedAt(state.meta?.updatedAt);
  const counts = [[state.programs.length, "trainings"], [state.agents.length, "agents"], [state.creatives.length, "creatives"], [state.leads.length, "leads"], [state.dailyLogs.length, "spend logs"]];
  document.getElementById("systemCounts").innerHTML = counts.map(([value, label]) => `<span class="system-count"><strong>${value}</strong> ${label}</span>`).join("");
}

function render() {
  document.querySelectorAll("select[data-options]").forEach(fillSelect);
  hydrateFilters();
  document.getElementById("authWarning").classList.toggle("hidden", authEnabled);
  renderKpis();
  renderFunnel();
  renderUpcomingAppointments();
  renderScoreRows(computeRows());
  renderAgentScore();
  renderSetupSummary();
  renderCodeCards();
  renderLeadRows();
  renderLogRows();
  renderStorage();
  const dateInput = document.querySelector('form[data-create="daily-logs"] input[name="date"]');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
}

function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }

function showPanel(name) {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((item) => item.classList.toggle("active", item.id === name));
  document.getElementById("pageTitle").textContent = pageTitles[name] || "CMCG CRM";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadCsv(name, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  URL.revokeObjectURL(url);
}

function exportData(type) {
  if (type === "leads") {
    const rows = [["Created", "Code", "Training", "Agent", "Phone", "Stage", "Appointment", "Paid MAD", "Lost reason", "Notes"]];
    visibleLeads().forEach((lead) => {
      const creative = byId(state.creatives, lead.creativeId); const relation = relationForCreative(creative); const agent = byId(state.agents, lead.agentId);
      rows.push([lead.createdAt, lead.code, relation.program?.name, agent?.name, lead.phone, stageLabel(lead.stage), lead.appointmentAt, lead.amountPaid, lead.lostReason, lead.notes]);
    });
    downloadCsv("cmcg-leads", rows);
  }
  if (type === "logs") {
    const rows = [["Date", "Code", "Creative", "Training", "Agent", "Spend MAD", "Messages", "Notes"]];
    state.dailyLogs.forEach((log) => { const creative = byId(state.creatives, log.creativeId); const relation = relationForCreative(creative); rows.push([log.date, creative?.code, creative?.name, relation.program?.name, relation.agent?.name, log.spend, log.messages, log.notes]); });
    downloadCsv("cmcg-ad-spend", rows);
  }
  if (type === "dashboard") {
    const rows = [["Code", "Creative", "Training", "Agent", "Spend MAD", "Messages", "Leads", "Booked", "Showed", "Registered", "CPL", "Cost per registration"]];
    computeRows().forEach((row) => rows.push([row.creative.code, row.creative.name, row.relation.program?.name, row.relation.agent?.name, row.spend, row.messages, row.leads, row.booked, row.showed, row.registered, row.cpl, row.cpReg]));
    downloadCsv("cmcg-performance", rows);
  }
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const create = form.dataset.create;
  const submitButton = form.querySelector('button[type="submit"], button:not([type])');
  const originalText = submitButton?.textContent;
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Saving…"; }
  try {
    if (create) {
      const saved = await api(`/api/${create}`, { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset();
      toast(create === "creatives" ? `Creative ${saved.code} created` : "Saved successfully");
      await load();
      return;
    }
    if (form.id === "leadForm") {
      await api("/api/leads", { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset(); toast("Lead added"); await load();
    }
  } catch (error) { toast(error.message, "error"); }
  finally { if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalText; } }
});

document.addEventListener("click", async (event) => {
  const tab = event.target.closest(".tab");
  if (tab) showPanel(tab.dataset.tab);
  const copyId = event.target.closest("[data-copy]")?.dataset.copy;
  if (copyId) {
    const creative = byId(state.creatives, copyId);
    try { await navigator.clipboard.writeText(welcomeMessage(creative)); toast("Welcome message copied"); }
    catch { toast("Clipboard access was blocked", "error"); }
  }
  const leadId = event.target.closest("[data-save-lead]")?.dataset.saveLead;
  if (leadId) {
    const row = document.querySelector(`tr[data-lead="${CSS.escape(leadId)}"]`);
    const payload = {};
    row.querySelectorAll("[data-field]").forEach((input) => { payload[input.dataset.field] = input.value; });
    if (payload.stage === "registered") payload.registeredAt = new Date().toISOString();
    const button = event.target.closest("button"); const original = button.textContent; button.disabled = true; button.textContent = "Saving…";
    try { await api(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(payload) }); toast("Lead updated"); await load(); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = original; }
  }
  const exportType = event.target.closest("[data-export]")?.dataset.export;
  if (exportType) exportData(exportType);
});

["fromDate", "toDate", "programFilter", "agentFilter"].forEach((id) => document.getElementById(id).addEventListener("change", () => { if (state) render(); }));
document.getElementById("leadSearch").addEventListener("input", () => state && renderLeadRows());
document.getElementById("leadStageFilter").addEventListener("change", () => state && renderLeadRows());
document.getElementById("clearFilters").addEventListener("click", () => {
  ["fromDate", "toDate", "programFilter", "agentFilter"].forEach((id) => { document.getElementById(id).value = ""; });
  render();
});
document.getElementById("refreshBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await load(); toast("Data refreshed"); } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
});

document.getElementById("restoreFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error("Backup file is larger than 10 MB");
    pendingRestore = JSON.parse(await file.text());
    const candidate = pendingRestore.state || pendingRestore;
    const total = ["programs", "agents", "campaigns", "adSets", "creatives", "leads", "dailyLogs"].reduce((sum, key) => sum + (Array.isArray(candidate[key]) ? candidate[key].length : 0), 0);
    if (!total) throw new Error("This file does not contain CRM records");
    document.getElementById("restoreSummary").textContent = `This backup contains ${total} CRM records. Current data will be replaced after a safety backup is created.`;
    document.getElementById("restoreDialog").showModal();
  } catch (error) { pendingRestore = null; event.target.value = ""; toast(error.message, "error"); }
});

document.getElementById("confirmRestore").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!pendingRestore) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = "Restoring…";
  try {
    await api("/api/restore", { method: "POST", body: JSON.stringify(pendingRestore) });
    pendingRestore = null; document.getElementById("restoreFile").value = ""; document.getElementById("restoreDialog").close();
    await load(); toast("Backup restored successfully");
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Restore backup"; }
});

load().catch((error) => toast(error.message, "error"));
