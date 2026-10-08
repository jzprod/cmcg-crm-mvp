// Leads: form leads from Google Sheets + WhatsApp leads, distributed to agents,
// with one-tap call / WhatsApp / save contact, RDV scheduling and reminders.
// Uses the globals of app.js (state, api, toast, escapeHtml, currentUser…).

const LEAD_STATUS = {
  new: { label: "Nouveau", tone: "new", hint: "À appeler" },
  no_answer: { label: "Pas de réponse", tone: "warn", hint: "Rappeler" },
  contacted: { label: "Contacté", tone: "info", hint: "En discussion" },
  booked: { label: "RDV fixé", tone: "booked", hint: "Rendez-vous pris" },
  visited: { label: "Venu, pas inscrit", tone: "visited", hint: "A visité le centre" },
  registered: { label: "Inscrit", tone: "good", hint: "Étudiant inscrit" },
  not_interested: { label: "Pas intéressé", tone: "lost", hint: "Perdu" },
  wrong_number: { label: "Faux numéro", tone: "lost", hint: "Numéro invalide" },
};
const LEAD_BOARD = [
  ["new", "Nouveaux", ["new"]],
  ["no_answer", "Pas de réponse", ["no_answer"]],
  ["contacted", "Contactés", ["contacted"]],
  ["booked", "RDV fixés", ["booked"]],
  ["visited", "Venus", ["visited"]],
  ["registered", "Inscrits", ["registered"]],
  ["lost", "Perdus", ["not_interested", "wrong_number"]],
];
const LEAD_UI = {
  view: (() => { try { return localStorage.getItem("cmcg-leads-view") || "today"; } catch { return "today"; } })(),
  agent: "",
  source: "",
  status: "",
  search: "",
  detailId: "",
  settingsOpen: false,
};

