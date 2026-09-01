let state = null;
let authEnabled = false;

const money = (value) => `${Number(value || 0).toFixed(2)} MAD`;
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const byId = (items, id) => items.find((item) => item.id === id) || null;
const fmt = (value) => (Number.isFinite(value) && value > 0 ? money(value) : "-");

const stages = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["qualified", "Qualified"],
  ["booked", "Booked date"],
  ["showed", "Showed up"],
  ["no_show", "No-show"],
  ["registered", "Registered"],
  ["lost", "Lost"],
];

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2400);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  const data = await api("/api/state");
  state = data.state;
  authEnabled = data.authEnabled;
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
  if (type === "programs") {
    select.append(option("Select training", ""));
    state.programs.forEach((item) => select.append(option(item.name, item.id)));
  }
  if (type === "agents") {
    select.append(option("Select agent", ""));
    state.agents.forEach((item) => select.append(option(item.name, item.id)));
  }
  if (type === "campaigns") {
    select.append(option("Select campaign", ""));
    state.campaigns.forEach((item) => {
      const program = byId(state.programs, item.programId);
      select.append(option(`${item.name} (${program?.name || "No training"})`, item.id));
    });
  }
  if (type === "adSets") {
    select.append(option("Select ad set", ""));
    state.adSets.forEach((item) => {
      const agent = byId(state.agents, item.agentId);
      select.append(option(`${item.name} - ${agent?.name || "No agent"}`, item.id));
    });
  }
  if (type === "creatives") {
    select.append(option("Select creative code", ""));
    state.creatives.forEach((item) => select.append(option(`${item.code} - ${item.name}`, item.id)));
  }
  select.value = current;
}

function hydrateFilters() {
  const programFilter = document.getElementById("programFilter");
  const agentFilter = document.getElementById("agentFilter");
  const currentProgram = programFilter.value;
  const currentAgent = agentFilter.value;
  programFilter.innerHTML = "";
  agentFilter.innerHTML = "";
  programFilter.append(option("All programs", ""));
  agentFilter.append(option("All agents", ""));
  state.programs.forEach((item) => programFilter.append(option(item.name, item.id)));
  state.agents.forEach((item) => agentFilter.append(option(item.name, item.id)));
  programFilter.value = currentProgram;
  agentFilter.value = currentAgent;
}

function relationForCreative(creative) {
  const adSet = byId(state.adSets, creative.adSetId);
  const campaign = byId(state.campaigns, adSet?.campaignId);
  const program = byId(state.programs, campaign?.programId);
  const agent = byId(state.agents, adSet?.agentId);
  return { adSet, campaign, program, agent };
}