function leadsList() { return Array.isArray(state?.crmLeads) ? state.crmLeads : []; }
function leadById(id) { return leadsList().find((lead) => lead.id === id) || null; }
function leadIsAdmin() { return currentUser?.role !== "sales"; }
function leadTodayKey(offset = 0) { return dateInputValue(addDays(new Date(), offset)); }
function leadDayOf(value) { return value ? dateInputValue(new Date(value)) : ""; }
function leadInitials(name) { return (String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "?").toUpperCase(); }
function leadAgentName(agentId) { return byId(state.agents, agentId)?.name || ""; }
function leadAgentColor(agentId) { return agentId ? abColor(agentId) : "#94a3b8"; }
function leadPhoneLabel(phone) {
  const digits = String(phone || "");
  if (digits.startsWith("212") && digits.length === 12) return `0${digits.slice(3, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  return digits ? `+${digits}` : "Pas de numéro";
}
function leadAge(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} j`;
}
function leadTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function leadDateLabel(value) {
  if (!value) return "";
  const day = leadDayOf(value);
  const label = day === leadTodayKey() ? "Aujourd'hui" : day === leadTodayKey(1) ? "Demain" : day === leadTodayKey(-1) ? "Hier"
    : new Date(value).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return `${label} · ${leadTime(value)}`;
}
function leadSourceLabel(lead) {
  const ad = byId(state.creatives, lead.creativeId);
  const adSet = byId(state.adSets, lead.adSetId);
  const where = ad?.name || adSet?.name || lead.meta?.adName || lead.meta?.formName || "";
  return { channel: lead.source === "form" ? "Formulaire" : "WhatsApp", where };
}
// {name} {fullname} {agent} {day} {time}
function leadFillTemplate(template, lead) {
  const at = lead.appointmentAt ? new Date(lead.appointmentAt) : null;
  const values = {
    name: String(lead.name || "").trim().split(/\s+/)[0] || "",
    fullname: lead.name || "",
    agent: leadAgentName(lead.agentId) || currentUser?.agentName || "",
    day: at ? at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "",
    time: at ? leadTime(lead.appointmentAt) : "",
  };
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match)).replace(/\s+/g, " ").trim();
}
function leadTemplates() { return state.settings?.leadDistribution?.templates || {}; }
function leadWhatsAppUrl(lead, kind) {
  const text = leadFillTemplate(kind === "reminder" ? leadTemplates().reminder : leadTemplates().first, lead);
  return `https://wa.me/${encodeURIComponent(lead.phone || "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
function leadNeedsReminder(lead) {
  return lead.status === "booked" && lead.appointmentAt && [leadTodayKey(), leadTodayKey(1)].includes(leadDayOf(lead.appointmentAt));
}
function leadUrgency(lead) {
  if (lead.status !== "new") return "";
  const minutes = (Date.now() - new Date(lead.createdAt).getTime()) / 60000;
  return minutes > 120 ? "late" : minutes > 15 ? "soon" : "fresh";
}

function leadsVisible() {
  const query = LEAD_UI.search.trim().toLocaleLowerCase();
  return leadsList().filter((lead) => {
    if (LEAD_UI.agent === "__none" ? lead.agentId : LEAD_UI.agent && lead.agentId !== LEAD_UI.agent) return false;
    if (LEAD_UI.source && lead.source !== LEAD_UI.source) return false;
    if (LEAD_UI.status && lead.status !== LEAD_UI.status) return false;
    if (query) {
      const text = [lead.name, lead.phone, leadPhoneLabel(lead.phone), lead.email, lead.notes, lead.meta?.adName, lead.meta?.formName].join(" ").toLocaleLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

// ---------- Rendering ----------
function leadActionsHtml(lead, { compact = false } = {}) {
  const reminder = leadNeedsReminder(lead);
  const phone = lead.phone ? `+${lead.phone}` : "";
  return `<div class="lead-actions${compact ? " is-compact" : ""}">
    <a class="lead-act lead-call" href="tel:${escapeHtml(phone)}" data-lead-contact="${escapeHtml(lead.id)}" data-kind="call" title="Appeler"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1L6.6 10.8Z"/></svg><span>Appeler</span></a>
    <a class="lead-act lead-wa" href="${escapeHtml(leadWhatsAppUrl(lead, reminder ? "reminder" : "first"))}" target="_blank" rel="noopener" data-lead-contact="${escapeHtml(lead.id)}" data-kind="${reminder ? "reminder" : "whatsapp"}" title="${reminder ? "Envoyer le rappel du RDV" : "Écrire sur WhatsApp"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47a.9.9 0 0 0-.66.31 2.77 2.77 0 0 0-.86 2.06 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.2 3.7c1.56.68 2.17.73 2.95.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg><span>${reminder ? "Rappel" : "WhatsApp"}</span></a>
    <a class="lead-act lead-save" href="/api/crm-leads/${encodeURIComponent(lead.id)}/vcard" title="Enregistrer le contact"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6Zm9 4c-2.7 0-8 1.34-8 4v2h16v-2c0-2.66-5.3-4-8-4Z"/></svg><span>Contact</span></a>
  </div>`;
}

function leadCardHtml(lead, { showRdv = true } = {}) {
  const status = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
  const source = leadSourceLabel(lead);
  const urgency = leadUrgency(lead);
  const agentName = leadAgentName(lead.agentId);
  const reminded = lead.remindedAt && leadNeedsReminder(lead);
  return `<article class="lead-card${urgency ? ` is-${urgency}` : ""}" data-lead-open="${escapeHtml(lead.id)}" tabindex="0" aria-label="${escapeHtml(lead.name || leadPhoneLabel(lead.phone))}">
    <header class="lead-card-head">
      <span class="lead-avatar" style="--agent:${leadAgentColor(lead.agentId)}" title="${escapeHtml(agentName || "Non assigné")}">${escapeHtml(leadInitials(lead.name))}</span>
      <div class="lead-who"><strong>${escapeHtml(lead.name || "Sans nom")}</strong><span class="lead-phone">${escapeHtml(leadPhoneLabel(lead.phone))}</span></div>
      <span class="lead-status lead-${status.tone}">${escapeHtml(status.label)}</span>
    </header>
    <div class="lead-meta">
      <span class="lead-chip lead-src-${lead.source}">${escapeHtml(source.channel)}</span>
      ${source.where ? `<span class="lead-where" title="${escapeHtml(source.where)}">${escapeHtml(source.where)}</span>` : ""}
      <span class="lead-age${urgency ? ` is-${urgency}` : ""}" title="${escapeHtml(new Date(lead.createdAt).toLocaleString("fr-FR"))}">${urgency === "late" ? "⚠ " : ""}il y a ${escapeHtml(leadAge(lead.createdAt))}</span>
      ${leadIsAdmin() ? `<span class="lead-agent" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(agentName || "Non assigné")}</span>` : ""}
    </div>
    ${showRdv && lead.appointmentAt ? `<div class="lead-rdv${leadDayOf(lead.appointmentAt) < leadTodayKey() && lead.status === "booked" ? " is-past" : ""}"><span>RDV</span><strong>${escapeHtml(leadDateLabel(lead.appointmentAt))}</strong>${reminded ? '<em>Rappel envoyé ✓</em>' : ""}</div>` : ""}
    ${Number(lead.callAttempts) ? `<small class="lead-attempts">${number(lead.callAttempts)} tentative${lead.callAttempts > 1 ? "s" : ""} d'appel</small>` : ""}
    ${leadActionsHtml(lead, { compact: true })}
  </article>`;
}

function leadSectionHtml(title, hint, leads, empty, options) {
  return `<section class="leads-section"><div class="leads-section-head"><h3>${escapeHtml(title)} <span>${leads.length}</span></h3><small>${escapeHtml(hint)}</small></div>${leads.length ? `<div class="lead-grid">${leads.map((lead) => leadCardHtml(lead, options)).join("")}</div>` : `<p class="leads-empty">${escapeHtml(empty)}</p>`}</section>`;
}

function leadsTodayHtml(leads) {
  const today = leadTodayKey();
  const tomorrow = leadTodayKey(1);
  const byRdv = (a, b) => String(a.appointmentAt).localeCompare(String(b.appointmentAt));
  const rdvToday = leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === today).sort(byRdv);
  const fresh = leads.filter((lead) => lead.status === "new").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const callBack = leads.filter((lead) => lead.status === "no_answer").sort((a, b) => Number(a.callAttempts || 0) - Number(b.callAttempts || 0));
  const rdvTomorrow = leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === tomorrow).sort(byRdv);
  const missed = leads.filter((lead) => lead.status === "booked" && lead.appointmentAt && leadDayOf(lead.appointmentAt) < today).sort(byRdv);
  return [
    leadSectionHtml("RDV aujourd'hui", "Appelez ou envoyez le rappel WhatsApp, puis marquez Venu ou Inscrit.", rdvToday, "Aucun rendez-vous aujourd'hui."),
    leadSectionHtml("Nouveaux leads à appeler", "Les plus anciens d'abord. Un lead appelé dans les 15 minutes répond beaucoup plus souvent.", fresh, "Tous les nouveaux leads ont été traités."),
    leadSectionHtml("À rappeler", "Pas de réponse au premier appel.", callBack, "Personne à rappeler."),
    leadSectionHtml("RDV demain", "Envoyez le rappel WhatsApp aujourd'hui.", rdvTomorrow, "Aucun rendez-vous demain."),
    missed.length ? leadSectionHtml("RDV passés sans suite", "Le rendez-vous est passé : marquez Venu, Inscrit, ou fixez un nouveau RDV.", missed, "") : "",
  ].join("");
}

function leadsBoardHtml(leads) {
  return `<div class="lead-board">${LEAD_BOARD.map(([key, title, statuses]) => {
    const column = leads.filter((lead) => statuses.includes(lead.status)).sort((a, b) => String(b.statusAt || b.createdAt).localeCompare(String(a.statusAt || a.createdAt)));
    return `<section class="lead-column lead-col-${key}"><h3>${escapeHtml(title)} <span>${column.length}</span></h3><div class="lead-column-body">${column.slice(0, 60).map((lead) => leadCardHtml(lead)).join("") || '<p class="leads-empty">Vide</p>'}${column.length > 60 ? `<p class="leads-empty">+ ${column.length - 60} autres (utilisez la liste)</p>` : ""}</div></section>`;
  }).join("")}</div>`;
}

function leadsListHtml(leads) {
  const rows = [...leads].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 400).map((lead) => {
    const status = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
    const source = leadSourceLabel(lead);
    return `<tr data-lead-open="${escapeHtml(lead.id)}" class="clickable-row"><td><strong>${escapeHtml(lead.name || "Sans nom")}</strong><small>${escapeHtml(leadPhoneLabel(lead.phone))}</small></td><td><span class="lead-chip lead-src-${lead.source}">${escapeHtml(source.channel)}</span><small>${escapeHtml(source.where)}</small></td><td>${escapeHtml(leadAgentName(lead.agentId) || "Non assigné")}</td><td><span class="lead-status lead-${status.tone}">${escapeHtml(status.label)}</span></td><td>${escapeHtml(lead.appointmentAt ? leadDateLabel(lead.appointmentAt) : "—")}</td><td>${escapeHtml(new Date(lead.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td>${leadActionsHtml(lead, { compact: true })}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="lead-table"><thead><tr><th>Lead</th><th>Source</th><th>Agent</th><th>Statut</th><th>RDV</th><th>Reçu</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Aucun lead pour ces filtres.</td></tr>'}</tbody></table></div>`;
}

function leadsKpisHtml(leads) {
  const today = leadTodayKey();
  const month = today.slice(0, 7);
  const items = [
    ["Nouveaux à appeler", leads.filter((lead) => lead.status === "new").length, "new", "Pas encore contactés"],
    ["RDV aujourd'hui", leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === today).length, "booked", "À confirmer / accueillir"],
    ["RDV demain", leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === leadTodayKey(1)).length, "info", "Rappel à envoyer"],
    ["Leads reçus aujourd'hui", leads.filter((lead) => leadDayOf(lead.createdAt) === today).length, "neutral", "Formulaire + WhatsApp"],
    ["Inscrits ce mois", leads.filter((lead) => lead.status === "registered" && String(lead.registeredAt || "").slice(0, 7) === month).length, "good", "Depuis les leads"],
  ];
  return `<div class="lead-kpis">${items.map(([label, value, tone, hint]) => `<article class="lead-kpi lead-kpi-${tone}"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><small>${escapeHtml(hint)}</small></article>`).join("")}</div>`;
}

function leadsToolbarHtml() {
  const agents = state.agents.filter((agent) => agent.active !== false);
  const views = [["today", "Aujourd'hui"], ["board", "Pipeline"], ["list", "Liste"]];
  return `<div class="leads-toolbar">
    <div class="leads-views" role="tablist">${views.map(([key, label]) => `<button type="button" role="tab" class="${LEAD_UI.view === key ? "active" : ""}" aria-selected="${LEAD_UI.view === key}" data-lead-view="${key}">${label}</button>`).join("")}</div>
    <label class="leads-search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/></svg><input type="search" placeholder="Nom, téléphone, note…" value="${escapeHtml(LEAD_UI.search)}" data-lead-filter="search" aria-label="Rechercher un lead" /></label>
    ${leadIsAdmin() ? `<select data-lead-filter="agent" aria-label="Agent"><option value="">Tous les agents</option>${agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${LEAD_UI.agent === agent.id ? "selected" : ""}>${escapeHtml(agent.name)}</option>`).join("")}<option value="__none" ${LEAD_UI.agent === "__none" ? "selected" : ""}>Non assignés</option></select>` : ""}
    <select data-lead-filter="source" aria-label="Source"><option value="">Toutes les sources</option><option value="form" ${LEAD_UI.source === "form" ? "selected" : ""}>Formulaire</option><option value="whatsapp" ${LEAD_UI.source === "whatsapp" ? "selected" : ""}>WhatsApp</option></select>
    <select data-lead-filter="status" aria-label="Statut"><option value="">Tous les statuts</option>${Object.entries(LEAD_STATUS).map(([key, value]) => `<option value="${key}" ${LEAD_UI.status === key ? "selected" : ""}>${escapeHtml(value.label)}</option>`).join("")}</select>
    <button type="button" class="button primary" data-lead-new>+ Lead WhatsApp</button>
  </div>`;
}

function renderLeads() {
  const root = document.getElementById("leadsRoot");
  if (!root || !state) return;
  const leads = leadsVisible();
  const unassigned = leadsList().filter((lead) => !lead.agentId && !["registered", "not_interested", "wrong_number"].includes(lead.status)).length;
  const body = LEAD_UI.view === "board" ? leadsBoardHtml(leads) : LEAD_UI.view === "list" ? leadsListHtml(leads) : leadsTodayHtml(leads);
  const empty = !leadsList().length
    ? `<div class="leads-onboarding card"><h3>Aucun lead pour l'instant</h3><p>${leadIsAdmin() ? "Connectez la feuille Google « CMCG Leads » dans « Connexion & répartition » ci-dessous : chaque nouveau lead du formulaire Meta arrivera ici et sera attribué automatiquement à un agent." : "Les leads qui vous sont attribués apparaîtront ici."} Vous pouvez aussi ajouter un lead WhatsApp avec le bouton « + Lead WhatsApp ».</p></div>`
    : "";
  root.innerHTML = `${leadsKpisHtml(leadIsAdmin() && !LEAD_UI.agent ? leadsList() : leads)}
    ${leadIsAdmin() && unassigned ? `<div class="leads-alert"><strong>${number(unassigned)} lead${unassigned > 1 ? "s" : ""} sans agent.</strong> <button type="button" class="button secondary" data-lead-redistribute>Répartir maintenant</button></div>` : ""}
    ${leadsToolbarHtml()}
    ${empty}
    <div class="leads-body">${body}</div>
    ${leadIsAdmin() ? `<div id="leadSplitTest">${leadSplitTestHtml()}</div><details class="card leads-settings" ${LEAD_UI.settingsOpen ? "open" : ""} data-lead-settings><summary><strong>Connexion & répartition</strong><small>Google Sheets, répartition entre agents, messages WhatsApp</small></summary>${leadSettingsHtml()}</details>` : ""}`;
  applyLanguage(root);
  if (LEAD_UI.detailId && document.getElementById("leadDialog")?.open) renderLeadDetail();
}

// ---------- Detail dialog ----------
function ensureLeadDialog() {
  let dialog = document.getElementById("leadDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "leadDialog";
  dialog.className = "modal lead-modal";
  document.body.append(dialog);
  dialog.addEventListener("click", handleLeadClick);
  dialog.addEventListener("submit", handleLeadSubmit);
  dialog.addEventListener("close", () => { LEAD_UI.detailId = ""; });
  return dialog;
}

function rdvQuickOptions() {
  const slot = (offset, time) => `${leadTodayKey(offset)}T${time}`;
  return [["Aujourd'hui 17:00", slot(0, "17:00")], ["Demain 10:00", slot(1, "10:00")], ["Demain 15:00", slot(1, "15:00")], ["Après-demain 10:00", slot(2, "10:00")]];
}

function renderLeadDetail() {
  const dialog = ensureLeadDialog();
  const lead = leadById(LEAD_UI.detailId);
  if (!lead) { dialog.close(); return; }
  const status = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
  const ad = byId(state.creatives, lead.creativeId);
  const adSet = byId(state.adSets, lead.adSetId);
  const campaign = byId(state.campaigns, lead.campaignId);
  const answers = Object.entries(lead.answers || {});
  const history = [...(lead.history || [])].reverse().slice(0, 30).map((item) => {
    const parts = [];
    if (item.type === "created") parts.push(`Lead reçu${item.agentId ? ` · attribué à ${leadAgentName(item.agentId)}` : ""}`);
    if (item.type === "reassigned") parts.push(`Réattribué de ${item.from || "personne"} à ${item.to || "personne"}`);
    if (item.status) parts.push(`Statut : ${LEAD_STATUS[item.status.to]?.label || item.status.to}`);
    if (item.appointmentAt) parts.push(item.appointmentAt.to ? `RDV fixé : ${leadDateLabel(item.appointmentAt.to)}` : "RDV retiré");
    if (item.contact) parts.push(item.contact === "call" ? "Appel" : item.contact === "reminder" ? "Rappel WhatsApp" : "Message WhatsApp");
    if (item.reminded) parts.push("Rappel envoyé");
    if (item.notes) parts.push("Note modifiée");
    return `<li><time>${escapeHtml(new Date(item.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</time><span>${escapeHtml(parts.join(" · ") || item.type)}${item.by ? ` <em>par ${escapeHtml(item.by)}</em>` : ""}</span></li>`;
  }).join("");
  const rdvValue = lead.appointmentAt ? String(lead.appointmentAt).slice(0, 16) : "";
  dialog.innerHTML = `<div class="modal-content lead-detail">
    <div class="modal-head"><div class="lead-detail-who"><span class="lead-avatar big" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadInitials(lead.name))}</span><div><p class="section-kicker">${escapeHtml(leadSourceLabel(lead).channel)} · reçu ${escapeHtml(new Date(lead.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))}</p><h2>${escapeHtml(lead.name || "Sans nom")}</h2><p class="lead-phone">${escapeHtml(leadPhoneLabel(lead.phone))}${lead.email ? ` · ${escapeHtml(lead.email)}` : ""}</p></div></div><button class="icon-button" type="button" data-lead-close aria-label="Fermer">×</button></div>
    ${leadActionsHtml(lead)}
    <section class="lead-detail-block"><h3>Statut <span class="lead-status lead-${status.tone}">${escapeHtml(status.label)}</span></h3><div class="lead-status-buttons">${Object.entries(LEAD_STATUS).map(([key, value]) => `<button type="button" class="lead-status-btn lead-${value.tone}${lead.status === key ? " is-current" : ""}" data-lead-status="${key}" aria-pressed="${lead.status === key}">${escapeHtml(value.label)}</button>`).join("")}</div><small class="form-hint">RDV fixé, Venu et Inscrit sont ajoutés automatiquement aux résultats de la publicité${ad ? ` « ${escapeHtml(ad.name)} »` : ""}.</small></section>
    <form class="lead-detail-block" data-lead-rdv-form><h3>Rendez-vous</h3><div class="lead-rdv-quick">${rdvQuickOptions().map(([label, value]) => `<button type="button" class="lead-chip-btn" data-lead-rdv-quick="${value}">${escapeHtml(label)}</button>`).join("")}</div><div class="lead-rdv-row"><input type="datetime-local" name="appointmentAt" value="${escapeHtml(rdvValue)}" aria-label="Date et heure du RDV" /><button class="button primary" type="submit">Enregistrer le RDV</button>${lead.appointmentAt ? '<button class="button secondary" type="button" data-lead-rdv-clear>Retirer</button>' : ""}</div>${lead.appointmentAt ? `<p class="lead-rdv-note">RDV ${escapeHtml(leadDateLabel(lead.appointmentAt))}${lead.remindedAt ? ` · rappel envoyé le ${escapeHtml(new Date(lead.remindedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}` : " · rappel pas encore envoyé"}</p>` : ""}</form>
    <form class="lead-detail-block" data-lead-notes-form><h3>Notes</h3><textarea name="notes" rows="3" placeholder="Formation souhaitée, disponibilité, objections…">${escapeHtml(lead.notes || "")}</textarea><div class="modal-actions"><button class="button secondary" type="submit">Enregistrer la note</button></div></form>
    ${answers.length ? `<section class="lead-detail-block"><h3>Réponses du formulaire</h3><dl class="lead-answers">${answers.map(([question, answer]) => `<div><dt>${escapeHtml(question)}</dt><dd>${escapeHtml(answer)}</dd></div>`).join("")}</dl></section>` : ""}
    <section class="lead-detail-block"><h3>Origine</h3><dl class="lead-answers"><div><dt>Publicité</dt><dd>${escapeHtml(ad?.name || lead.meta?.adName || "—")}</dd></div><div><dt>Ensemble de publicités</dt><dd>${escapeHtml(adSet?.name || lead.meta?.adSetName || "—")}</dd></div><div><dt>Campagne</dt><dd>${escapeHtml(campaign?.name || lead.meta?.campaignName || "—")}</dd></div>${lead.meta?.formName ? `<div><dt>Formulaire</dt><dd>${escapeHtml(lead.meta.formName)}</dd></div>` : ""}</dl>${leadIsAdmin() ? `<label class="lead-reassign"><span>Agent</span><select data-lead-reassign="${escapeHtml(lead.id)}"><option value="">Non assigné</option>${state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${lead.agentId === agent.id ? "selected" : ""}>${escapeHtml(agent.name)}</option>`).join("")}</select></label>` : ""}</section>
    ${history ? `<section class="lead-detail-block"><h3>Historique</h3><ol class="lead-history">${history}</ol></section>` : ""}
    ${leadIsAdmin() ? `<div class="modal-actions"><button class="button danger" type="button" data-lead-delete>Supprimer le lead</button></div>` : ""}
  </div>`;
  applyLanguage(dialog);
}

function openLeadDetail(id) {
  LEAD_UI.detailId = id;
  renderLeadDetail();
  const dialog = ensureLeadDialog();
  if (!dialog.open) dialog.showModal();
}

function openNewLeadForm() {
  const dialog = ensureLeadDialog();
  LEAD_UI.detailId = "";
  const agents = state.agents.filter((agent) => agent.active !== false);
  const adSets = state.adSets.filter((adSet) => adSet.metaAdSetId).sort((a, b) => a.name.localeCompare(b.name));
  dialog.innerHTML = `<form class="modal-content" data-lead-new-form><div class="modal-head"><div><p class="section-kicker">WhatsApp</p><h2>Ajouter un lead</h2><p>Pour les personnes qui écrivent sur WhatsApp. Les leads du formulaire arrivent tout seuls.</p></div><button class="icon-button" type="button" data-lead-close aria-label="Fermer">×</button></div>
    <div class="form-grid"><label><span>Nom</span><input name="name" autocomplete="off" placeholder="Nom complet" /></label><label><span>Téléphone</span><input name="phone" inputmode="tel" required placeholder="06 12 34 56 78" /></label>
    ${leadIsAdmin() ? `<label><span>Agent</span><select name="agentId"><option value="">Non assigné</option>${agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")}</select></label>` : ""}
    <label><span>Ensemble de publicités <em>optionnel</em></span><select name="adSetId"><option value="">Inconnu</option>${adSets.map((adSet) => `<option value="${escapeHtml(adSet.id)}">${escapeHtml(adSet.name)}</option>`).join("")}</select></label>
    <label><span>Statut</span><select name="status">${Object.entries(LEAD_STATUS).map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)}</option>`).join("")}</select></label>
    <label class="span-2"><span>Notes <em>optionnel</em></span><input name="notes" autocomplete="off" /></label></div>
    <div class="modal-actions"><button class="button secondary" type="button" data-lead-close>Annuler</button><button class="button primary" type="submit">Ajouter le lead</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}

// ---------- Admin: Google Sheets, distribution, templates ----------
function leadAppsScript(url) {
  return `// CMCG CRM · envoie les nouveaux leads de cette feuille au CRM.
// 1) Extensions > Apps Script, collez ce code, Enregistrer.
// 2) Choisissez la fonction "installer" puis Exécuter (autorisez l'accès).
const CRM_URL = "${url}";

function envoyerNouveauxLeads() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return;
  const headers = values[0];
  const props = PropertiesService.getScriptProperties();
  const sent = Number(props.getProperty("dernierLigne") || 1);
  const rows = values.slice(sent).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  if (!rows.length) return;
  const res = UrlFetchApp.fetch(CRM_URL, { method: "post", contentType: "application/json", payload: JSON.stringify({ rows }), muteHttpExceptions: true });
  if (res.getResponseCode() === 200) props.setProperty("dernierLigne", String(values.length));
  else console.log(res.getResponseCode() + " " + res.getContentText());
}

// Renvoie toute la feuille (sans doublons côté CRM).
function renvoyerTout() {
  PropertiesService.getScriptProperties().deleteProperty("dernierLigne");
  envoyerNouveauxLeads();
}

// Vérifie la feuille chaque minute.
function installer() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("envoyerNouveauxLeads").timeBased().everyMinutes(1).create();
  renvoyerTout();
}`;
}

function leadSettingsHtml() {
  const distribution = state.settings?.leadDistribution || { mode: "balanced", agents: {}, templates: {} };
  const token = state.settings?.leadIntake?.token || "";
  const url = token ? `${window.location.origin}/api/lead-intake?token=${token}` : "";
  const since = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const modes = [
    ["balanced", "Équitable", "Chaque nouveau lead va à l'agent qui en a reçu le moins aujourd'hui."],
    ["weighted", "Par pourcentage", "Selon le poids de chaque agent (ex. 2 = deux fois plus de leads)."],
    ["adset", "Agent de l'ensemble de pub", "L'agent nommé dans l'ensemble de publicités ; sinon équitable."],
    ["manual", "Manuel", "Les leads arrivent sans agent ; vous les attribuez vous-même."],
  ];
  const agentRows = state.agents.filter((agent) => agent.active !== false).map((agent) => {
    const setting = distribution.agents?.[agent.id] || { active: true, weight: 1 };
    const count = (days) => leadsList().filter((lead) => lead.agentId === agent.id && lead.source === "form" && (lead.assignedAt || lead.createdAt) >= since(days)).length;
    return `<tr><td><span class="lead-agent" style="--agent:${leadAgentColor(agent.id)}">${escapeHtml(agent.name)}</span></td><td><label class="lead-switch"><input type="checkbox" name="active:${escapeHtml(agent.id)}" ${setting.active !== false ? "checked" : ""} /><span>Reçoit des leads</span></label></td><td><input type="number" min="0" step="0.5" name="weight:${escapeHtml(agent.id)}" value="${setting.weight ?? 1}" aria-label="Poids ${escapeHtml(agent.name)}" class="lead-weight" /></td><td class="number-cell">${number(count(1))}</td><td class="number-cell">${number(count(7))}</td></tr>`;
  }).join("");
  return `<div class="leads-settings-grid">
    <section class="lead-setting-block"><h3>1 · Connecter la feuille Google « CMCG Leads »</h3>
      <ol class="lead-steps"><li>Générez le lien privé ci-dessous (à garder secret).</li><li>Dans la feuille : <strong>Extensions → Apps Script</strong>, collez le code, enregistrez.</li><li>Choisissez la fonction <strong>installer</strong> puis <strong>Exécuter</strong> et autorisez. Les leads arrivent ensuite chaque minute, déjà attribués.</li></ol>
      ${url ? `<label class="lead-copy"><span>Lien de réception</span><input readonly value="${escapeHtml(url)}" /><button type="button" class="button secondary" data-lead-copy="${escapeHtml(url)}">Copier</button></label>
      <details class="lead-script"><summary>Voir le code Apps Script</summary><pre>${escapeHtml(leadAppsScript(url))}</pre><button type="button" class="button primary" data-lead-copy-script>Copier le code</button></details>` : ""}
      <div class="modal-actions lead-left"><button type="button" class="button ${url ? "secondary" : "primary"}" data-lead-token>${url ? "Changer le lien" : "Générer le lien de réception"}</button><label class="button secondary file-button">Importer un CSV<input type="file" accept=".csv,text/csv" data-lead-csv /></label></div>
    </section>
    <form class="lead-setting-block" data-lead-distribution-form><h3>2 · Répartition entre agents</h3>
      <div class="lead-modes">${modes.map(([key, label, hint]) => `<label class="lead-mode${distribution.mode === key ? " is-active" : ""}"><input type="radio" name="mode" value="${key}" ${distribution.mode === key ? "checked" : ""} /><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></label>`).join("")}</div>
      <div class="table-wrap flat"><table><thead><tr><th>Agent</th><th>Actif</th><th>Poids</th><th>Aujourd'hui</th><th>7 jours</th></tr></thead><tbody>${agentRows || '<tr><td colspan="5" class="empty">Ajoutez des agents dans l\'onglet Agents.</td></tr>'}</tbody></table></div>
      <div class="modal-actions lead-left"><button type="submit" class="button primary">Enregistrer la répartition</button></div>
    </form>
    <form class="lead-setting-block" data-lead-templates-form><h3>3 · Messages WhatsApp</h3>
      <p class="form-hint">Variables : {name} prénom, {agent} agent, {day} jour du RDV, {time} heure du RDV.</p>
      <label><span>Premier message</span><textarea name="first" rows="3">${escapeHtml(distribution.templates?.first || "")}</textarea></label>
      <label><span>Rappel de RDV</span><textarea name="reminder" rows="3">${escapeHtml(distribution.templates?.reminder || "")}</textarea></label>
      <div class="modal-actions lead-left"><button type="submit" class="button primary">Enregistrer les messages</button></div>
    </form>
  </div>`;
}

// ---------- Split test: WhatsApp vs lead form ----------
function leadAutoChannel(campaign) {
  if (leadsList().some((lead) => lead.source === "form" && lead.campaignId === campaign.id)) return "form";
  return /lead/i.test(campaign.objective || "") ? "form" : "whatsapp";
}
function leadChannelOf(campaign) {
  if (!campaign) return "";
  return state.settings?.channelOverrides?.[campaign.id] || leadAutoChannel(campaign);
}

function leadSplitData() {
  const blank = () => ({ spend: 0, contacts: 0, booked: 0, showed: 0, registered: 0, campaigns: new Set() });
  const sides = { whatsapp: blank(), form: blank() };
  filteredLogs().forEach((log) => {
    const campaign = relationForLog(log).campaign;
    const side = sides[leadChannelOf(campaign)];
    if (!side) return;
    side.spend += Number(log.spend || 0);
    side.campaigns.add(campaign.id);
    if (side === sides.whatsapp) side.contacts += Number(log.messages || 0);
  });
  leadsList().filter((lead) => lead.source === "form" && overlapsRange(dateOnly(lead.createdAt), dateOnly(lead.createdAt))).forEach((lead) => {
    const campaign = byId(state.campaigns, lead.campaignId);
    const channel = campaign ? leadChannelOf(campaign) : "form";
    if (channel === "form") sides.form.contacts += 1;
  });
  filteredOutcomes().forEach((outcome) => {
    const side = sides[leadChannelOf(relationForOutcome(outcome).campaign)];
    if (side && side[outcome.type] !== undefined) side[outcome.type] += 1;
  });
  return sides;
}

function leadSplitTestHtml() {
  const sides = leadSplitData();
  if (!sides.form.spend && !sides.form.contacts) {
    return `<section class="card lead-split"><div class="lead-split-head"><div><p class="section-kicker">Test A/B</p><h3>WhatsApp vs formulaire</h3></div></div><p class="leads-empty">Le comparatif apparaîtra dès que la campagne de formulaire aura des dépenses ou des leads dans la période choisie en haut.</p></section>`;
  }
  const per = (spend, count) => (count ? spend / count : null);
  const rate = (a, b) => (b ? a / b : null);
  const rows = [
    ["Dépense", (s) => s.spend, "money", null],
    ["Contacts (messages / leads)", (s) => s.contacts, "count", "high"],
    ["Coût par contact", (s) => per(s.spend, s.contacts), "money", "low"],
    ["RDV", (s) => s.booked, "count", "high"],
    ["Contact → RDV", (s) => rate(s.booked, s.contacts), "pct", "high"],
    ["Coût par RDV", (s) => per(s.spend, s.booked), "money", "low"],
    ["Visites", (s) => s.showed + s.registered, "count", "high"],
    ["Inscrits", (s) => s.registered, "count", "high"],
    ["RDV → inscrit", (s) => rate(s.registered, s.booked), "pct", "high"],
    ["Coût par inscrit", (s) => per(s.spend, s.registered), "money", "low"],
    ["Profit estimé", (s) => revenueEstimate(s.registered, s.spend).profit, "dh", "high"],
  ];
  const format = (value, kind) => value === null || value === undefined ? "—" : kind === "money" ? money(value) : kind === "pct" ? `${number(value * 100)}%` : kind === "dh" ? revenueMoney(value) : number(value);
  const winsCount = { whatsapp: 0, form: 0 };
  const body = rows.map(([label, get, kind, better]) => {
    const a = get(sides.whatsapp);
    const b = get(sides.form);
    let winner = "";
    if (better && a !== null && b !== null && a !== b) winner = (better === "low" ? a < b : a > b) ? "whatsapp" : "form";
    if (winner && ["Coût par inscrit", "Coût par RDV", "RDV → inscrit", "Profit estimé"].includes(label)) winsCount[winner] += 1;
    return `<tr><th>${escapeHtml(label)}</th><td class="${winner === "whatsapp" ? "is-win" : ""}">${escapeHtml(format(a, kind))}</td><td class="${winner === "form" ? "is-win" : ""}">${escapeHtml(format(b, kind))}</td></tr>`;
  }).join("");
  const enough = sides.whatsapp.registered >= 5 && sides.form.registered >= 5;
  const verdict = !enough
    ? `Trop tôt pour conclure : visez au moins 5 inscrits de chaque côté (actuellement ${sides.whatsapp.registered} WhatsApp, ${sides.form.registered} formulaire). Regardez d'abord le coût par RDV.`
    : winsCount.whatsapp === winsCount.form ? "Égalité sur les indicateurs clés." : `${winsCount.whatsapp > winsCount.form ? "WhatsApp" : "Le formulaire"} gagne sur ${Math.max(winsCount.whatsapp, winsCount.form)} des 4 indicateurs clés (coût par RDV, coût par inscrit, RDV → inscrit, profit).`;
  const campaigns = state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name));
  return `<section class="card lead-split"><div class="lead-split-head"><div><p class="section-kicker">Test A/B · période en haut de page</p><h3>WhatsApp vs formulaire</h3></div><p class="lead-split-verdict${enough ? " is-ready" : ""}">${escapeHtml(verdict)}</p></div>
    <div class="table-wrap flat"><table class="lead-split-table"><thead><tr><th></th><th><span class="lead-chip lead-src-whatsapp">WhatsApp</span></th><th><span class="lead-chip lead-src-form">Formulaire</span></th></tr></thead><tbody>${body}</tbody></table></div>
    <details class="lead-channels"><summary>Quelle campagne est dans quel groupe ?</summary><div class="lead-channel-list">${campaigns.map((campaign) => `<label><span>${escapeHtml(campaign.name)}</span><select data-lead-channel="${escapeHtml(campaign.id)}"><option value="">Auto (${leadAutoChannel(campaign) === "form" ? "formulaire" : "WhatsApp"})</option><option value="whatsapp" ${state.settings?.channelOverrides?.[campaign.id] === "whatsapp" ? "selected" : ""}>WhatsApp</option><option value="form" ${state.settings?.channelOverrides?.[campaign.id] === "form" ? "selected" : ""}>Formulaire</option><option value="exclude" ${state.settings?.channelOverrides?.[campaign.id] === "exclude" ? "selected" : ""}>Exclure du test</option></select></label>`).join("")}</div></details>
  </section>`;
}