function leadInRange(lead) {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const d = dateOnly(lead.createdAt);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function logInRange(log) {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  if (from && log.date < from) return false;
  if (to && log.date > to) return false;
  return true;
}

function filteredLeads() {
  const programId = document.getElementById("programFilter").value;
  const agentId = document.getElementById("agentFilter").value;
  return state.leads.filter((lead) => {
    if (!leadInRange(lead)) return false;
    if (programId && lead.programId !== programId) return false;
    if (agentId && lead.agentId !== agentId) return false;
    return true;
  });
}

function filteredLogs() {
  const programId = document.getElementById("programFilter").value;
  return state.dailyLogs.filter((log) => {
    if (!logInRange(log)) return false;
    if (programId && log.programId !== programId) return false;
    return true;
  });
}

function computeRows() {
  const rows = state.creatives.map((creative) => {
    const rel = relationForCreative(creative);
    const leads = filteredLeads().filter((lead) => lead.creativeId === creative.id || lead.code === creative.code);
    const logs = filteredLogs().filter((log) => log.creativeId === creative.id);
    const spend = logs.reduce((sum, log) => sum + Number(log.spend || 0), 0);
    const messages = logs.reduce((sum, log) => sum + Number(log.messages || 0), 0);
    const booked = leads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
    const showed = leads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
    const registered = leads.filter((lead) => lead.stage === "registered").length;
    return {
      creative,
      rel,
      spend,
      messages,
      leads: leads.length,
      booked,
      showed,
      registered,
      cpl: leads.length ? spend / leads.length : 0,
      cpReg: registered ? spend / registered : 0,
      efficiency: spend ? (registered / spend) * 1000 : 0,
    };
  });
  return rows.sort((a, b) => b.efficiency - a.efficiency || b.registered - a.registered || b.leads - a.leads);
}

function renderKpis(rows) {
  const leads = filteredLeads();
  const logs = filteredLogs();
  const spend = logs.reduce((sum, log) => sum + Number(log.spend || 0), 0);
  const messages = logs.reduce((sum, log) => sum + Number(log.messages || 0), 0);
  const booked = leads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
  const showed = leads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
  const registered = leads.filter((lead) => lead.stage === "registered").length;
  const items = [
    ["Spend", money(spend), "manual daily logs"],
    ["Messages", messages, "from ad logs"],
    ["Leads", leads.length, fmt(leads.length ? spend / leads.length : 0) + " CPL"],
    ["Booked", booked, fmt(booked ? spend / booked : 0) + " per date"],
    ["Showed", showed, fmt(showed ? spend / showed : 0) + " per show"],
    ["Registered", registered, fmt(registered ? spend / registered : 0) + " per student"],
  ];
  document.getElementById("kpis").innerHTML = items
    .map(([label, value, sub]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");
}

function renderScoreRows(rows) {
  const maxEfficiency = Math.max(1, ...rows.map((row) => row.efficiency));
  document.getElementById("scoreRows").innerHTML =
    rows
      .map((row) => {
        const width = Math.round((row.efficiency / maxEfficiency) * 100);
        return `<tr>
          <td><span class="code">${row.creative.code}</span></td>
          <td>${row.creative.name}<br><span class="pill">${row.rel.program?.name || "-"}</span></td>
          <td>${row.rel.agent?.name || "-"}</td>
          <td>${row.rel.adSet?.objective || "-"}</td>
          <td>${money(row.spend)}</td>
          <td>${row.messages}</td>
          <td>${row.leads}</td>
          <td>${row.booked}</td>
          <td>${row.showed}</td>
          <td>${row.registered}</td>
          <td>${fmt(row.cpl)}</td>
          <td>${fmt(row.cpReg)}</td>
          <td><div class="bar" title="${row.efficiency.toFixed(2)} registrations per 1000 MAD"><span style="width:${width}%"></span></div></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="13" class="empty">Create a training, agent, ad set, and creative code to start tracking.</td></tr>`;
}

function renderAgentScore() {
  const agentScore = state.agents.map((agent) => {
    const leads = filteredLeads().filter((lead) => lead.agentId === agent.id);
    const booked = leads.filter((lead) => ["booked", "showed", "registered"].includes(lead.stage)).length;
    const showed = leads.filter((lead) => ["showed", "registered"].includes(lead.stage)).length;
    const registered = leads.filter((lead) => lead.stage === "registered").length;
    const showRate = booked ? Math.round((showed / booked) * 100) : 0;
    const closeRate = showed ? Math.round((registered / showed) * 100) : 0;
    return `<tr><td>${agent.name}</td><td>${leads.length}</td><td>${booked}</td><td>${showed}</td><td>${registered}</td><td>${showRate}%</td><td>${closeRate}%</td></tr>`;
  });
  document.getElementById("agentScore").innerHTML = `
    <div class="section-head"><div><h2>Agent quality score</h2><p>Use this for sales behavior, not media buying judgment.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Agent</th><th>Leads</th><th>Booked</th><th>Showed</th><th>Registered</th><th>Show rate</th><th>Close rate</th></tr></thead><tbody>${agentScore.join("") || `<tr><td colspan="7" class="empty">No agents yet.</td></tr>`}</tbody></table></div>
  `;
}

function welcomeMessage(creative) {
  return `مرحبا، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان: ${creative.code}`;
}

function renderCodeCards() {
  document.getElementById("codeCards").innerHTML =
    state.creatives
      .map((creative) => {
        const rel = relationForCreative(creative);
        return `<article class="code-card">
          <strong>${creative.name}</strong>
          <div class="code">${creative.code}</div>
          <p class="message" dir="rtl">${welcomeMessage(creative)}</p>
          <p class="message">${rel.program?.name || "-"} / ${rel.agent?.name || "-"} / ${rel.adSet?.objective || "-"}</p>
          <button type="button" data-copy="${creative.id}" class="ghost">Copy message</button>
        </article>`;
      })
      .join("") || `<div class="empty">No creative codes yet.</div>`;
}

function renderLeadRows() {
  const leads = [...state.leads].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById("leadRows").innerHTML =
    leads
      .map((lead) => {
        const agent = byId(state.agents, lead.agentId);
        const stageOptions = stages.map(([value, label]) => `<option value="${value}" ${lead.stage === value ? "selected" : ""}>${label}</option>`).join("");
        return `<tr data-lead="${lead.id}">
          <td>${dateOnly(lead.createdAt)}</td>
          <td><span class="code">${lead.code || "-"}</span></td>
          <td>${agent?.name || "-"}</td>
          <td><input data-field="phone" value="${lead.phone || ""}" placeholder="Phone"></td>
          <td><select data-field="stage">${stageOptions}</select></td>
          <td><input data-field="appointmentAt" type="datetime-local" value="${(lead.appointmentAt || "").slice(0, 16)}"></td>
          <td><input data-field="amountPaid" type="number" min="0" step="1" value="${lead.amountPaid || ""}"></td>
          <td><input data-field="notes" value="${lead.notes || ""}" placeholder="Notes"></td>
          <td><button type="button" data-save-lead="${lead.id}">Save</button></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="9" class="empty">No leads yet. Add the first one from a welcome-message code.</td></tr>`;
}

function renderLogRows() {
  const logs = [...state.dailyLogs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  document.getElementById("logRows").innerHTML =
    logs
      .map((log) => {
        const creative = byId(state.creatives, log.creativeId);
        const rel = creative ? relationForCreative(creative) : {};
        return `<tr>
          <td>${log.date}</td>
          <td><span class="code">${creative?.code || "-"}</span></td>
          <td>${creative?.name || "-"}</td>
          <td>${rel.agent?.name || "-"}</td>
          <td>${money(log.spend)}</td>
          <td>${log.messages || 0}</td>
          <td>${log.notes || ""}</td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="7" class="empty">No daily logs yet.</td></tr>`;
}

function render() {
  document.querySelectorAll("select[data-options]").forEach(fillSelect);
  hydrateFilters();
  document.getElementById("authWarning").classList.toggle("hidden", authEnabled);
  const rows = computeRows();
  renderKpis(rows);
  renderScoreRows(rows);
  renderAgentScore();
  renderCodeCards();
  renderLeadRows();
  renderLogRows();
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const create = form.dataset.create;
  try {
    if (create) {
      await api(`/api/${create}`, { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset();
      toast("Saved");
      await load();
      return;
    }
    if (form.id === "leadForm") {
      await api("/api/leads", { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset();
      toast("Lead added");
      await load();
    }
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const tab = event.target.closest(".tab");
  if (tab) {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  }

  const copyId = event.target.dataset.copy;
  if (copyId) {
    const creative = byId(state.creatives, copyId);
    await navigator.clipboard.writeText(welcomeMessage(creative));
    toast("Welcome message copied");
  }

  const leadId = event.target.dataset.saveLead;
  if (leadId) {
    const row = document.querySelector(`tr[data-lead="${leadId}"]`);
    const payload = {};
    row.querySelectorAll("[data-field]").forEach((input) => {
      payload[input.dataset.field] = input.value;
    });
    if (payload.stage === "registered" && !payload.registeredAt) {
      payload.registeredAt = new Date().toISOString();
    }
    try {
      await api(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast("Lead updated");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }
});

["fromDate", "toDate", "programFilter", "agentFilter"].forEach((id) => {
  document.addEventListener("change", (event) => {
    if (event.target.id === id && state) render();
  });
});

document.getElementById("advancedToggle").addEventListener("change", (event) => {
  document.body.classList.toggle("advanced", event.target.checked);
});

document.getElementById("refreshBtn").addEventListener("click", load);

load().catch((error) => toast(error.message));