// ---------- Events ----------
async function leadSave(id, body, message) {
  const updated = await api(`/api/crm-leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
  const index = state.crmLeads.findIndex((lead) => lead.id === id);
  if (index >= 0) state.crmLeads[index] = updated;
  if (message) toast(message);
  // Status and RDV changes also add or remove CRM outcomes: reload so every screen agrees.
  if (body.status !== undefined || body.appointmentAt !== undefined || body.agentId !== undefined) await load();
  else renderLeads();
  if (LEAD_UI.detailId === id && document.getElementById("leadDialog")?.open) renderLeadDetail();
  return updated;
}

async function handleLeadClick(event) {
  const target = event.target;
  const contact = target.closest("[data-lead-contact]");
  if (contact) {
    // Let the link open the phone / WhatsApp, and log the attempt in the background.
    const kind = contact.dataset.kind;
    const body = kind === "reminder" ? { contacted: "reminder", reminded: true } : { contacted: kind === "call" ? "call" : "whatsapp" };
    const lead = leadById(contact.dataset.leadContact);
    if (lead && kind !== "reminder" && lead.status === "new") body.status = "contacted";
    api(`/api/crm-leads/${encodeURIComponent(contact.dataset.leadContact)}`, { method: "PATCH", body: JSON.stringify(body) })
      .then((updated) => {
        const index = state.crmLeads.findIndex((item) => item.id === updated.id);
        if (index >= 0) state.crmLeads[index] = updated;
        renderLeads();
        if (LEAD_UI.detailId === updated.id && document.getElementById("leadDialog")?.open) renderLeadDetail();
      })
      .catch(() => {});
    event.stopPropagation();
    return;
  }
  if (target.closest(".lead-actions a")) { event.stopPropagation(); return; }
  if (target.closest("[data-lead-close]")) { document.getElementById("leadDialog")?.close(); return; }
  const view = target.closest("[data-lead-view]");
  if (view) {
    LEAD_UI.view = view.dataset.leadView;
    try { localStorage.setItem("cmcg-leads-view", LEAD_UI.view); } catch {}
    renderLeads();
    return;
  }
  if (target.closest("[data-lead-new]")) { openNewLeadForm(); return; }
  const status = target.closest("[data-lead-status]");
  if (status && LEAD_UI.detailId) {
    try { await leadSave(LEAD_UI.detailId, { status: status.dataset.leadStatus }, `Statut : ${LEAD_STATUS[status.dataset.leadStatus].label}`); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const quick = target.closest("[data-lead-rdv-quick]");
  if (quick) {
    const input = quick.closest("form")?.querySelector('[name="appointmentAt"]');
    if (input) input.value = quick.dataset.leadRdvQuick;
    return;
  }
  if (target.closest("[data-lead-rdv-clear]") && LEAD_UI.detailId) {
    try { await leadSave(LEAD_UI.detailId, { appointmentAt: "" }, "RDV retiré"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-lead-delete]") && LEAD_UI.detailId) {
    const lead = leadById(LEAD_UI.detailId);
    if (!lead || !window.confirm(`Supprimer définitivement le lead ${lead.name || leadPhoneLabel(lead.phone)} ?`)) return;
    try {
      await api(`/api/crm-leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      document.getElementById("leadDialog")?.close();
      toast("Lead supprimé");
      await load();
    } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-lead-redistribute]")) {
    try { const result = await api("/api/crm-leads/redistribute", { method: "POST", body: "{}" }); toast(`${result.assigned} lead(s) attribué(s)`); await load(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-lead-token]")) {
    if (state.settings?.leadIntake?.token && !window.confirm("Changer le lien ? Le script déjà installé dans la feuille devra être mis à jour avec le nouveau lien.")) return;
    try { await api("/api/lead-intake/token", { method: "POST", body: "{}" }); LEAD_UI.settingsOpen = true; await load(); toast("Lien de réception prêt"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const copy = target.closest("[data-lead-copy], [data-lead-copy-script]");
  if (copy) {
    const token = state.settings?.leadIntake?.token || "";
    const text = copy.dataset.leadCopy || leadAppsScript(`${window.location.origin}/api/lead-intake?token=${token}`);
    try { await navigator.clipboard.writeText(text); toast("Copié"); } catch { toast("Sélectionnez le texte et copiez-le à la main", "error"); }
    return;
  }
  const settings = target.closest("[data-lead-settings] > summary");
  if (settings) { LEAD_UI.settingsOpen = !settings.parentElement.open; return; }
  const card = target.closest("[data-lead-open]");
  if (card) openLeadDetail(card.dataset.leadOpen);
}

async function handleLeadChange(event) {
  const target = event.target;
  const filter = target.closest("[data-lead-filter]");
  if (filter && filter.dataset.leadFilter !== "search") { LEAD_UI[filter.dataset.leadFilter] = filter.value; renderLeads(); return; }
  if (target.matches("[data-lead-reassign]")) {
    try { await leadSave(target.dataset.leadReassign, { agentId: target.value }, "Lead réattribué"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.matches("[data-lead-channel]")) {
    try { await api("/api/settings/channels", { method: "POST", body: JSON.stringify({ campaignId: target.dataset.leadChannel, channel: target.value }) }); await load(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.matches("[data-lead-csv]") && target.files?.[0]) {
    try {
      const csv = await target.files[0].text();
      const result = await api("/api/crm-leads/import", { method: "POST", body: JSON.stringify({ csv }) });
      toast(`${result.added} nouveau(x) lead(s), ${result.updated} déjà présent(s)${result.test ? `, ${result.test} lead(s) de test ignoré(s)` : ""}`);
      await load();
    } catch (error) { toast(error.message, "error"); }
    target.value = "";
    return;
  }
  if (target.matches('[data-lead-distribution-form] [name="mode"]')) {
    target.closest("form").querySelectorAll(".lead-mode").forEach((item) => item.classList.toggle("is-active", item.contains(target)));
  }
}

function handleLeadInput(event) {
  const search = event.target.closest('[data-lead-filter="search"]');
  if (!search) return;
  LEAD_UI.search = search.value;
  const position = search.selectionStart;
  renderLeads();
  const again = document.querySelector('#leadsRoot [data-lead-filter="search"]');
  if (again) { again.focus(); again.setSelectionRange(position, position); }
}

async function handleLeadSubmit(event) {
  const form = event.target;
  if (!form.matches("[data-lead-rdv-form], [data-lead-notes-form], [data-lead-new-form], [data-lead-distribution-form], [data-lead-templates-form]")) return;
  event.preventDefault();
  event.stopPropagation(); // keep the app's generic form handler out of it
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (form.matches("[data-lead-rdv-form]")) {
      const value = form.elements.appointmentAt.value;
      if (!value) throw new Error("Choisissez la date et l'heure du RDV");
      await leadSave(LEAD_UI.detailId, { appointmentAt: value }, "RDV enregistré : le lead passe en « RDV fixé »");
    } else if (form.matches("[data-lead-notes-form]")) {
      await leadSave(LEAD_UI.detailId, { notes: form.elements.notes.value }, "Note enregistrée");
    } else if (form.matches("[data-lead-new-form]")) {
      const body = Object.fromEntries(new FormData(form).entries());
      const lead = await api("/api/crm-leads", { method: "POST", body: JSON.stringify({ ...body, source: "whatsapp" }) });
      toast("Lead ajouté");
      await load();
      openLeadDetail(lead.id);
    } else if (form.matches("[data-lead-distribution-form]")) {
      const data = new FormData(form);
      const agents = {};
      state.agents.forEach((agent) => {
        if (!form.querySelector(`[name="weight:${CSS.escape(agent.id)}"]`)) return;
        agents[agent.id] = { active: data.get(`active:${agent.id}`) === "on", weight: Number(data.get(`weight:${agent.id}`) || 0) };
      });
      await api("/api/settings/lead-distribution", { method: "POST", body: JSON.stringify({ mode: data.get("mode"), agents }) });
      LEAD_UI.settingsOpen = true;
      toast("Répartition enregistrée");
      await load();
    } else if (form.matches("[data-lead-templates-form]")) {
      await api("/api/settings/lead-distribution", { method: "POST", body: JSON.stringify({ templates: { first: form.elements.first.value, reminder: form.elements.reminder.value } }) });
      LEAD_UI.settingsOpen = true;
      toast("Messages enregistrés");
      await load();
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

(function bindLeads() {
  const root = document.getElementById("leadsRoot");
  if (!root) return;
  root.addEventListener("click", handleLeadClick);
  root.addEventListener("change", handleLeadChange);
  root.addEventListener("input", handleLeadInput);
  root.addEventListener("submit", handleLeadSubmit);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches(".lead-card")) openLeadDetail(event.target.dataset.leadOpen);
  });
  ensureLeadDialog().addEventListener("change", handleLeadChange);
  // Keep "il y a …" ages and today's lists fresh while the page stays open.
  setInterval(() => { if (document.getElementById("leads")?.classList.contains("active") && !document.getElementById("leadDialog")?.open) renderLeads(); }, 60000);
  if (state) renderLeads();
})();
