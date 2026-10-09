// Leads (الليدز): the sales agents' daily workspace, in Arabic, mobile first.
// Form leads from Google Sheets + WhatsApp leads; call / WhatsApp / save contact
// in one tap; after every call the agent picks the result on big cards; RDVs are
// picked from the centre's opening hours (11:00-20:00). Uses app.js globals.

const LEAD_STATUS = {
  new: { label: "جديدة", icon: "🆕", tone: "new" },
  no_answer: { label: "لم يُجب", icon: "📵", tone: "warn" },
  callback: { label: "إعادة الاتصال", icon: "⏳", tone: "info" },
  contacted: { label: "تواصلنا، يفكّر", icon: "💬", tone: "info" },
  booked: { label: "موعد محجوز", icon: "📅", tone: "booked" },
  visited: { label: "حضر ولم يسجّل", icon: "🚶", tone: "visited" },
  registered: { label: "سجّل", icon: "🎓", tone: "good" },
  not_interested: { label: "غير مهتم", icon: "🙅", tone: "lost" },
  other_city: { label: "مدينة أخرى", icon: "🏙️", tone: "lost" },
  not_qualified: { label: "غير مؤهل", icon: "🚫", tone: "lost" },
  wrong_number: { label: "رقم خاطئ", icon: "❌", tone: "lost" },
};
// Big cards shown after every call, most common first.
const CALL_RESULTS = [
  ["booked", "حجز موعد", "حدّدي اليوم والساعة"],
  ["no_answer", "لم يُجب", "سنعاود الاتصال"],
  ["callback", "إعادة الاتصال", "طلب الاتصال لاحقاً"],
  ["contacted", "تواصلنا، يفكّر", "مهتم ولم يقرّر بعد"],
  ["not_interested", "غير مهتم", "لا يرغب في التكوين"],
  ["other_city", "مدينة أخرى", "يقيم خارج طنجة"],
  ["not_qualified", "غير مؤهل", "المستوى أو الشروط غير مناسبة"],
  ["wrong_number", "رقم خاطئ", "الرقم ليس له"],
];
const LEAD_BOARD = [
  ["new", "جديدة", ["new"]],
  ["follow", "متابعة", ["no_answer", "callback", "contacted"]],
  ["booked", "مواعيد", ["booked"]],
  ["visited", "حضروا", ["visited"]],
  ["registered", "سجّلوا", ["registered"]],
  ["lost", "مغلقة", ["not_interested", "other_city", "not_qualified", "wrong_number"]],
];
const OPEN_SLOTS = [
  ["الصباح", ["11:00", "11:30", "12:00", "12:30"]],
  ["بعد الظهر", ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]],
  ["المساء", ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30"]],
];
const CHEERS = ["أحسنتِ! 💪", "رائع! 👏", "استمري هكذا! 🔥", "نتيجة ممتازة ✨", "واصلي! 🚀"];
const AR_LOCALE = "ar-MA-u-nu-latn";
const LEAD_UI = {
  view: (() => { try { return localStorage.getItem("cmcg-leads-view") || "today"; } catch { return "today"; } })(),
  agent: "", source: "", status: "", search: "",
  detailId: "", settingsOpen: false, viewAs: "",
  sheet: null, // { leadId, step: "pick" | "booked" | "callback", pick: {day,time} }
  pick: { day: "", time: "" },
};

// ---------- helpers ----------
const leadsList = () => (Array.isArray(state?.crmLeads) ? state.crmLeads : []);
const leadById = (id) => leadsList().find((lead) => lead.id === id) || null;
const leadIsAdmin = () => currentUser?.role !== "sales";
// Admin can look at an agent's screen ("view as"), read-only.
const leadAdminView = () => leadIsAdmin() && !LEAD_UI.viewAs;
const leadReadOnly = () => leadIsAdmin() && Boolean(LEAD_UI.viewAs);
const leadViewerId = () => (leadIsAdmin() ? LEAD_UI.viewAs : currentUser?.agentId || "");
const leadTodayKey = (offset = 0) => dateInputValue(addDays(new Date(), offset));
const leadDayOf = (value) => (value ? String(value).slice(0, 10) : "");
const leadNowLocal = () => { const d = new Date(); return `${dateInputValue(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function leadAgent(agentId) { return byId(state.agents, agentId); }
function leadAgentName(agentId) {
  const name = leadAgent(agentId)?.name || "";
  return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : "";
}
function leadAgentCode(agent) {
  if (!agent) return "?";
  if (agent.code) return agent.code;
  const letters = String(agent.name || "").replace(/[^A-Za-z؀-ۿ]/g, "");
  return (letters.slice(0, 1) + letters.slice(-1)).toLocaleUpperCase() || "?";
}
function leadAgentSetting(agentId) { return state.settings?.leadDistribution?.agents?.[agentId] || { active: true, weight: 1 }; }
// Agents shown on the Leads screen: active in the CRM and not hidden from Leads.
function leadAgents() { return state.agents.filter((agent) => agent.active !== false && !leadAgentSetting(agent.id).hidden); }
async function saveAgentSetting(agentId, patch, message) {
  const agents = { ...(state.settings?.leadDistribution?.agents || {}) };
  agents[agentId] = { active: true, weight: 1, ...agents[agentId], ...patch };
  await api("/api/settings/lead-distribution", { method: "POST", body: JSON.stringify({ agents }) });
  if (message) toast(message);
  await load();
}
function leadAgentColor(agentId) { return agentId ? abColor(agentId) : "#94a3b8"; }
function leadInitials(name) { return (String(name || "").replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join("") || "؟").toLocaleUpperCase(); }
function leadPhoneLabel(phone) {
  const d = String(phone || "");
  if (d.startsWith("212") && d.length === 12) return `0${d.slice(3, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  return d ? `+${d}` : "بدون رقم";
}
function leadAge(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${minutes} دقيقة`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} ساعة`;
  return `${Math.round(minutes / 1440)} يوم`;
}
function leadTime(value) { return value ? String(value).slice(11, 16) : ""; }
function leadDayName(day) {
  if (day === leadTodayKey()) return "اليوم";
  if (day === leadTodayKey(1)) return "غداً";
  if (day === leadTodayKey(2)) return "بعد غد";
  if (day === leadTodayKey(-1)) return "أمس";
  return new Date(`${day}T12:00:00`).toLocaleDateString(AR_LOCALE, { weekday: "long", day: "numeric", month: "long" });
}
function leadWhen(value) { return value ? `${leadDayName(leadDayOf(value))} · ${leadTime(value)}` : ""; }
function leadSource(lead) {
  const ad = byId(state.creatives, lead.creativeId);
  const adSet = byId(state.adSets, lead.adSetId);
  return { channel: lead.source === "form" ? "استمارة" : "واتساب", where: ad?.name || adSet?.name || lead.meta?.adName || lead.meta?.formName || "" };
}
function leadTemplates() { return state.settings?.leadDistribution?.templates || {}; }
function leadFillTemplate(template, lead) {
  const values = {
    name: String(lead.name || "").trim().split(/\s+/)[0] || "",
    fullname: lead.name || "",
    agent: leadAgentName(lead.agentId) || currentUser?.agentName || "",
    day: lead.appointmentAt ? leadDayName(leadDayOf(lead.appointmentAt)) : "",
    time: leadTime(lead.appointmentAt),
  };
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match)).trim();
}
function leadWhatsAppUrl(lead, kind) {
  const text = leadFillTemplate(kind === "reminder" ? leadTemplates().reminder : leadTemplates().first, lead);
  return `https://wa.me/${encodeURIComponent(lead.phone || "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
// An RDV today or tomorrow whose reminder has not been sent yet.
function leadNeedsReminder(lead) {
  return lead.status === "booked" && lead.appointmentAt && !lead.remindedAt && [leadTodayKey(), leadTodayKey(1)].includes(leadDayOf(lead.appointmentAt));
}
function leadUrgency(lead) {
  if (lead.status !== "new") return "";
  const minutes = (Date.now() - new Date(lead.createdAt).getTime()) / 60000;
  return minutes > 120 ? "late" : minutes > 15 ? "soon" : "fresh";
}
// How hot a new lead still is: call it while it is hot. Only new leads have a heat.
function leadHeat(lead) {
  if (lead.status !== "new") return null;
  const minutes = (Date.now() - new Date(lead.createdAt).getTime()) / 60000;
  if (minutes < 15) return { key: "h3", icon: "🔥🔥🔥", label: "ساخن جداً" };
  if (minutes < 60) return { key: "h2", icon: "🔥🔥", label: "ساخن" };
  if (minutes < 180) return { key: "h1", icon: "🔥", label: "دافئ" };
  if (minutes < 1440) return { key: "cool", icon: "🌤️", label: "بدأ يبرد" };
  return { key: "cold", icon: "🧊", label: "بارد" };
}
function leadCallbackDue(lead) {
  return lead.status === "no_answer" || (lead.status === "callback" && (!lead.callbackAt || lead.callbackAt <= `${leadTodayKey()}T23:59`));
}
function leadsVisible() {
  const query = LEAD_UI.search.trim().toLocaleLowerCase();
  return leadsList().filter((lead) => {
    if (LEAD_UI.viewAs && lead.agentId !== LEAD_UI.viewAs) return false;
    if (LEAD_UI.agent === "__none" ? lead.agentId : LEAD_UI.agent && lead.agentId !== LEAD_UI.agent) return false;
    if (LEAD_UI.source && lead.source !== LEAD_UI.source) return false;
    if (LEAD_UI.status && lead.status !== LEAD_UI.status) return false;
    if (query) {
      const text = [lead.name, lead.phone, leadPhoneLabel(lead.phone), lead.email, lead.notes, lead.meta?.adName].join(" ").toLocaleLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}
const svgIcon = {
  call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1L6.6 10.8Z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47a.9.9 0 0 0-.66.31 2.77 2.77 0 0 0-.86 2.06 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.2 3.7c1.56.68 2.17.73 2.95.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6Zm9 4c-2.7 0-8 1.34-8 4v2h16v-2c0-2.66-5.3-4-8-4Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>',
};

// ---------- pieces ----------
function leadActionsHtml(lead, { big = false } = {}) {
  const reminder = leadNeedsReminder(lead) || (lead.status === "booked" && [leadTodayKey(), leadTodayKey(1)].includes(leadDayOf(lead.appointmentAt)));
  const phone = lead.phone ? `+${lead.phone}` : "";
  return `<div class="la-actions${big ? " is-big" : ""}">
    <a class="la-btn la-call" href="tel:${escapeHtml(phone)}" data-lead-contact="${escapeHtml(lead.id)}" data-kind="call">${svgIcon.call}<span>اتصال</span></a>
    <a class="la-btn la-wa" href="${escapeHtml(leadWhatsAppUrl(lead, reminder ? "reminder" : "first"))}" target="_blank" rel="noopener" data-lead-contact="${escapeHtml(lead.id)}" data-kind="${reminder ? "reminder" : "whatsapp"}">${reminder ? svgIcon.bell : svgIcon.wa}<span>${reminder ? "التذكير" : "واتساب"}</span></a>
    <a class="la-btn la-save" href="/api/crm-leads/${encodeURIComponent(lead.id)}/vcard">${svgIcon.save}<span>حفظ</span></a>
  </div>`;
}

function leadStatusPill(lead) {
  const status = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
  return `<span class="la-pill la-${status.tone}">${status.icon} ${escapeHtml(status.label)}</span>`;
}

function leadCardHtml(lead) {
  const source = leadSource(lead);
  const urgency = leadUrgency(lead);
  const needsReminder = leadNeedsReminder(lead);
  return `<article class="la-card${urgency ? ` is-${urgency}` : ""}${leadHeat(lead) ? ` heat-${leadHeat(lead).key}` : ""}${needsReminder ? " needs-reminder" : ""}" data-lead-open="${escapeHtml(lead.id)}" tabindex="0">
    ${needsReminder ? `<div class="la-remind-flag">⚠️ يجب إرسال رسالة التذكير</div>` : ""}
    <header class="la-card-head">
      <span class="la-avatar" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadInitials(lead.name))}</span>
      <div class="la-who"><strong>${escapeHtml(lead.name || "بدون اسم")}</strong><span class="la-phone" dir="ltr">${escapeHtml(leadPhoneLabel(lead.phone))}</span></div>
      ${leadStatusPill(lead)}
    </header>
    <div class="la-meta">
      ${lead.demo ? '<span class="la-demo">🧪 تجريبي</span>' : ""}<span class="la-src la-src-${lead.source}">${escapeHtml(source.channel)}</span>
      ${source.where ? `<span class="la-where">${escapeHtml(source.where)}</span>` : ""}
      ${leadHeat(lead) ? `<span class="la-heat la-heat-${leadHeat(lead).key}" title="${escapeHtml(leadHeat(lead).label)}"><b>${leadHeat(lead).icon}</b> ${escapeHtml(leadHeat(lead).label)} · ${escapeHtml(leadAge(lead.createdAt))}</span>` : `<span class="la-age">منذ ${escapeHtml(leadAge(lead.createdAt))}</span>`}
      ${leadAdminView() ? `<span class="la-owner" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadAgentCode(leadAgent(lead.agentId)) === "?" ? "بدون مستشارة" : leadAgentName(lead.agentId))}</span>` : ""}
    </div>
    ${lead.status === "booked" && lead.appointmentAt ? `<div class="la-rdv${leadDayOf(lead.appointmentAt) < leadTodayKey() ? " is-past" : ""}">📅 <strong>${escapeHtml(leadWhen(lead.appointmentAt))}</strong>${lead.remindedAt ? '<em>✓ أُرسل التذكير</em>' : ""}</div>` : ""}
    ${lead.status === "callback" && lead.callbackAt ? `<div class="la-rdv is-callback">⏳ أعيدي الاتصال <strong>${escapeHtml(leadWhen(lead.callbackAt))}</strong></div>` : ""}
    ${Number(lead.callAttempts) ? `<small class="la-attempts">📞 ${number(lead.callAttempts)} محاولة اتصال</small>` : ""}
    ${leadActionsHtml(lead)}
  </article>`;
}

// Compact row: who, status/when on one line, call + WhatsApp. Tap the row for details.
function leadRowHtml(lead) {
  const heat = leadHeat(lead);
  const needsReminder = leadNeedsReminder(lead);
  const reminder = needsReminder || (lead.status === "booked" && [leadTodayKey(), leadTodayKey(1)].includes(leadDayOf(lead.appointmentAt)));
  const status = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
  const when = lead.status === "booked" && lead.appointmentAt ? `📅 ${leadWhen(lead.appointmentAt)}`
    : lead.status === "callback" && lead.callbackAt ? `⏳ ${leadWhen(lead.callbackAt)}`
    : heat ? `${heat.icon} منذ ${leadAge(lead.createdAt)}` : `منذ ${leadAge(lead.statusAt || lead.createdAt)}`;
  const phone = lead.phone ? `+${lead.phone}` : "";
  return `<article class="la-item${heat ? ` heat-${heat.key}` : ""}${needsReminder ? " needs-reminder" : ""}">
    <button type="button" class="la-item-main" data-lead-open="${escapeHtml(lead.id)}">
      <span class="la-item-avatar" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadInitials(lead.name))}</span>
      <span class="la-item-text">
        <strong>${lead.demo ? "🧪 " : ""}${escapeHtml(lead.name || leadPhoneLabel(lead.phone))}</strong>
        <span class="la-item-meta">${(lead.status === "booked" && lead.appointmentAt) || (lead.status === "callback" && lead.callbackAt) ? "" : `<i class="la-dot-pill la-${status.tone}">${status.icon} ${escapeHtml(status.label)}</i>`}<em>${escapeHtml(when)}</em>${leadAdminView() && lead.agentId ? `<i class="la-item-owner" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadAgentCode(leadAgent(lead.agentId)))}</i>` : ""}</span>
      </span>
    </button>
    <a class="la-ibtn la-ibtn-wa${reminder ? " is-reminder" : ""}" href="${escapeHtml(leadWhatsAppUrl(lead, reminder ? "reminder" : "first"))}" target="_blank" rel="noopener" data-lead-contact="${escapeHtml(lead.id)}" data-kind="${reminder ? "reminder" : "whatsapp"}" aria-label="${reminder ? "التذكير" : "واتساب"}">${reminder ? svgIcon.bell : svgIcon.wa}</a>
    <a class="la-ibtn la-ibtn-call" href="tel:${escapeHtml(phone)}" data-lead-contact="${escapeHtml(lead.id)}" data-kind="call" aria-label="اتصال">${svgIcon.call}</a>
  </article>`;
}

function leadSection(id, icon, title, hint, leads, empty) {
  if (!leads.length && (!empty || id !== "filter")) return "";
  return `<section class="la-section" id="la-sec-${id}"><div class="la-section-head"><h3><span>${icon}</span> ${escapeHtml(title)} <b>${leads.length}</b></h3>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>${leads.length ? `<div class="la-list">${leads.map(leadRowHtml).join("")}</div>` : `<p class="la-empty">${escapeHtml(empty)}</p>`}</section>`;
}

function leadsTodayHtml(leads) {
  const today = leadTodayKey();
  const byRdv = (a, b) => String(a.appointmentAt).localeCompare(String(b.appointmentAt));
  const rdvToday = leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === today).sort(byRdv);
  const fresh = leads.filter((lead) => lead.status === "new").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const callback = leads.filter(leadCallbackDue).sort((a, b) => String(a.callbackAt || a.statusAt).localeCompare(String(b.callbackAt || b.statusAt)));
  const tomorrow = leads.filter((lead) => lead.status === "booked" && leadDayOf(lead.appointmentAt) === leadTodayKey(1)).sort(byRdv);
  const missed = leads.filter((lead) => lead.status === "booked" && lead.appointmentAt && leadDayOf(lead.appointmentAt) < today).sort(byRdv);
  const thinking = leads.filter((lead) => lead.status === "contacted");
  return [
    leadSection("rdv", "⏰", "مواعيد اليوم", "أرسلي التذكير، ثم غيّري الحالة إلى «حضر» أو «سجّل».", rdvToday, "لا توجد مواعيد اليوم."),
    leadSection("new", "🔥", "رسائل جديدة تنتظر الاتصال", "اتصلي بهم وهم متحمسون: من نتصل به خلال أول 15 دقيقة يجيب أكثر بكثير.", fresh, "أحسنتِ! تم الاتصال بكل الرسائل الجديدة 🎉"),
    leadSection("callback", "📞", "إعادة الاتصال", "لم يُجيبوا، أو طلبوا الاتصال بهم اليوم.", callback, "لا أحد ينتظر إعادة الاتصال."),
    leadSection("tomorrow", "📅", "مواعيد الغد", "أرسلي رسالة التذكير اليوم.", tomorrow, ""),
    leadSection("missed", "❗", "مواعيد فائتة بدون نتيجة", "فات الموعد: هل حضر؟ هل سجّل؟ أم يحتاج موعداً جديداً؟", missed, ""),
    leadSection("thinking", "💭", "يفكّرون", "تواصلتِ معهم ولم يقرّروا بعد. أعيدي التواصل معهم.", thinking, ""),
  ].join("") || '<p class="la-empty">🎉 لا شيء ينتظرك الآن. ستظهر هنا كل رسالة جديدة تلقائياً.</p>';
}

function leadsBoardHtml(leads) {
  const closed = ["registered", "not_interested", "other_city", "not_qualified", "wrong_number"];
  const sorted = [...leads].sort((a, b) => (closed.includes(a.status) - closed.includes(b.status)) || String(b.statusAt || b.createdAt).localeCompare(String(a.statusAt || a.createdAt)));
  return sorted.length ? `<div class="la-list">${sorted.slice(0, 300).map(leadRowHtml).join("")}</div>` : '<p class="la-empty">لا توجد رسائل.</p>';
}

function leadsListHtml(leads) {
  const rows = [...leads].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 400).map((lead) => {
    const source = leadSource(lead);
    return `<tr data-lead-open="${escapeHtml(lead.id)}" class="clickable-row"><td><strong>${escapeHtml(lead.name || "بدون اسم")}</strong><small dir="ltr">${escapeHtml(leadPhoneLabel(lead.phone))}</small></td><td><span class="la-src la-src-${lead.source}">${escapeHtml(source.channel)}</span><small>${escapeHtml(source.where)}</small></td>${leadAdminView() ? `<td>${escapeHtml(leadAgentName(lead.agentId) || "بدون مستشارة")}</td>` : ""}<td>${leadStatusPill(lead)}</td><td>${escapeHtml(lead.appointmentAt ? leadWhen(lead.appointmentAt) : "—")}</td><td>${escapeHtml(leadWhen(dateInputValue(new Date(lead.createdAt)) + "T" + new Date(lead.createdAt).toTimeString().slice(0, 5)))}</td></tr>`;
  }).join("");
  return `<div class="table-wrap la-table-wrap"><table class="la-table"><thead><tr><th>الشخص</th><th>المصدر</th>${leadAdminView() ? "<th>المستشارة</th>" : ""}<th>الحالة</th><th>الموعد</th><th>الوصول</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">لا توجد رسائل بهذه الفلاتر.</td></tr>`}</tbody></table></div>`;
}

// Personal header: greeting, daily goal ring, today's numbers, friendly ranking.
function leadHeroHtml() {
  const stats = Array.isArray(window.leadStats) ? window.leadStats : [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 18 ? "مساء الخير" : "مساء الخير";
  const me = leadAdminView() ? null : leadAgent(leadViewerId());
  const mine = leadsList().filter((lead) => !me || lead.agentId === me.id);
  const myStats = me ? stats.find((row) => row.agentId === me.id) : null;
  const done = me ? Number(myStats?.actionsToday || 0) : stats.reduce((sum, row) => sum + Number(row.actionsToday || 0), 0);
  const todo = mine.filter((lead) => lead.status === "new" || leadCallbackDue(lead) || (lead.status === "booked" && leadDayOf(lead.appointmentAt) === leadTodayKey())).length;
  const goal = Math.max(10, done + todo);
  const progress = Math.min(1, done / goal);
  const message = progress >= 1 ? "أحسنتِ! أكملتِ هدف اليوم 🎉" : progress >= 0.7 ? "اقتربتِ من الهدف، استمري! 🔥" : progress >= 0.35 ? "عمل رائع، واصلي 👏" : done ? "بداية جيدة 💪" : "لنبدأ اليوم بقوة 💪";
  const rdvsToday = me ? Number(myStats?.rdvsToday || 0) : stats.reduce((sum, row) => sum + Number(row.rdvsToday || 0), 0);
  const registered = me ? Number(myStats?.registeredMonth || 0) : stats.reduce((sum, row) => sum + Number(row.registeredMonth || 0), 0);
  const reminders = mine.filter(leadNeedsReminder).length;
  const ring = 2 * Math.PI * 30;
  const ranking = [...stats].sort((a, b) => b.rdvsToday - a.rdvsToday || b.actionsToday - a.actionsToday);
  const medals = ["🥇", "🥈", "🥉"];
  const dateText = new Date().toLocaleDateString(AR_LOCALE, { weekday: "long", day: "numeric", month: "long" });
  const hot = mine.filter((lead) => ["h3", "h2"].includes(leadHeat(lead)?.key)).length;
  const rankName = (row) => leadAgentName(row.agentId) || (row.name ? row.name.charAt(0).toLocaleUpperCase() + row.name.slice(1) : "");
  const rankCode = (row) => row.code || leadAgentCode(leadAgent(row.agentId) || { name: row.name });
  return `<section class="la-hero${progress >= 1 ? " is-done" : ""}">
    <div class="la-hero-top">
      ${me ? `<span class="la-me" style="--agent:${leadAgentColor(me.id)}">${escapeHtml(leadAgentCode(me))}</span>` : `<span class="la-me is-admin">CMCG</span>`}
      <div class="la-hello"><h2>${greeting}${me ? ` ${escapeHtml(leadAgentName(me.id))}` : ""} <span class="la-wave">👋</span></h2><p>${escapeHtml(message)} <small>· ${escapeHtml(dateText)}</small></p></div>
      <div class="la-ring" role="img" aria-label="هدف اليوم ${done} من ${goal}"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="la-ring-bg"/><circle cx="36" cy="36" r="30" class="la-ring-fg" style="stroke-dasharray:${ring};stroke-dashoffset:${ring * (1 - progress)}"/></svg><span><strong>${done}</strong><small>/ ${goal}</small></span></div>
    </div>
    <div class="la-stats">
      <button type="button" class="la-stat la-stat-todo" data-lead-jump="new"><i>📞</i><strong>${number(todo)}</strong><span>تنتظر الاتصال</span></button>
      <button type="button" class="la-stat la-stat-rdv" data-lead-jump="rdv"><i>📅</i><strong>${number(rdvsToday)}</strong><span>مواعيد اليوم</span></button>
      <div class="la-stat la-stat-reg"><i>🎓</i><strong>${number(registered)}</strong><span>تسجيلات الشهر</span></div>
    </div>
    ${leadReadOnly() ? "" : pushBannerHtml()}
    ${ranking.length > 1 ? `<div class="la-rank"><span class="la-rank-title">🏆 اليوم</span>${ranking.map((row, index) => `<span class="la-rank-row${me && row.agentId === me.id ? " is-me" : ""}"><b>${row.rdvsToday || row.actionsToday ? medals[index] || "•" : "•"}</b><i style="--agent:${leadAgentColor(row.agentId)}">${escapeHtml(rankCode(row))}</i>${escapeHtml(rankName(row))}<em>${number(row.rdvsToday)}📅 · ${number(row.actionsToday)}📞</em></span>`).join("")}</div>` : ""}
    ${hot && leadAdminView() ? `<button type="button" class="la-hot-nudge" data-lead-jump="new"><span class="la-flame">🔥</span> لديك ${number(hot)} ${hot === 1 ? "رسالة ساخنة" : "رسائل ساخنة"}، اتصلي بهم الآن قبل أن يبردوا</button>` : ""}
    ${reminders ? `<button type="button" class="la-reminder-alert" data-lead-jump="rdv"><span>⚠️</span><div><strong>${number(reminders)} ${reminders === 1 ? "موعد" : "مواعيد"} بدون رسالة تذكير</strong><small>أرسليها الآن ليحضروا 👇</small></div></button>` : ""}
  </section>`;
}

// Agent screen: the next person to call, always one tap away at the bottom.
function leadNextUp() {
  if (leadAdminView()) return null;
  const mine = leadsList().filter((lead) => lead.agentId === leadViewerId());
  const fresh = mine.filter((lead) => lead.status === "new").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const callback = mine.filter(leadCallbackDue).sort((a, b) => String(a.callbackAt || a.statusAt).localeCompare(String(b.callbackAt || b.statusAt)));
  const queue = [...fresh, ...callback];
  return queue.length ? { lead: queue[0], left: queue.length - 1, kind: fresh.length ? "new" : "callback" } : null;
}
function leadNextBarHtml() {
  const next = leadNextUp();
  if (!next) return "";
  const { lead } = next;
  const heat = leadHeat(lead);
  const phone = lead.phone ? `+${lead.phone}` : "";
  return `<div class="la-next${heat ? ` heat-${heat.key}` : ""}">
    <button type="button" class="la-next-who" data-lead-open="${escapeHtml(lead.id)}">
      <small>${next.kind === "new" ? "🔥 الرسالة التالية" : "⏳ أعيدي الاتصال"}${next.left ? ` · متبقٍّ ${number(next.left)}` : ""}</small>
      <strong>${escapeHtml(lead.name || leadPhoneLabel(lead.phone))}</strong>
      <span>${heat ? `${heat.icon} ` : ""}منذ ${escapeHtml(leadAge(lead.createdAt))}</span>
    </button>
    <a class="la-next-wa" href="${escapeHtml(leadWhatsAppUrl(lead, "first"))}" target="_blank" rel="noopener" data-lead-contact="${escapeHtml(lead.id)}" data-kind="whatsapp" aria-label="واتساب">${svgIcon.wa}</a>
    <a class="la-next-call" href="tel:${escapeHtml(phone)}" data-lead-contact="${escapeHtml(lead.id)}" data-kind="call">${svgIcon.call}<span>اتصلي</span></a>
  </div>`;
}

function leadsToolbarHtml() {
  const views = [["today", "اليوم"], ["board", "كل الرسائل"], ...(leadAdminView() ? [["list", "جدول"]] : [])];
  const agents = leadAgents();
  return `<div class="la-toolbar">
    <div class="la-views" role="tablist">${views.map(([key, label]) => `<button type="button" role="tab" class="${LEAD_UI.view === key ? "active" : ""}" aria-selected="${LEAD_UI.view === key}" data-lead-view="${key}">${label}</button>`).join("")}</div>
    <label class="la-search"><input type="search" placeholder="🔎 ابحثي بالاسم أو الرقم…" value="${escapeHtml(LEAD_UI.search)}" data-lead-filter="search" aria-label="بحث" /></label>
    <button type="button" class="la-add" data-lead-new>＋ رسالة واتساب</button>
    ${leadAdminView() ? `<button type="button" class="la-transfer-btn" data-transfer-from="">🔀 تحويل الرسائل</button>` : ""}
    ${leadAdminView() ? (leadsList().some((lead) => lead.demo) ? `<button type="button" class="la-demo-btn" data-demo="remove">🗑️ حذف الرسالةات التجريبية (${leadsList().filter((lead) => lead.demo).length})</button>` : `<button type="button" class="la-demo-btn" data-demo="create">🧪 رسائل تجريبية</button>`) : ""}
    ${leadAdminView() ? `<div class="la-filters">
      ${leadAdminView() ? `<select data-lead-filter="agent" aria-label="المستشارة"><option value="">كل المستشارات</option>${agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${LEAD_UI.agent === agent.id ? "selected" : ""}>${escapeHtml(leadAgentName(agent.id))}</option>`).join("")}<option value="__none" ${LEAD_UI.agent === "__none" ? "selected" : ""}>بدون مستشارة</option></select>` : ""}
      <select data-lead-filter="source" aria-label="المصدر"><option value="">كل المصادر</option><option value="form" ${LEAD_UI.source === "form" ? "selected" : ""}>استمارة</option><option value="whatsapp" ${LEAD_UI.source === "whatsapp" ? "selected" : ""}>واتساب</option></select>
      <select data-lead-filter="status" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(LEAD_STATUS).map(([key, value]) => `<option value="${key}" ${LEAD_UI.status === key ? "selected" : ""}>${value.icon} ${escapeHtml(value.label)}</option>`).join("")}</select>
    </div>` : ""}
  </div>`;
}

// Quick filter cards: one tap to see only new leads, no answer, callbacks, RDVs…
const QUICK_FILTERS = [
  ["", "🗂️", "الكل"],
  ["new", "🆕", "جديدة"],
  ["no_answer", "📵", "لم يُجب"],
  ["callback", "⏳", "إعادة الاتصال"],
  ["booked", "📅", "مواعيد"],
  ["contacted", "💭", "يفكّر"],
  ["visited", "🚶", "حضر"],
  ["registered", "🎓", "سجّل"],
];
function leadQuickFiltersHtml() {
  const pool = leadsList().filter((lead) => (LEAD_UI.viewAs ? lead.agentId === LEAD_UI.viewAs : leadAdminView() ? (!LEAD_UI.agent || lead.agentId === LEAD_UI.agent) : true));
  return `<div class="la-quick" role="tablist" aria-label="تصفية سريعة">${QUICK_FILTERS.map(([key, icon, label]) => {
    const count = key ? pool.filter((lead) => lead.status === key).length : pool.length;
    if (["contacted", "visited", "registered"].includes(key) && !count && LEAD_UI.status !== key) return "";
    return `<button type="button" role="tab" class="la-q la-q-${key || "all"}${LEAD_UI.status === key ? " is-on" : ""}" aria-selected="${LEAD_UI.status === key}" data-quick-status="${key}"><span>${icon}</span><strong>${number(count)}</strong><small>${label}</small></button>`;
  }).join("")}</div>`;
}
function leadsFilteredHtml(leads) {
  const status = LEAD_STATUS[LEAD_UI.status];
  const sorted = [...leads].sort((a, b) => LEAD_UI.status === "booked" ? String(a.appointmentAt).localeCompare(String(b.appointmentAt)) : String(b.statusAt || b.createdAt).localeCompare(String(a.statusAt || a.createdAt)));
  return leadSection("filter", status.icon, status.label, "", sorted, "لا توجد رسائل بهذه الحالة.");
}

// ---------- Push alerts ----------
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushBannerHtml() {
  if (LEAD_UI.pushOn) return `<div class="la-push is-on"><span>🔔 التنبيهات مفعّلة على هذا الجهاز</span><button type="button" data-push-test>تجربة</button></div>`;
  if (!pushSupported()) {
    if (isIos() && !isStandalone()) return `<button type="button" class="la-push" data-push-ios><b>🔔</b><span><strong>فعّلي التنبيهات على الآيفون</strong><small>أضيفي التطبيق إلى الشاشة الرئيسية أولاً، اضغطي هنا للطريقة</small></span></button>`;
    return "";
  }
  if (Notification.permission === "denied") return `<div class="la-push is-bad"><b>🔕</b><span><strong>التنبيهات محظورة في هذا المتصفح</strong><small>افتحي إعدادات الموقع (🔒 بجانب الرابط) ← الإشعارات ← سماح</small></span></div>`;
  return `<button type="button" class="la-push" data-push-enable><b>🔔</b><span><strong>فعّلي تنبيهات الرسائل الجديدة</strong><small>تصلك كل رسالة فوراً حتى والتطبيق مغلق</small></span></button>`;
}
function urlKey(base64) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
async function pushRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch { return null; }
}
async function refreshPushState() {
  const registration = pushSupported() ? await pushRegistration() : null;
  const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
  const on = Boolean(subscription && Notification.permission === "granted");
  // Re-send an existing subscription so the server always has it (keys can rotate).
  if (on && !LEAD_UI.pushSynced) {
    LEAD_UI.pushSynced = true;
    api("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription, device: navigator.userAgent.slice(0, 80) }) }).catch(() => {});
  }
  if (on !== LEAD_UI.pushOn) { LEAD_UI.pushOn = on; if (state) renderLeads(); }
}
async function enablePush() {
  const key = window.pushInfo?.publicKey;
  if (!key) { toast("لحظة… أعيدي المحاولة بعد ثوانٍ", "error"); return; }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") { toast("لم يتم السماح بالتنبيهات", "error"); renderLeads(); return; }
  const registration = await pushRegistration();
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && subscription.options?.applicationServerKey) {
    const current = btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (current !== key) { await subscription.unsubscribe(); subscription = null; }
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(key) });
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription, device: navigator.userAgent.slice(0, 80) }) });
  LEAD_UI.pushOn = true;
  LEAD_UI.pushSynced = true;
  renderLeads();
  const res = await api("/api/push/test", { method: "POST", body: "{}" });
  toast(res.sent ? "🔔 تم التفعيل! وصلك إشعار تجريبي" : "🔔 تم التفعيل");
}
function openIosHelp() {
  const dialog = ensureLeadDialog();
  dialog.innerHTML = `<div class="modal-content la-detail"><div class="la-detail-head"><div><small>🔔 الآيفون</small><h2>تفعيل التنبيهات</h2></div><button type="button" class="la-close" data-lead-close aria-label="إغلاق">×</button></div>
    <ol class="la-steps la-ios-steps"><li>افتحي هذا الرابط في <b>Safari</b>.</li><li>اضغطي زر المشاركة <b>⬆️</b> في الأسفل.</li><li>اختاري <b>«إضافة إلى الشاشة الرئيسية»</b> ثم «إضافة».</li><li>افتحي التطبيق من أيقونة <b>CMCG</b> الجديدة واضغطي «فعّلي التنبيهات».</li></ol>
    <p class="la-hint">يلزم iOS 16.4 أو أحدث. بعد ذلك تصلك الرسائل الجديدة حتى والهاتف مقفل.</p></div>`;
  if (!dialog.open) dialog.showModal();
}

// In-app alarm: a loud, repeating ring with a full-screen card until the agent acts.
let alarmTimer = null;
let alarmAudio = null;
function ringOnce() {
  try {
    alarmAudio = alarmAudio || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = alarmAudio;
    if (ctx.state === "suspended") ctx.resume();
    [0, 0.18, 0.36, 0.7, 0.88, 1.06].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = index % 3 === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.16);
    });
  } catch {}
  try { navigator.vibrate?.([400, 150, 400, 150, 800]); } catch {}
}
function stopLeadAlarm() {
  clearInterval(alarmTimer);
  alarmTimer = null;
  document.getElementById("leadAlarm")?.remove();
}
function startLeadAlarm(lead) {
  if (!lead || leadReadOnly()) return;
  stopLeadAlarm();
  const box = document.createElement("div");
  box.id = "leadAlarm";
  box.className = "la-alarm";
  box.setAttribute("dir", "rtl");
  box.innerHTML = `<div class="la-alarm-card"><div class="la-alarm-bell">🔔</div><small>رسالة جديدة · ساخنة 🔥</small><h2>${escapeHtml(lead.name || leadPhoneLabel(lead.phone))}</h2><p dir="ltr">${escapeHtml(leadPhoneLabel(lead.phone))}</p>
    <a class="la-alarm-call" href="tel:+${escapeHtml(lead.phone || "")}" data-lead-contact="${escapeHtml(lead.id)}" data-kind="call" data-alarm-stop>📞 اتصلي الآن</a>
    <button type="button" class="la-alarm-later" data-alarm-stop>لاحقاً</button></div>`;
  document.body.appendChild(box);
  box.addEventListener("click", (event) => {
    if (!event.target.closest("[data-alarm-stop]")) return;
    const contact = event.target.closest("[data-lead-contact]");
    if (contact) {
      const id = contact.dataset.leadContact;
      api(`/api/crm-leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ tap: "call" }) }).catch(() => {});
      setPendingCall({ leadId: id, kind: "call", at: Date.now() });
    }
    stopLeadAlarm();
  });
  ringOnce();
  alarmTimer = setInterval(() => { if (!document.hidden) ringOnce(); }, 4000);
  setTimeout(stopLeadAlarm, 3 * 60 * 1000);
}
function handleDeepLink() {
  const params = new URLSearchParams(window.location.hash.slice(1).split("&").slice(1).join("&"));
  const leadId = params.get("lead");
  const call = params.get("call");
  if (!leadId && !call) return;
  history.replaceState(null, "", `${window.location.pathname}#view=leads`);
  if (call) window.location.href = `tel:+${call.replace(/[^\d]/g, "")}`;
  else if (leadById(leadId)) openLeadDetail(leadId);
}

// Auto-sync: pull fresh data every 30s while the Leads screen is open.
async function refreshLeadsQuietly() {
  if (!state || document.hidden || !document.getElementById("leads")?.classList.contains("active")) return;
  if (document.getElementById("leadDialog")?.open || document.getElementById("leadSheet")?.open || document.activeElement?.matches?.("input, textarea, select")) return;
  try {
    const known = new Set(leadsList().map((lead) => lead.id));
    const data = await api("/api/state");
    state = data.state;
    normalizeState();
    window.leadStats = Array.isArray(data.leadStats) ? data.leadStats : [];
    window.leadSheetSync = data.leadSheetSync || null;
    window.pushInfo = data.push || window.pushInfo;
    const fresh = leadsList().filter((lead) => !known.has(lead.id) && (leadAdminView() || lead.agentId === leadViewerId()));
    renderLeads();
    if (fresh.length && !leadAdminView()) startLeadAlarm(fresh[0]);
    if (fresh.length) {
      toast(`🔔 ${fresh.length === 1 ? "رسالة جديدة" : `${fresh.length} رسائل جديدة`}: ${fresh[0].name || leadPhoneLabel(fresh[0].phone)}`);
      try { navigator.vibrate?.([120, 60, 120]); } catch {}
    }
  } catch {}
}

function renderLeads() {
  const root = document.getElementById("leadsRoot");
  if (!root || !state) return;
  root.setAttribute("dir", "rtl");
  root.setAttribute("lang", "ar");
  const leads = leadsVisible();
  const unassigned = leadsList().filter((lead) => !lead.agentId && !["registered", "not_interested", "other_city", "not_qualified", "wrong_number"].includes(lead.status)).length;
  const body = LEAD_UI.status && LEAD_UI.view === "today" ? leadsFilteredHtml(leads) : LEAD_UI.view === "board" ? leadsBoardHtml(leads) : LEAD_UI.view === "list" ? leadsListHtml(leads) : leadsTodayHtml(leads);
  const empty = !leadsList().length ? `<div class="la-onboarding"><strong>لا توجد رسائل حالياً</strong><p>${leadAdminView() ? "اربطي ورقة Google «CMCG Leads» من «الربط والتوزيع» أدناه، وستصل كل رسالة جديدة من الاستمارة إلى هنا وتُوزَّع تلقائياً." : "ستظهر هنا الرسائل الموزّعة عليك."}</p></div>` : "";
  const viewAsBanner = leadReadOnly() ? `<div class="la-viewas"><span>👁️</span><div><strong>تشاهدين شاشة ${escapeHtml(leadAgentName(LEAD_UI.viewAs))} كما تراها هي</strong><small>وضع المشاهدة فقط: لا يمكنك تعديل أي شيء.</small></div><button type="button" data-view-as-exit>العودة إلى لوحتي</button></div>` : "";
  const nextBar = leadNextBarHtml();
  root.classList.toggle("has-next", Boolean(nextBar));
  root.innerHTML = `${viewAsBanner}${leadHeroHtml()}
    ${leadAdminView() ? leadMonitorHtml() : ""}
    ${leadAdminView() && unassigned ? `<div class="la-alert">⚠️ <strong>${number(unassigned)} رسالة بدون مستشارة.</strong> <button type="button" data-lead-redistribute>وزّعيها الآن</button></div>` : ""}
    ${leadsToolbarHtml()}
    ${leadsList().length ? leadQuickFiltersHtml() : ""}
    ${empty}
    <div class="la-body">${body}</div>
    ${nextBar}
    ${leadAdminView() ? `<div id="leadAds">${leadAdsHtml()}</div><div id="leadSplitTest">${leadSplitTestHtml()}</div><details class="la-settings" ${LEAD_UI.settingsOpen ? "open" : ""} data-lead-settings><summary><strong>⚙️ الربط والتوزيع</strong><small>Google Sheets، توزيع الرسائل، رسائل واتساب</small></summary>${leadSettingsHtml()}</details>` : ""}`;
  if (LEAD_UI.detailId && document.getElementById("leadDialog")?.open && !LEAD_UI.sheet) renderLeadDetail();
}

// ---------- Admin: what each agent is doing ----------
const localDay = (iso) => (iso ? dateInputValue(new Date(iso)) : "");
function leadAgentLink(agent) { return agent?.accessToken ? `${window.location.origin}/a/${agent.accessToken}` : ""; }
function leadAgo(iso) { return iso ? leadAge(iso) : "—"; }
function leadAgentReport(agent) {
  const today = leadTodayKey();
  const leads = leadsList().filter((lead) => lead.agentId === agent.id);
  const entries = leads.flatMap((lead) => (lead.history || []).map((item) => ({ ...item, lead })));
  const todayEntries = entries.filter((item) => localDay(item.at) === today);
  const taps = todayEntries.filter((item) => item.type === "tap");
  const fresh = leads.filter((lead) => lead.status === "new");
  const oldestNew = fresh.reduce((oldest, lead) => (!oldest || lead.createdAt < oldest ? lead.createdAt : oldest), "");
  const waiting30 = fresh.filter((lead) => Date.now() - new Date(lead.createdAt).getTime() > 30 * 60000).length;
  // Speed to lead: minutes from assignment to the first call / WhatsApp tap, for leads received today.
  const speeds = leads.filter((lead) => localDay(lead.assignedAt || lead.createdAt) === today).map((lead) => {
    const first = (lead.history || []).find((item) => item.type === "tap" || item.contact);
    return first ? (new Date(first.at) - new Date(lead.assignedAt || lead.createdAt)) / 60000 : null;
  }).filter((value) => value !== null).sort((a, b) => a - b);
  const speed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : null;
  const lastAction = entries.filter((item) => item.type === "tap" || item.contact || item.status).map((item) => item.at).sort().pop() || "";
  const stats = (window.leadStats || []).find((row) => row.agentId === agent.id) || {};
  const remindersPending = leads.filter(leadNeedsReminder).length;
  const overdueCallbacks = leads.filter((lead) => lead.status === "callback" && lead.callbackAt && lead.callbackAt < leadNowLocal()).length;
  const missed = leads.filter((lead) => lead.status === "booked" && lead.appointmentAt && leadDayOf(lead.appointmentAt) < today).length;
  const todo = fresh.length + leads.filter(leadCallbackDue).length;
  const hour = new Date().getHours();
  const openNow = hour >= 11 && hour < 20;
  const quietMinutes = lastAction ? (Date.now() - new Date(lastAction).getTime()) / 60000 : Infinity;
  const warnings = [];
  if (waiting30) warnings.push(["bad", `🔥 ${waiting30} رسالة جديدة دون اتصال منذ أكثر من 30 دقيقة (أقدمها منذ ${leadAge(oldestNew)})`]);
  if (openNow && todo && quietMinutes > 90) warnings.push(["bad", `😴 لا اتصال ${lastAction ? `منذ ${leadAge(lastAction)}` : "اليوم"} ولديها ${todo} رسالة تنتظر الاتصال`]);
  if (speed !== null && speed > 60) warnings.push(["warn", `🐢 تتصل بعد ${Math.round(speed)} دقيقة في المتوسط (الهدف: أقل من 15 دقيقة)`]);
  if (remindersPending) warnings.push(["warn", `🔔 ${remindersPending} مواعيد بدون رسالة تذكير`]);
  if (overdueCallbacks) warnings.push(["warn", `⏳ ${overdueCallbacks} إعادة اتصال فات موعدها`]);
  if (missed) warnings.push(["warn", `❗ ${missed} مواعيد فائتة بدون نتيجة`]);
  return {
    leads, entries, taps, calls: taps.filter((item) => item.channel === "call").length, whatsapps: taps.filter((item) => item.channel === "whatsapp").length,
    results: todayEntries.filter((item) => item.status).length, fresh: fresh.length, speed, lastAction, lastSeen: stats.lastSeenAt || "",
    rdvsToday: Number(stats.rdvsToday || 0), registeredMonth: Number(stats.registeredMonth || 0), warnings,
    health: warnings.some(([tone]) => tone === "bad") ? "bad" : warnings.length ? "warn" : "good",
  };
}
function leadActivityText(item) {
  if (item.type === "tap") return item.channel === "call" ? "📞 ضغطت على اتصال" : item.channel === "whatsapp" ? "💬 فتحت واتساب" : "🔔 تذكير";
  if (item.type === "created") return "📥 استلمت الرسالة";
  if (item.type === "reassigned") return "🔀 حُوّلت الرسالة";
  const parts = [];
  if (item.status) parts.push(`${LEAD_STATUS[item.status.to]?.icon || ""} ${LEAD_STATUS[item.status.to]?.label || item.status.to}`);
  if (item.appointmentAt?.to) parts.push(`📅 ${leadWhen(item.appointmentAt.to)}`);
  if (item.reminded) parts.push("🔔 أُرسل التذكير");
  if (item.notes) parts.push("📝 ملاحظة");
  return parts.join(" · ") || "✏️ تعديل";
}
function leadMonitorHtml() {
  const agents = leadAgents();
  const hidden = state.agents.filter((agent) => agent.active !== false && leadAgentSetting(agent.id).hidden);
  if (!agents.length && !hidden.length) return "";
  return `<section class="la-monitor"><div class="la-section-head"><h3><span>👀</span> المستشارات الآن</h3><small>ماذا تفعل كل واحدة اليوم. اضغطي «شاهدي شاشتها» لرؤية شاشتها دون تعديل أي شيء.</small></div><div class="la-monitor-grid">${agents.map((agent) => {
    const report = leadAgentReport(agent);
    const online = report.lastSeen && Date.now() - new Date(report.lastSeen).getTime() < 5 * 60000;
    const feed = [...report.entries].filter((item) => item.type !== "created").sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 7);
    const link = leadAgentLink(agent);
    const paused = leadAgentSetting(agent.id).active === false;
    return `<article class="la-agent la-health-${report.health}${paused ? " is-paused" : ""}">
      ${paused ? `<div class="la-paused">⏸️ متوقفة: لا تستقبل رسائل جديدة</div>` : ""}
      <header><span class="la-me small" style="--agent:${leadAgentColor(agent.id)}">${escapeHtml(leadAgentCode(agent))}</span><div><strong>${escapeHtml(leadAgentName(agent.id))}</strong><small class="${online ? "is-online" : ""}">${online ? "🟢 متصلة الآن" : report.lastSeen ? `آخر ظهور: منذ ${escapeHtml(leadAge(report.lastSeen))}` : "لم تدخل اليوم"}</small></div><span class="la-health">${report.health === "good" ? "✅ جيد" : report.health === "warn" ? "⚠️ انتباه" : "🚨 يلزم تدخّل"}</span></header>
      <div class="la-agent-stats"><div><strong>${report.calls}</strong><span>📞 اتصالات</span></div><div><strong>${report.whatsapps}</strong><span>💬 واتساب</span></div><div><strong>${report.rdvsToday}</strong><span>📅 مواعيد</span></div><div><strong>${report.fresh}</strong><span>🔥 جديدة</span></div><div><strong>${report.speed === null ? "—" : `${Math.round(report.speed)}د`}</strong><span>⚡ سرعة الرد</span></div><div><strong>${report.registeredMonth}</strong><span>🎓 الشهر</span></div></div>
      ${report.warnings.length ? `<ul class="la-warnings">${report.warnings.map(([tone, text]) => `<li class="is-${tone}">${escapeHtml(text)}</li>`).join("")}</ul>` : `<p class="la-ok">كل شيء جيد، لا توجد تنبيهات 👌</p>`}
      <details class="la-feed"><summary>آخر النشاط${report.lastAction ? ` · منذ ${escapeHtml(leadAge(report.lastAction))}` : ""}</summary><ol>${feed.map((item) => `<li><time dir="ltr">${escapeHtml(new Date(item.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }))}</time><span>${escapeHtml(leadActivityText(item))}</span><button type="button" data-lead-open="${escapeHtml(item.lead.id)}">${escapeHtml(item.lead.name || leadPhoneLabel(item.lead.phone))}</button></li>`).join("") || "<li>لا يوجد نشاط بعد.</li>"}</ol></details>
      <div class="la-agent-actions"><button type="button" class="la-confirm small" data-view-as="${escapeHtml(agent.id)}">👁️ شاهدي شاشتها</button>${link ? `<button type="button" class="la-secondary" data-lead-copy="${escapeHtml(link)}">🔗 نسخ الرابط</button>` : `<button type="button" class="la-secondary" data-agent-link="${escapeHtml(agent.id)}">🔗 إنشاء الرابط</button>`}</div>
      <div class="la-agent-tools"><button type="button" data-agent-pause="${escapeHtml(agent.id)}">${paused ? "▶️ استئناف الرسائل" : "⏸️ إيقاف الرسائل"}</button><button type="button" data-transfer-from="${escapeHtml(agent.id)}">🔀 تحويل رسائلها</button><button type="button" data-agent-hide="${escapeHtml(agent.id)}">🙈 إخفاء</button></div>
    </article>`;
  }).join("")}</div>${hidden.length ? `<div class="la-hidden-agents"><span>🙈 مخفيات من الرسائل:</span>${hidden.map((agent) => `<button type="button" data-agent-show="${escapeHtml(agent.id)}">${escapeHtml(leadAgentName(agent.id))} · إظهار</button>`).join("")}</div>` : ""}</section>`;
}

// ---------- Transfer leads between agents ----------
const TRANSFER_STATUSES = ["new", "no_answer", "callback", "contacted", "booked", "visited"];
LEAD_UI.transfer = null;
function openTransfer(fromId) {
  // Paused agents are not picked by default; they can still be ticked by hand.
  const others = leadAgents().filter((agent) => agent.id !== fromId && leadAgentSetting(agent.id).active !== false);
  LEAD_UI.transfer = { from: fromId === undefined ? "" : fromId, statuses: ["new"], mode: "spread", to: others.map((agent) => agent.id), one: others[0]?.id || "" };
  renderTransfer();
  const dialog = ensureLeadDialog();
  LEAD_UI.detailId = "";
  if (!dialog.open) dialog.showModal();
}
function transferPlan() {
  const t = LEAD_UI.transfer;
  const from = t.from === "__all" ? leadsList().map((lead) => lead.agentId || "") : [t.from];
  const fromSet = new Set(from);
  const targets = t.mode === "one" ? [t.one].filter(Boolean) : t.to;
  const leads = leadsList().filter((lead) => fromSet.has(lead.agentId || "") && t.statuses.includes(lead.status)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const plan = {};
  let turn = 0;
  let moved = 0;
  leads.forEach((lead) => {
    const options = targets.filter((agentId) => agentId !== lead.agentId);
    if (!options.length) return;
    const agentId = options[turn % options.length];
    turn += 1;
    moved += 1;
    plan[agentId] = (plan[agentId] || 0) + 1;
  });
  return { moved, plan, fromIds: [...fromSet], targets };
}
function renderTransfer() {
  const dialog = ensureLeadDialog();
  const t = LEAD_UI.transfer;
  if (!t) return;
  const agents = leadAgents();
  const fromIds = t.from === "__all" ? null : [t.from];
  const count = (status) => leadsList().filter((lead) => (fromIds ? fromIds.includes(lead.agentId || "") : true) && lead.status === status).length;
  const { moved, plan } = transferPlan();
  const fromLabel = (id) => (id === "" ? "بدون مستشارة" : id === "__all" ? "كل المستشارات" : leadAgentName(id));
  dialog.innerHTML = `<div class="modal-content la-detail">
    <div class="la-detail-head"><div><small>🔀 تحويل الرسائل</small><h2>نقل الرسائل من مستشارة إلى أخرى</h2><p>الرسائل الجديدة هي الأساس. لا تُحوَّل المواعيد إلا إذا اخترتِها، حتى لا يضيع جهد من حجزتها.</p></div><button class="la-close" type="button" data-lead-close aria-label="إغلاق">×</button></div>
    <section class="la-block"><h3>1 · من أي مستشارة؟</h3><div class="la-chips">${["__all", ...agents.map((agent) => agent.id), ""].map((id) => `<button type="button" class="la-chip${t.from === id ? " is-on" : ""}" data-transfer-set-from="${escapeHtml(id)}">${escapeHtml(fromLabel(id))}</button>`).join("")}</div></section>
    <section class="la-block"><h3>2 · أي رسائل؟</h3><div class="la-chips">${TRANSFER_STATUSES.map((status) => `<button type="button" class="la-chip la-${LEAD_STATUS[status].tone}${t.statuses.includes(status) ? " is-on" : ""}" data-transfer-status="${status}">${LEAD_STATUS[status].icon} ${escapeHtml(LEAD_STATUS[status].label)} <b>${count(status)}</b></button>`).join("")}</div>${t.statuses.includes("booked") ? `<p class="la-warn-note">⚠️ ستُحوَّل أيضاً المواعيد التي حجزتها المستشارة.</p>` : `<p class="la-hint">📅 لن تُحوَّل المواعيد.</p>`}</section>
    <section class="la-block"><h3>3 · إلى من؟</h3>
      <div class="la-chips"><button type="button" class="la-chip${t.mode === "spread" ? " is-on" : ""}" data-transfer-mode="spread">⚖️ توزيع بالتساوي</button><button type="button" class="la-chip${t.mode === "one" ? " is-on" : ""}" data-transfer-mode="one">👤 لمستشارة واحدة</button></div>
      ${t.mode === "spread"
        ? `<div class="la-chips">${agents.map((agent) => `<button type="button" class="la-chip${t.to.includes(agent.id) ? " is-on" : ""}" data-transfer-to="${escapeHtml(agent.id)}"><i class="la-dot" style="--agent:${leadAgentColor(agent.id)}"></i>${escapeHtml(leadAgentName(agent.id))}${leadAgentSetting(agent.id).active === false ? " ⏸️" : ""}</button>`).join("")}</div>`
        : `<div class="la-chips">${agents.map((agent) => `<button type="button" class="la-chip${t.one === agent.id ? " is-on" : ""}" data-transfer-one="${escapeHtml(agent.id)}"><i class="la-dot" style="--agent:${leadAgentColor(agent.id)}"></i>${escapeHtml(leadAgentName(agent.id))}${leadAgentSetting(agent.id).active === false ? " ⏸️" : ""}</button>`).join("")}</div>`}
    </section>
    <div class="la-transfer-summary">${moved ? `<strong>ستُحوَّل ${moved} رسالة</strong><span>${Object.entries(plan).map(([agentId, n]) => `${escapeHtml(leadAgentName(agentId))}: ${n}`).join(" · ")}</span>` : `<strong>لا توجد رسائل للتحويل بهذه الاختيارات</strong>`}</div>
    <button type="button" class="la-confirm" data-transfer-confirm ${moved ? "" : "disabled"}>🔀 تحويل ${moved || ""} رسالة</button>
  </div>`;
}

// ---------- RDV & callback pickers ----------
function rdvDays() {
  return Array.from({ length: 8 }, (_, offset) => {
    const day = leadTodayKey(offset);
    const date = new Date(`${day}T12:00:00`);
    const label = offset === 0 ? "اليوم" : offset === 1 ? "غداً" : date.toLocaleDateString(AR_LOCALE, { weekday: "long" });
    return { day, label, sub: date.toLocaleDateString(AR_LOCALE, { day: "numeric", month: "short" }) };
  });
}
function rdvSlotPast(day, time) {
  if (day !== leadTodayKey()) return false;
  const now = new Date();
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m <= now.getHours() * 60 + now.getMinutes() + 15;
}
function rdvPickerHtml(current = "") {
  if (!LEAD_UI.pick.day) {
    const from = current && current.slice(0, 10) >= leadTodayKey() ? current : "";
    LEAD_UI.pick = { day: from ? from.slice(0, 10) : (OPEN_SLOTS.flatMap(([, times]) => times).every((time) => rdvSlotPast(leadTodayKey(), time)) ? leadTodayKey(1) : leadTodayKey()), time: from ? from.slice(11, 16) : "" };
  }
  const { day, time } = LEAD_UI.pick;
  const summary = time ? `📅 ${leadDayName(day)} على الساعة ${time}` : "اختاري الساعة 👇";
  return `<div class="la-picker">
    <div class="la-days" role="listbox" aria-label="اليوم">${rdvDays().map((item) => `<button type="button" class="la-day${item.day === day ? " is-on" : ""}" data-pick-day="${item.day}" aria-selected="${item.day === day}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.sub)}</small></button>`).join("")}</div>
    ${OPEN_SLOTS.map(([period, times]) => `<div class="la-period"><span>${period}</span><div class="la-times">${times.map((slot) => { const past = rdvSlotPast(day, slot); return `<button type="button" class="la-time${slot === time ? " is-on" : ""}" data-pick-time="${slot}" ${past ? "disabled" : ""}>${slot}</button>`; }).join("")}</div></div>`).join("")}
    <p class="la-picker-note">المركز مفتوح من 11:00 إلى 20:00</p>
    <div class="la-picker-foot"><span class="la-picker-summary">${escapeHtml(summary)}</span><button type="button" class="la-confirm" data-pick-confirm ${time ? "" : "disabled"}>✓ تأكيد الموعد</button></div>
  </div>`;
}
function callbackOptions() {
  const plus = (hours) => { const d = new Date(Date.now() + hours * 3600000); return `${dateInputValue(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  return [["بعد ساعة", plus(1)], ["بعد 3 ساعات", plus(3)], ["غداً 11:00", `${leadTodayKey(1)}T11:00`], ["غداً 15:00", `${leadTodayKey(1)}T15:00`], ["غداً 18:00", `${leadTodayKey(1)}T18:00`], ["بعد غد 11:00", `${leadTodayKey(2)}T11:00`]];
}

// ---------- After-call sheet: the agent must pick the result ----------
function ensureSheet() {
  let dialog = document.getElementById("leadSheet");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "leadSheet";
  dialog.className = "la-sheet";
  dialog.setAttribute("dir", "rtl");
  dialog.setAttribute("lang", "ar");
  document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => event.preventDefault()); // no Escape: a result is required
  dialog.addEventListener("click", handleLeadClick);
  return dialog;
}
function pendingCall() { try { return JSON.parse(localStorage.getItem("cmcg-pending-call") || "null"); } catch { return null; } }
function setPendingCall(value) { try { if (value) localStorage.setItem("cmcg-pending-call", JSON.stringify(value)); else localStorage.removeItem("cmcg-pending-call"); } catch {} }

function openCallSheet(leadId, kind) {
  const lead = leadById(leadId);
  if (!lead) { setPendingCall(null); return; }
  LEAD_UI.sheet = { leadId, kind, step: "pick" };
  LEAD_UI.pick = { day: "", time: "" };
  renderCallSheet();
  const dialog = ensureSheet();
  if (!dialog.open) dialog.showModal();
}
function renderCallSheet() {
  const dialog = ensureSheet();
  const sheet = LEAD_UI.sheet;
  const lead = sheet && leadById(sheet.leadId);
  if (!lead) { if (dialog.open) dialog.close(); return; }
  const head = `<div class="la-sheet-head"><span class="la-avatar" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadInitials(lead.name))}</span><div><small>${sheet.kind === "call" ? "📞 عدتِ من المكالمة" : "💬 عدتِ من واتساب"}</small><h3>ما نتيجة التواصل مع ${escapeHtml(lead.name || "هذا الشخص")}؟</h3></div></div>`;
  let body;
  if (sheet.step === "booked") {
    body = `<button type="button" class="la-back" data-sheet-back>→ رجوع</button><h4 class="la-sheet-sub">📅 متى الموعد؟</h4>${rdvPickerHtml(lead.appointmentAt)}`;
  } else if (sheet.step === "callback") {
    body = `<button type="button" class="la-back" data-sheet-back>→ رجوع</button><h4 class="la-sheet-sub">⏳ متى نعيد الاتصال؟</h4><div class="la-callback">${callbackOptions().map(([label, value]) => `<button type="button" data-callback-at="${value}">${escapeHtml(label)}</button>`).join("")}</div>`;
  } else {
    body = `<div class="la-results">${CALL_RESULTS.map(([key, label, hint]) => `<button type="button" class="la-result la-${LEAD_STATUS[key].tone}" data-call-result="${key}"><span class="la-result-icon">${LEAD_STATUS[key].icon}</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></button>`).join("")}</div>
      <label class="la-sheet-note"><span>ملاحظة (اختياري)</span><input type="text" data-sheet-note placeholder="مثلاً: يريد تكوين المحاسبة، متاح مساءً…" /></label>
      <button type="button" class="la-skip" data-call-skip>لم يتم الاتصال</button>`;
  }
  dialog.innerHTML = `<div class="la-sheet-body">${head}${body}</div>`;
}
async function saveCallResult(body, message) {
  const sheet = LEAD_UI.sheet;
  if (!sheet) return;
  const note = document.querySelector("#leadSheet [data-sheet-note]")?.value?.trim();
  const lead = leadById(sheet.leadId);
  const payload = { ...body, contacted: sheet.kind === "call" ? "call" : "whatsapp" };
  if (note) payload.notes = [lead?.notes, note].filter(Boolean).join("\n");
  try {
    await leadSave(sheet.leadId, payload, message);
    setPendingCall(null);
    LEAD_UI.sheet = null;
    document.getElementById("leadSheet")?.close();
    if (["booked", "registered"].includes(body.status) || body.appointmentAt) celebrate();
  } catch (error) { toast(error.message, "error"); }
}

// Small celebration for RDVs and registrations.
function celebrate() {
  const layer = document.createElement("div");
  layer.className = "la-confetti";
  layer.setAttribute("aria-hidden", "true");
  const pieces = ["🎉", "✨", "💚", "⭐", "🎊"];
  for (let i = 0; i < 26; i += 1) {
    const piece = document.createElement("span");
    piece.textContent = pieces[i % pieces.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.fontSize = `${16 + Math.random() * 18}px`;
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}

// ---------- Lead detail ----------
function ensureLeadDialog() {
  let dialog = document.getElementById("leadDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "leadDialog";
  dialog.className = "modal la-modal";
  dialog.setAttribute("dir", "rtl");
  dialog.setAttribute("lang", "ar");
  document.body.append(dialog);
  dialog.addEventListener("click", handleLeadClick);
  dialog.addEventListener("submit", handleLeadSubmit);
  dialog.addEventListener("change", handleLeadChange);
  dialog.addEventListener("close", () => { LEAD_UI.detailId = ""; LEAD_UI.detailStep = ""; LEAD_UI.transfer = null; });
  return dialog;
}

function renderLeadDetail() {
  const dialog = ensureLeadDialog();
  const lead = leadById(LEAD_UI.detailId);
  if (!lead) { if (dialog.open) dialog.close(); return; }
  const ad = byId(state.creatives, lead.creativeId);
  const adSet = byId(state.adSets, lead.adSetId);
  const campaign = byId(state.campaigns, lead.campaignId);
  const answers = Object.entries(lead.answers || {});
  const history = [...(lead.history || [])].reverse().slice(0, 25).map((item) => {
    const parts = [];
    if (item.type === "created") parts.push(`وصلت الرسالة${item.agentId ? ` · أُسند إلى ${leadAgentName(item.agentId)}` : ""}`);
    if (item.type === "reassigned") parts.push(`حُوّل من ${item.from || "لا أحد"} إلى ${item.to || "لا أحد"}`);
    if (item.contact) parts.push(item.contact === "call" ? "📞 مكالمة" : item.contact === "reminder" ? "🔔 تذكير واتساب" : "💬 واتساب");
    if (item.status) parts.push(`${LEAD_STATUS[item.status.to]?.icon || ""} ${LEAD_STATUS[item.status.to]?.label || item.status.to}`);
    if (item.appointmentAt) parts.push(item.appointmentAt.to ? `📅 موعد: ${leadWhen(item.appointmentAt.to)}` : "أُلغي الموعد");
    if (item.callbackAt) parts.push(`⏳ إعادة الاتصال: ${leadWhen(item.callbackAt)}`);
    if (item.notes) parts.push("📝 ملاحظة");
    return `<li><time dir="ltr">${escapeHtml(new Date(item.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</time><span>${escapeHtml(parts.join(" · ") || item.type)}${item.by ? ` <em>· ${escapeHtml(item.by)}</em>` : ""}</span></li>`;
  }).join("");
  const step = LEAD_UI.detailStep || "";
  const reminderDue = leadNeedsReminder(lead);
  const statusSection = step === "rdv"
    ? `<section class="la-block"><button type="button" class="la-back" data-detail-back>→ رجوع</button><h3>📅 اختاري الموعد</h3>${rdvPickerHtml(lead.appointmentAt)}</section>`
    : step === "callback"
      ? `<section class="la-block"><button type="button" class="la-back" data-detail-back>→ رجوع</button><h3>⏳ متى نعيد الاتصال؟</h3><div class="la-callback">${callbackOptions().map(([label, value]) => `<button type="button" data-callback-at="${value}">${escapeHtml(label)}</button>`).join("")}</div></section>`
      : `<section class="la-block"><h3>الحالة ${leadStatusPill(lead)}</h3><div class="la-results is-compact">${CALL_RESULTS.map(([key, label]) => `<button type="button" class="la-result la-${LEAD_STATUS[key].tone}${lead.status === key ? " is-current" : ""}" data-detail-status="${key}"><span class="la-result-icon">${LEAD_STATUS[key].icon}</span><strong>${escapeHtml(label)}</strong></button>`).join("")}<button type="button" class="la-result la-visited${lead.status === "visited" ? " is-current" : ""}" data-detail-status="visited"><span class="la-result-icon">🚶</span><strong>حضر ولم يسجّل</strong></button><button type="button" class="la-result la-good${lead.status === "registered" ? " is-current" : ""}" data-detail-status="registered"><span class="la-result-icon">🎓</span><strong>سجّل</strong></button></div><small class="la-hint">الموعد و«حضر» و«سجّل» تُضاف تلقائياً إلى نتائج الإعلان${ad ? ` «${escapeHtml(ad.name)}»` : ""}.</small></section>`;
  dialog.innerHTML = `<div class="modal-content la-detail">
    <div class="la-detail-head"><span class="la-avatar big" style="--agent:${leadAgentColor(lead.agentId)}">${escapeHtml(leadInitials(lead.name))}</span><div><small>${escapeHtml(leadSource(lead).channel)} · وصل ${escapeHtml(leadWhen(dateInputValue(new Date(lead.createdAt)) + "T" + new Date(lead.createdAt).toTimeString().slice(0, 5)))}</small><h2>${escapeHtml(lead.name || "بدون اسم")}</h2><p dir="ltr" class="la-phone">${escapeHtml(leadPhoneLabel(lead.phone))}</p></div><button class="la-close" type="button" data-lead-close aria-label="إغلاق">×</button></div>
    ${leadActionsHtml(lead, { big: true })}
    ${reminderDue ? `<a class="la-reminder-big" href="${escapeHtml(leadWhatsAppUrl(lead, "reminder"))}" target="_blank" rel="noopener" data-lead-contact="${escapeHtml(lead.id)}" data-kind="reminder"><span>⚠️</span><div><strong>لم تُرسل رسالة التذكير!</strong><small>الموعد ${escapeHtml(leadWhen(lead.appointmentAt))}. اضغطي هنا لإرسالها عبر واتساب.</small></div></a>` : ""}
    ${lead.status === "booked" && lead.appointmentAt && step !== "rdv" ? `<div class="la-rdv-box"><div>📅 <strong>${escapeHtml(leadWhen(lead.appointmentAt))}</strong>${lead.remindedAt ? `<small>✓ أُرسل التذكير</small>` : ""}</div><button type="button" data-detail-step="rdv">تغيير الموعد</button></div>` : ""}
    ${statusSection}
    <form class="la-block" data-lead-notes-form><h3>📝 ملاحظات</h3><textarea name="notes" rows="3" placeholder="التكوين المطلوب، الوقت المناسب، أسئلته…">${escapeHtml(lead.notes || "")}</textarea><button class="la-save-note" type="submit">حفظ الملاحظة</button></form>
    ${answers.length ? `<section class="la-block"><h3>📋 أجوبة الاستمارة</h3><dl class="la-answers">${answers.map(([question, answer]) => `<div><dt>${escapeHtml(question)}</dt><dd>${escapeHtml(answer)}</dd></div>`).join("")}</dl></section>` : ""}
    <section class="la-block"><h3>📣 المصدر</h3><dl class="la-answers"><div><dt>الإعلان</dt><dd>${escapeHtml(ad?.name || lead.meta?.adName || "—")}</dd></div><div><dt>المجموعة الإعلانية</dt><dd>${escapeHtml(adSet?.name || lead.meta?.adSetName || "—")}</dd></div><div><dt>الحملة</dt><dd>${escapeHtml(campaign?.name || lead.meta?.campaignName || "—")}</dd></div></dl>
      ${leadAdminView() ? `<label class="la-reassign"><span>المستشارة</span><select data-lead-reassign="${escapeHtml(lead.id)}"><option value="">بدون مستشارة</option>${state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${lead.agentId === agent.id ? "selected" : ""}>${escapeHtml(leadAgentName(agent.id))}</option>`).join("")}</select></label>` : ""}</section>
    ${history ? `<section class="la-block"><h3>🕘 التاريخ</h3><ol class="la-history">${history}</ol></section>` : ""}
    ${leadAdminView() ? `<button class="la-delete" type="button" data-lead-delete>حذف الرسالة</button>` : ""}
  </div>`;
}

function openLeadDetail(id) {
  LEAD_UI.transfer = null;
  LEAD_UI.detailId = id;
  LEAD_UI.detailStep = "";
  LEAD_UI.pick = { day: "", time: "" };
  renderLeadDetail();
  const dialog = ensureLeadDialog();
  if (!dialog.open) dialog.showModal();
}

function openNewLeadForm() {
  LEAD_UI.transfer = null;
  const dialog = ensureLeadDialog();
  LEAD_UI.detailId = "";
  const agents = leadAgents();
  const adSets = state.adSets.filter((adSet) => adSet.metaAdSetId).sort((a, b) => a.name.localeCompare(b.name));
  dialog.innerHTML = `<form class="modal-content la-detail" data-lead-new-form><div class="la-detail-head"><div><small>💬 واتساب</small><h2>إضافة رسالة جديدة</h2><p>لمن يتواصل عبر واتساب. رسائل الاستمارة تصل تلقائياً.</p></div><button class="la-close" type="button" data-lead-close aria-label="إغلاق">×</button></div>
    <div class="la-form"><label><span>الاسم</span><input name="name" autocomplete="off" placeholder="الاسم الكامل" /></label><label><span>رقم الهاتف</span><input name="phone" inputmode="tel" dir="ltr" required placeholder="06 12 34 56 78" /></label>
    ${leadAdminView() ? `<label><span>المستشارة</span><select name="agentId"><option value="">بدون مستشارة</option>${agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(leadAgentName(agent.id))}</option>`).join("")}</select></label>` : ""}
    <label><span>المجموعة الإعلانية (اختياري)</span><select name="adSetId"><option value="">غير معروف</option>${adSets.map((adSet) => `<option value="${escapeHtml(adSet.id)}">${escapeHtml(adSet.name)}</option>`).join("")}</select></label>
    <label><span>ملاحظة (اختياري)</span><input name="notes" autocomplete="off" /></label></div>
    <button class="la-confirm" type="submit">＋ إضافة الرسالة</button></form>`;
  if (!dialog.open) dialog.showModal();
}

// ---------- Admin: Google Sheets, distribution, messages ----------
function leadAppsScript(url) {
  return `// CMCG CRM · يرسل الرسائل الجديدة من هذه الورقة إلى CRM.
// 1) Extensions > Apps Script، الصقي هذا الكود، Enregistrer.
// 2) اختاري الدالة "installer" ثم Exécuter (واقبلي الإذن).
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

function renvoyerTout() {
  PropertiesService.getScriptProperties().deleteProperty("dernierLigne");
  envoyerNouveauxLeads();
}

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
    ["balanced", "بالتساوي", "كل رسالة جديدة تذهب إلى المستشارة التي استلمت أقل اليوم."],
    ["weighted", "بالنسبة", "حسب وزن كل مستشارة (2 = الضعف)."],
    ["adset", "مستشارة الإعلان", "المستشارة المذكورة في اسم المجموعة الإعلانية، وإلا بالتساوي."],
    ["manual", "يدوي", "تصل الرسائل بدون مستشارة وتوزّعينها أنتِ."],
  ];
  const agentRows = leadAgents().map((agent) => {
    const setting = distribution.agents?.[agent.id] || { active: true, weight: 1 };
    const count = (days) => leadsList().filter((lead) => lead.agentId === agent.id && lead.source === "form" && (lead.assignedAt || lead.createdAt) >= since(days)).length;
    return `<tr><td><span class="la-owner" style="--agent:${leadAgentColor(agent.id)}">${escapeHtml(leadAgentCode(agent))} · ${escapeHtml(leadAgentName(agent.id))}</span></td><td><label class="la-switch"><input type="checkbox" name="active:${escapeHtml(agent.id)}" ${setting.active !== false ? "checked" : ""} /><span>تستقبل رسائل</span></label></td><td><input type="number" min="0" step="0.5" name="weight:${escapeHtml(agent.id)}" value="${setting.weight ?? 1}" class="la-weight" aria-label="الوزن" /></td><td>${number(count(1))}</td><td>${number(count(7))}</td></tr>`;
  }).join("");
  return `<div class="la-settings-grid">
    <section class="la-setting"><h3>1 · ربط ورقة Google «CMCG Leads»</h3>
      ${(() => { const sync = window.leadSheetSync || {}; const sheet = state.settings?.leadIntake?.sheetUrl || ""; return `<form class="la-sync" data-lead-sheet-form>
        <p class="la-hint">🔄 مزامنة تلقائية كل دقيقة من الورقة (يجب أن تكون مشاركة: «أي شخص لديه الرابط · عارض»).</p>
        <div class="la-copy"><input name="sheetUrl" dir="ltr" value="${escapeHtml(sheet)}" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="رابط الورقة" /><button type="submit">مزامنة الآن</button></div>
        <small class="la-sync-status${sync.error ? " is-bad" : ""}">${sync.error ? `⚠️ ${escapeHtml(sync.error)}` : sync.at ? `✅ آخر مزامنة ${escapeHtml(leadAge(sync.at))} · ${number(sync.rows || 0)} صف في الورقة` : "⏳ في انتظار أول مزامنة…"}</small>
      </form>`; })()}
      <details class="la-script"><summary>طريقة بديلة: Apps Script</summary>
      <ol class="la-steps"><li>أنشئي رابط الاستقبال (احتفظي به سرياً).</li><li>في الورقة: <b>Extensions → Apps Script</b>، الصقي الكود واحفظيه.</li><li>اختاري <b>installer</b> واضغطي <b>Exécuter</b>. بعدها تصل الرسائل كل دقيقة موزّعة.</li></ol>
      ${url ? `<div class="la-copy"><input readonly dir="ltr" value="${escapeHtml(url)}" aria-label="رابط الاستقبال" /><button type="button" data-lead-copy="${escapeHtml(url)}">نسخ</button></div><details class="la-script"><summary>عرض كود Apps Script</summary><pre dir="ltr">${escapeHtml(leadAppsScript(url))}</pre><button type="button" class="la-confirm" data-lead-copy-script>نسخ الكود</button></details>` : ""}
      <div class="la-row"><button type="button" class="la-secondary" data-lead-token>${url ? "تغيير الرابط" : "إنشاء رابط الاستقبال"}</button><label class="la-secondary la-file">استيراد CSV<input type="file" accept=".csv,text/csv" data-lead-csv /></label></div>
      </details>
    </section>
    <section class="la-setting"><h3>🔗 روابط المستشارات</h3>
      <p class="la-hint">لكل مستشارة رابط خاص: تفتحه في هاتفها مرة واحدة وتبقى متصلة. لا ترى إلا رسائلها، دون كلمة سر. إذا تغيّر الرابط يتوقف القديم عن العمل.</p>
      <p class="la-warn-note">⚠️ لا تفتحي رابط مستشارة في متصفحك أنتِ، استعملي «👁️ شاهدي شاشتها». إذا فتحتِه بالخطأ، افتحي <b dir="ltr">/admin</b> للرجوع إلى لوحة الإدارة.</p>
      ${leadAgents().map((agent) => { const link = leadAgentLink(agent); const share = `https://wa.me/${encodeURIComponent(String(agent.whatsapp || "").replace(/\D/g, ""))}?text=${encodeURIComponent(`السلام ${leadAgentName(agent.id)} 👋 هذا رابط رسائلك، افتحيه في هاتفك واحتفظي به:\n${link}`)}`; return `<div class="la-link-row"><span class="la-owner" style="--agent:${leadAgentColor(agent.id)}">${escapeHtml(leadAgentCode(agent))} · ${escapeHtml(leadAgentName(agent.id))}</span>${link ? `<div class="la-copy"><input readonly dir="ltr" value="${escapeHtml(link)}" aria-label="الرابط" /><button type="button" data-lead-copy="${escapeHtml(link)}">نسخ</button></div><div class="la-row"><a class="la-secondary la-link-btn" href="${escapeHtml(share)}" target="_blank" rel="noopener">💬 أرسليه لها عبر واتساب</a><button type="button" class="la-secondary" data-agent-link="${escapeHtml(agent.id)}">تغيير الرابط</button><button type="button" class="la-secondary" data-agent-link-revoke="${escapeHtml(agent.id)}">إيقاف الرابط</button></div>` : `<button type="button" class="la-secondary" data-agent-link="${escapeHtml(agent.id)}">إنشاء الرابط</button>`}</div>`; }).join("")}
    </section>
    <form class="la-setting" data-lead-distribution-form><h3>2 · توزيع الرسائل</h3>
      <div class="la-modes">${modes.map(([key, label, hint]) => `<label class="la-mode${distribution.mode === key ? " is-on" : ""}"><input type="radio" name="mode" value="${key}" ${distribution.mode === key ? "checked" : ""} /><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></label>`).join("")}</div>
      <div class="table-wrap la-table-wrap"><table class="la-table"><thead><tr><th>المستشارة</th><th>نشيطة</th><th>الوزن</th><th>اليوم</th><th>7 أيام</th></tr></thead><tbody>${agentRows}</tbody></table></div>
      <button type="submit" class="la-confirm">حفظ التوزيع</button>
    </form>
    <form class="la-setting" data-lead-templates-form><h3>3 · رسائل واتساب</h3>
      <p class="la-hint">{name} الاسم · {agent} المستشارة · {day} اليوم · {time} الساعة</p>
      <label><span>أول رسالة</span><textarea name="first" rows="5">${escapeHtml(distribution.templates?.first || "")}</textarea></label>
      <label><span>رسالة التذكير بالموعد</span><textarea name="reminder" rows="9">${escapeHtml(distribution.templates?.reminder || "")}</textarea></label>
      <button type="submit" class="la-confirm">حفظ الرسائل</button>
    </form>
  </div>`;
}

// ---------- Split test: WhatsApp vs form ----------
// A campaign is on the form side only if it actually sent leads into the CRM
// (the new lead-form setup). Older lead-objective campaigns stay out of the test.
function leadCampaignHasCrmLeads(campaign) {
  // By Meta id only (campaign_id from the lead sheet), never by name.
  if (!campaign.metaCampaignId) return leadsList().some((lead) => !lead.demo && lead.source === "form" && lead.campaignId === campaign.id);
  return leadsList().some((lead) => !lead.demo && lead.source === "form" && (lead.meta?.campaignId === campaign.metaCampaignId || lead.campaignId === campaign.id));
}
function leadAutoChannel(campaign) {
  if (leadCampaignHasCrmLeads(campaign)) return "form";
  return /lead/i.test(campaign.objective || "") ? "exclude" : "whatsapp";
}
function leadChannelOf(campaign) {
  if (!campaign) return "";
  return state.settings?.channelOverrides?.[campaign.id] || leadAutoChannel(campaign);
}
// The test starts when the first form lead reached the CRM (month start), unless set by hand.
// Split test period, like Ads Manager: its own presets, independent of the page filter.
const SPLIT_PRESETS = [
  ["today", "اليوم"], ["yesterday", "أمس"], ["last7", "آخر 7 أيام"], ["this_week", "هذا الأسبوع"],
  ["this_month", "هذا الشهر"], ["last_month", "الشهر الماضي"], ["lifetime", "منذ البداية"], ["custom", "مخصص"],
];
function leadSplitPeriod() {
  try { return JSON.parse(localStorage.getItem("cmcg-split-period") || "null") || { preset: "this_month" }; } catch { return { preset: "this_month" }; }
}
function leadSplitRange() {
  const period = leadSplitPeriod();
  const today = new Date();
  const day = (date) => dateInputValue(date);
  const monthStart = (y, m) => day(new Date(y, m, 1));
  const monthEnd = (y, m) => day(new Date(y, m + 1, 0));
  const weekday = (today.getDay() + 6) % 7; // Monday = 0
  const ranges = {
    today: [day(today), day(today)],
    yesterday: [day(addDays(today, -1)), day(addDays(today, -1))],
    last7: [day(addDays(today, -6)), day(today)],
    this_week: [day(addDays(today, -weekday)), day(today)],
    this_month: [monthStart(today.getFullYear(), today.getMonth()), day(today)],
    last_month: [monthStart(today.getFullYear(), today.getMonth() - 1), monthEnd(today.getFullYear(), today.getMonth() - 1)],
    lifetime: ["", ""],
    custom: [period.from || "", period.to || ""],
  };
  const [from, to] = ranges[period.preset] || ranges.this_month;
  return { ...filters, from, to, preset: period.preset in ranges ? period.preset : "this_month" };
}
function leadSplitData() {
  const blank = () => ({ spend: 0, contacts: 0, booked: 0, showed: 0, registered: 0, rdvHours: [], regHours: [], daily: {} });
  const sides = { whatsapp: blank(), form: blank() };
  const range = leadSplitRange();
  const dayMs = 86400000;
  const dayKey = (time) => dateInputValue(new Date(time));
  const daily = (side, day) => (side.daily[day] = side.daily[day] || { spend: 0, booked: 0, registered: 0 });
  filteredLogs(range).forEach((log) => {
    const campaign = relationForLog(log).campaign;
    const side = sides[leadChannelOf(campaign)];
    if (!side) return;
    // A report covering days before/after the test window counts only its days inside it.
    const share = logShareInRange(log, range);
    side.spend += Number(log.spend || 0) * share;
    if (side === sides.whatsapp) side.contacts += Math.round(Number(log.messages || 0) * share);
    const start = log.reportingStart || log.date || "";
    const end = log.reportingEnd || log.date || start;
    if (!start) return;
    const total = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMs) + 1;
    for (let n = 0; n < total; n += 1) {
      const day = new Date(Date.parse(`${start}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
      if ((range.from && day < range.from) || (range.to && day > range.to)) continue;
      daily(side, day).spend += Number(log.spend || 0) / total;
    }
  });
  const formLeads = leadsList().filter((lead) => !lead.demo && lead.source === "form");
  sides.form.contacts += formLeads.filter((lead) => overlapsRange(dateOnly(lead.createdAt), dateOnly(lead.createdAt), range)).length;
  const formById = new Map(formLeads.map((lead) => [lead.id, lead]));
  // Results of CRM form leads always belong to the form side; other results follow
  // their campaign's side (WhatsApp results never land on the form side by name).
  filteredOutcomes(range).forEach((outcome) => {
    const lead = outcome.leadId ? formById.get(outcome.leadId) : null;
    const channel = lead ? "form" : leadChannelOf(relationForOutcome(outcome).campaign);
    const side = sides[channel === "form" && !lead ? "" : channel];
    if (!side || side[outcome.type] === undefined) return;
    side[outcome.type] += 1;
    if (outcome.date && (outcome.type === "booked" || outcome.type === "registered")) daily(side, outcome.date)[outcome.type] += 1;
    // How long it takes: first contact -> RDV / registration.
    const startAt = lead ? Date.parse(lead.createdAt) : Date.parse(`${outcome.sourceDate || ""}T12:00:00`);
    const endAt = lead ? Date.parse(outcome.type === "booked" ? lead.bookedAt : lead.registeredAt || lead.statusAt) : Date.parse(`${outcome.date || ""}T12:00:00`);
    if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt >= startAt) {
      if (outcome.type === "booked") side.rdvHours.push((endAt - startAt) / 3600000);
      if (outcome.type === "registered") side.regHours.push((endAt - startAt) / 3600000);
    }
  });
  return sides;
}
// ---------- Admin: which ads bring RDVs and registrations, and what to do ----------
function logShareInRange(log, range) {
  const start = log.reportingStart || log.date || "";
  const end = log.reportingEnd || log.date || start;
  if (!start || !end || end < start) return 1;
  const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  const inStart = range.from && start < range.from ? range.from : start;
  const inEnd = range.to && end > range.to ? range.to : end;
  return Math.max(0, Math.min(1, days(inStart, inEnd) / days(start, end)));
}
function leadAdsRows() {
  const range = leadSplitRange();
  const rows = new Map();
  const row = (key, init) => { if (!rows.has(key)) rows.set(key, { key, spend: 0, contacts: 0, booked: 0, showed: 0, registered: 0, ...init }); return rows.get(key); };
  const forAd = (ad) => {
    const adSet = byId(state.adSets, ad.adSetId);
    const campaign = byId(state.campaigns, adSet?.campaignId);
    return row(ad.id, { name: ad.name || ad.code || "إعلان", code: ad.code || "", adSetName: adSet?.name || "", campaignName: campaign?.name || "", channel: leadChannelOf(campaign) || "whatsapp", paused: /paused|inactive|off/i.test(`${ad.deliveryStatus || ""} ${adSet?.deliveryStatus || ""} ${campaign?.deliveryStatus || ""}`) });
  };
  filteredLogs(range).forEach((log) => {
    const ad = byId(state.creatives, log.creativeId);
    if (!ad) return;
    const share = logShareInRange(log, range);
    const item = forAd(ad);
    item.spend += Number(log.spend || 0) * share;
    if (item.channel !== "form") item.contacts += Math.round(Number(log.messages || 0) * share);
  });
  // Form leads: contacts by the ad they came from (Meta ad id), linked or not yet imported.
  leadsList().filter((lead) => !lead.demo && lead.source === "form" && overlapsRange(dateOnly(lead.createdAt), dateOnly(lead.createdAt), range)).forEach((lead) => {
    const ad = byId(state.creatives, lead.creativeId);
    const item = ad ? forAd(ad) : row(`meta:${lead.meta?.adId || lead.meta?.adName || "?"}`, { name: lead.meta?.adName || "إعلان غير معروف", adSetName: lead.meta?.adSetName || "", campaignName: lead.meta?.campaignName || "", channel: "form", unlinked: true });
    item.contacts += 1;
  });
  const formLeads = new Map(leadsList().filter((lead) => !lead.demo && lead.source === "form").map((lead) => [lead.id, lead]));
  filteredOutcomes(range).forEach((outcome) => {
    const ad = relationForOutcome(outcome).ad;
    const lead = outcome.leadId ? formLeads.get(outcome.leadId) : null;
    const item = ad ? forAd(ad) : lead ? row(`meta:${lead.meta?.adId || lead.meta?.adName || "?"}`, { name: lead.meta?.adName || "إعلان غير معروف", adSetName: lead.meta?.adSetName || "", campaignName: lead.meta?.campaignName || "", channel: "form", unlinked: true }) : null;
    if (item && item[outcome.type] !== undefined) item[outcome.type] += 1;
  });
  const list = [...rows.values()].filter((item) => item.channel === "form" && (item.spend > 0.009 || item.contacts || item.booked || item.registered));
  // Dynamic benchmark: the median cost per RDV of ads that already booked.
  const costs = list.filter((item) => item.booked && item.spend > 0).map((item) => item.spend / item.booked).sort((a, b) => a - b);
  const benchmark = costs.length ? costs[Math.floor(costs.length / 2)] : null;
  list.forEach((item) => { item.decision = leadAdDecision(item, benchmark); });
  const weight = { scale: 0, stop: 1, fix: 2, keep: 3, wait: 4, import: 5 };
  list.sort((a, b) => weight[a.decision.key] - weight[b.decision.key] || b.registered - a.registered || b.booked - a.booked || b.spend - a.spend);
  return { list, benchmark, range };
}
function leadAdDecision(item, benchmark) {
  const perRdv = item.booked ? item.spend / item.booked : null;
  const profit = revenueEstimate(item.registered, item.spend).profit;
  const stopAt = benchmark ? benchmark * 2 : 15;
  if (item.unlinked) return { key: "import", icon: "📥", text: "استوردي تقرير ميتا لمعرفة التكلفة" };
  if (item.registered && profit > 0) return { key: "scale", icon: "🚀", text: "مربح: زيدي الميزانية 20% كل 3 أيام" };
  if (!item.booked && item.spend >= stopAt) return { key: "stop", icon: "⛔", text: `أوقفيه: صرف ${money(item.spend)} بلا موعد` };
  if (item.booked && benchmark && perRdv > benchmark * 1.6) return { key: "fix", icon: "⚠️", text: "الموعد غالٍ: جرّبي كريتيف أو جمهور جديد" };
  if (item.booked && (!benchmark || perRdv <= benchmark * 1.1)) return { key: "keep", icon: "✅", text: item.registered ? "جيد: اتركيه يعمل" : "مواعيد رخيصة: اتركيه وتابعي الحضور" };
  if (item.booked) return { key: "keep", icon: "👍", text: "مقبول: اتركيه يعمل" };
  return { key: "wait", icon: "⏳", text: "بيانات قليلة: انتظري قبل الحكم" };
}
function leadAdsHtml() {
  const { list, benchmark, range } = leadAdsRows();
  const totals = list.reduce((sum, item) => ({ spend: sum.spend + item.spend, contacts: sum.contacts + item.contacts, booked: sum.booked + item.booked, showed: sum.showed + item.showed, registered: sum.registered + item.registered }), { spend: 0, contacts: 0, booked: 0, showed: 0, registered: 0 });
  const per = (spend, count) => (count && spend ? money(spend / count) : "—");
  const top = list.filter((item) => ["scale", "stop", "fix"].includes(item.decision.key)).slice(0, 3);
  const cell = (cls, value, zero) => `<td class="${cls}${zero ? " is-zero" : ""}">${value}</td>`;
  const body = list.map((item) => `<tr class="la-ad-${item.decision.key}">
      <td><strong>${escapeHtml(item.name)}</strong><small>${item.code ? `${escapeHtml(item.code)} · ` : ""}${escapeHtml([item.campaignName, item.adSetName].filter(Boolean).join(" › "))}</small></td>
      ${cell("la-c-spend", `<span dir="ltr">${item.spend ? money(item.spend) : "—"}</span>`, !item.spend)}
      ${cell("la-c-contacts", number(item.contacts), !item.contacts)}
      ${cell("la-c-rdv", `<b>${number(item.booked)}</b>`, !item.booked)}
      ${cell("la-c-show", `<b>${number(item.showed + item.registered)}</b>`, !(item.showed + item.registered))}
      ${cell("la-c-reg", `<b>${number(item.registered)}</b>`, !item.registered)}
      ${cell("la-c-cost-rdv", `<span dir="ltr">${per(item.spend, item.booked)}</span>`, !item.booked)}
      ${cell("la-c-cost-reg", `<span dir="ltr">${per(item.spend, item.registered)}</span>`, !item.registered)}
      <td class="la-ad-decision">${item.decision.icon} ${escapeHtml(item.decision.text)}</td>
    </tr>`).join("");
  return `<details class="la-ads" open><summary><strong>📣 إعلانات الاستمارة: من يجلب المواعيد والتسجيلات؟</strong><small>${escapeHtml(range.from || "…")} ← ${escapeHtml(range.to || "اليوم")}</small></summary>
    ${leadSplitPeriodHtml()}
    <div class="la-ads-kpis">
      <div class="la-k-spend"><span>💸 المصروف</span><strong dir="ltr">${money(totals.spend)}</strong></div>
      <div><span>تواصلات</span><strong>${number(totals.contacts)}</strong></div>
      <div class="la-k-rdv"><span>📅 مواعيد</span><strong>${number(totals.booked)}</strong><small dir="ltr">${per(totals.spend, totals.booked)}</small></div>
      <div class="la-k-show"><span>🚶 حضور</span><strong>${number(totals.showed + totals.registered)}</strong></div>
      <div class="la-k-reg"><span>🎓 تسجيلات</span><strong>${number(totals.registered)}</strong><small dir="ltr">${per(totals.spend, totals.registered)}</small></div>
      <div><span>الربح التقديري</span><strong>${revenueMoney(revenueEstimate(totals.registered, totals.spend).profit)}</strong></div>
    </div>
    ${top.length ? `<ul class="la-ads-actions">${top.map((item) => `<li class="la-ad-${item.decision.key}">${item.decision.icon} <b>${escapeHtml(item.name)}</b>: ${escapeHtml(item.decision.text)}</li>`).join("")}</ul>` : ""}
    ${list.length ? `<div class="table-wrap la-table-wrap"><table class="la-table la-ads-table"><thead><tr><th>الإعلان</th><th class="la-c-spend">💸 المصروف</th><th class="la-c-contacts">💬 تواصلات</th><th class="la-c-rdv">📅 مواعيد</th><th class="la-c-show">🚶 حضور</th><th class="la-c-reg">🎓 تسجيل</th><th class="la-c-cost-rdv">تكلفة الموعد</th><th class="la-c-cost-reg">تكلفة التسجيل</th><th>القرار</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="la-empty">لا توجد رسائل من إعلانات الاستمارة في هذه الفترة.</p>'}
    <p class="la-hint">المرجع: متوسط تكلفة الموعد ${benchmark ? money(benchmark) : "—"} (يتغيّر مع بياناتك). الإيقاف عند صرف ضعفه بلا موعد. لا تعديل على الإعلانات من هنا: القرار لكِ في مدير الإعلانات.</p>
  </details>`;
}
function leadSplitPeriodHtml() {
  const range = leadSplitRange();
  return `<div class="la-split-period"><div class="la-split-presets" role="tablist">${SPLIT_PRESETS.map(([key, label]) => `<button type="button" role="tab" class="${range.preset === key ? "is-on" : ""}" aria-selected="${range.preset === key}" data-split-preset="${key}">${label}</button>`).join("")}</div>
    ${range.preset === "custom" ? `<div class="la-split-custom"><label><span>من</span><input type="date" value="${escapeHtml(range.from)}" data-split-custom="from" /></label><label><span>إلى</span><input type="date" value="${escapeHtml(range.to)}" data-split-custom="to" /></label></div>` : ""}
    <small>${range.from || range.to ? `${escapeHtml(range.from || "…")} ← ${escapeHtml(range.to || "اليوم")}` : "كل البيانات"} · حملات الاستمارة القديمة خارج المقارنة تلقائياً</small></div>`;
}
function setSplitPeriod(patch) {
  const next = { ...leadSplitPeriod(), ...patch };
  try { localStorage.setItem("cmcg-split-period", JSON.stringify(next)); } catch {}
  const box = document.getElementById("leadSplitTest");
  if (box) box.innerHTML = leadSplitTestHtml();
  const ads = document.getElementById("leadAds");
  if (ads) ads.innerHTML = leadAdsHtml();
}
const splitMedian = (list) => { if (!list.length) return null; const sorted = [...list].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
function splitDuration(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} د`;
  if (hours < 48) return `${Math.round(hours)} س`;
  return `${Math.round(hours / 24)} يوم`;
}
// Two-side daily bars (no dual axis: one chart per measure).
function splitDailyChart(sides, field, title, format) {
  const days = [...new Set([...Object.keys(sides.whatsapp.daily), ...Object.keys(sides.form.daily)])].sort().slice(-31);
  if (!days.length) return "";
  const value = (side, day) => Number(sides[side].daily[day]?.[field] || 0);
  const max = Math.max(...days.flatMap((day) => [value("whatsapp", day), value("form", day)]), 0);
  if (!max) return "";
  const width = 640, height = 150, pad = 18, slot = (width - pad * 2) / days.length, bar = Math.max(3, Math.min(14, slot / 2 - 2));
  const bars = days.map((day, index) => {
    const x = pad + index * slot + slot / 2;
    return ["whatsapp", "form"].map((side, n) => {
      const v = value(side, day);
      const h = v ? Math.max(3, (v / max) * (height - 34)) : 0;
      const bx = n ? x + 1 : x - bar - 1;
      return h ? `<rect class="la-bar-${side}" x="${bx.toFixed(1)}" y="${(height - 18 - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${day} · ${side === "form" ? "استمارة" : "واتساب"}: ${format(v)}</title></rect>` : "";
    }).join("") + (index % Math.ceil(days.length / 8) === 0 ? `<text x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle">${day.slice(8)}/${day.slice(5, 7)}</text>` : "");
  }).join("");
  return `<figure class="la-split-chart"><figcaption>${escapeHtml(title)} <small>الأعلى: ${escapeHtml(format(max))}</small></figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><line x1="${pad}" x2="${width - pad}" y1="${height - 18}" y2="${height - 18}" class="la-axis"/>${bars}</svg></figure>`;
}
function leadSplitTestHtml() {
  const sides = leadSplitData();
  const range = leadSplitRange();
  const periodNote = `<small class="la-split-note">📅 نفس فترة لوحة الإعلانات أعلاه: ${escapeHtml(range.from || "…")} ← ${escapeHtml(range.to || "اليوم")}</small>`;
  if (!sides.form.spend && !sides.form.contacts) {
    return `<section class="la-split"><div class="la-split-head"><h3>🧪 واتساب ضد الاستمارة</h3>${periodNote}</div><p class="la-empty">لا توجد بيانات للاستمارة في هذه الفترة.</p></section>`;
  }
  const per = (spend, count) => (count && spend ? spend / count : null);
  const rate = (a, b) => (b ? a / b : null);
  const names = { whatsapp: "واتساب", form: "الاستمارة" };
  const fmt = {
    money: (v) => (v === null ? "—" : money(v)),
    pct: (v) => (v === null ? "—" : `${number(Math.round(v * 1000) / 10)}%`),
    dh: (v) => revenueMoney(v),
    time: (v) => splitDuration(v),
    x: (v) => (v === null ? "—" : `×${number(Math.round(v * 10) / 10)}`),
    roi: (v) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${number(Math.round(v * 100))}%`),
    reg: (v) => (v === null ? "—" : `${number(Math.round(v * 10) / 10)} مسجّل`),
  };
  const metric = (key, icon, label, get, kind, better, weight) => {
    const a = get(sides.whatsapp), b = get(sides.form);
    let winner = "";
    if (better && sides.whatsapp.spend > 0 && sides.form.spend > 0 && a !== null && b !== null && a !== b) winner = (better === "low" ? a < b : a > b) ? "whatsapp" : "form";
    return { key, icon, label, a, b, kind, better, weight, winner };
  };
  const roas = (s) => revenueEstimate(s.registered, s.spend).roas;
  // ROI = (revenue - spend) / spend. "Expected" ROI projects registrations from RDVs
  // with the RDV->registration rate (own rate once a side has 5+ registrations,
  // otherwise the pooled rate of both sides), so a small, new side is judged fairly.
  const pooledBooked = sides.whatsapp.booked + sides.form.booked;
  const pooledRate = pooledBooked ? (sides.whatsapp.registered + sides.form.registered) / pooledBooked : 0;
  ["whatsapp", "form"].forEach((side) => {
    const s = sides[side];
    const est = revenueEstimate(s.registered, s.spend);
    const rateUsed = s.registered >= 5 && s.booked ? s.registered / s.booked : pooledRate;
    s.expectedReg = Math.max(s.registered, s.booked * rateUsed);
    s.roi = est.spendLocal > 0 ? (est.revenue - est.spendLocal) / est.spendLocal : null;
    s.expectedRoi = est.spendLocal > 0 ? (s.expectedReg * est.perStudent - est.spendLocal) / est.spendLocal : null;
    s.per100 = s.spend > 0 ? (s.expectedReg / s.spend) * 100 : null;
    s.rateUsed = rateUsed;
  });
  const duel = [
    metric("cpc", "💬", "ثمن الرسالة / التواصل", (s) => per(s.spend, s.contacts), "money", "low", 1),
    metric("cprdv", "📅", "ثمن الموعد", (s) => per(s.spend, s.booked), "money", "low", 3),
    metric("cpreg", "🎓", "ثمن المسجّل", (s) => per(s.spend, s.registered), "money", "low", 3),
    metric("c2r", "🎯", "تواصل ← موعد", (s) => rate(s.booked, s.contacts), "pct", "high", 2),
    metric("r2s", "🚶", "موعد ← حضور", (s) => rate(s.showed + s.registered, s.booked), "pct", "high", 1),
    metric("r2reg", "✍️", "موعد ← تسجيل", (s) => rate(s.registered, s.booked), "pct", "high", 2),
    metric("trdv", "⏱️", "الوقت حتى الموعد (الوسيط)", (s) => splitMedian(s.rdvHours), "time", "low", 1),
    metric("treg", "⏳", "الوقت حتى التسجيل (الوسيط)", (s) => splitMedian(s.regHours), "time", "low", 1),
    metric("eroi", "🚀", "ROI المتوقع (عند التوسيع)", (s) => s.expectedRoi, "roi", "high", 4),
    metric("roi", "📈", "ROI الفعلي", (s) => s.roi, "roi", "high", 2),
    metric("per100", "💵", "مسجّلون متوقعون لكل 100$", (s) => s.per100, "reg", "high", 2),
    metric("profit", "💰", "الربح التقديري", (s) => revenueEstimate(s.registered, s.spend).profit, "dh", "high", 1),
  ];
  const score = { whatsapp: 0, form: 0 };
  duel.forEach((row) => { if (row.winner) score[row.winner] += row.weight; });
  const enough = sides.whatsapp.registered >= 5 && sides.form.registered >= 5;
  const leader = score.whatsapp === score.form ? "" : score.whatsapp > score.form ? "whatsapp" : "form";
  const totalScore = score.whatsapp + score.form || 1;
  const verdict = !enough
    ? `⏳ من المبكر الحكم النهائي: يلزم 5 مسجلين على الأقل في كل جهة (حالياً ${sides.whatsapp.registered} واتساب، ${sides.form.registered} استمارة). اعتمدي الآن على <b>ثمن الموعد</b>.`
    : leader ? `🏆 <b>${names[leader]}</b> متفوّق بنقاط ${score[leader]} مقابل ${score[leader === "form" ? "whatsapp" : "form"]}.` : "🤝 تعادل في النقاط.";
  const better = sides.whatsapp.expectedRoi !== null && sides.form.expectedRoi !== null && sides.whatsapp.expectedRoi !== sides.form.expectedRoi
    ? (sides.whatsapp.expectedRoi > sides.form.expectedRoi ? "whatsapp" : "form") : "";
  const scaleTip = better ? `💡 <b>للتوسيع: ${names[better]}</b> · ROI متوقع <b>${fmt.roi(sides[better].expectedRoi)}</b> مقابل ${fmt.roi(sides[better === "form" ? "whatsapp" : "form"].expectedRoi)}. كل 100$ إضافية ≈ <b>${fmt.reg(sides[better].per100)}</b> (مقابل ${fmt.reg(sides[better === "form" ? "whatsapp" : "form"].per100)}).${sides[better].registered < 5 ? " <small>(تقدير من المواعيد بنسبة تسجيل " + number(Math.round(sides[better].rateUsed * 100)) + "%، يتأكد مع أول التسجيلات)</small>" : ""}` : "";
  const hero = (side) => {
    const s = sides[side];
    const profit = revenueEstimate(s.registered, s.spend).profit;
    return `<article class="la-duel-card la-side-${side}${leader === side ? " is-leader" : ""}">
      <header><span class="la-side-dot"></span><strong>${names[side]}</strong>${leader === side ? '<em class="la-medal">🥇 المتصدّر</em>' : ""}<b class="la-score">${score[side]} نقطة</b></header>
      <div class="la-duel-score"><i style="width:${Math.round((score[side] / totalScore) * 100)}%"></i></div>
      <div class="la-roi${better === side ? " is-best" : ""}${(s.expectedRoi ?? 0) < 0 ? " is-neg" : ""}">
        <div><span>🚀 ROI المتوقع</span><strong dir="ltr">${fmt.roi(s.expectedRoi)}</strong>${better === side ? '<em>🥇 الأفضل للتوسيع</em>' : ""}</div>
        <div class="la-roi-side"><span>📈 الفعلي</span><b dir="ltr">${fmt.roi(s.roi)}</b><span>💵 لكل 100$</span><b>${fmt.reg(s.per100)}</b></div>
      </div>
      <dl>
        <div><dt>💸 المصروف</dt><dd dir="ltr">${money(s.spend)}</dd></div>
        <div><dt>💬 التواصلات</dt><dd>${number(s.contacts)}</dd></div>
        <div class="is-key"><dt>📅 المواعيد</dt><dd>${number(s.booked)}</dd></div>
        <div><dt>🚶 الحضور</dt><dd>${number(s.showed + s.registered)}</dd></div>
        <div class="is-key"><dt>🎓 المسجلون</dt><dd>${number(s.registered)}</dd></div>
        <div><dt>💰 الربح</dt><dd>${revenueMoney(profit)}</dd></div>
      </dl>
    </article>`;
  };
  const duelRows = duel.map((row) => {
    const max = Math.max(Math.abs(row.a ?? 0), Math.abs(row.b ?? 0)) || 1;
    const bar = (v, side) => `<span class="la-duel-bar la-side-${side}"><i style="width:${!v ? 0 : Math.max(3, Math.round((Math.abs(v) / max) * 100))}%"></i></span>`;
    const val = (v, side) => `<span class="la-duel-val${row.winner === side ? " is-win" : ""}" dir="ltr">${row.winner === side ? "🥇 " : ""}${escapeHtml(fmt[row.kind](v))}</span>`;
    return `<div class="la-duel-row"><div class="la-duel-label">${row.icon} ${escapeHtml(row.label)}${row.better === "low" ? '<small>الأقل أفضل</small>' : ""}</div>
      <div class="la-duel-side">${val(row.a, "whatsapp")}${bar(row.a, "whatsapp")}</div>
      <div class="la-duel-side">${val(row.b, "form")}${bar(row.b, "form")}</div></div>`;
  }).join("");
  const funnel = (side) => {
    const s = sides[side];
    const steps = [["💬", "تواصل", s.contacts], ["📅", "موعد", s.booked], ["🚶", "حضور", s.showed + s.registered], ["🎓", "تسجيل", s.registered]];
    const top = steps[0][2] || 1;
    return `<div class="la-funnel la-side-${side}"><h4><span class="la-side-dot"></span>${names[side]}</h4>${steps.map(([icon, label, count], index) => {
      const prev = index ? steps[index - 1][2] : 0;
      return `<div class="la-funnel-step"><span>${icon} ${label}</span><span class="la-funnel-track"><i style="width:${count ? Math.max(4, Math.sqrt(count / top) * 100) : 0}%"></i></span><b>${number(count)}</b><small>${index ? (prev ? `${number(Math.round((count / prev) * 1000) / 10)}%` : "—") : ""}</small></div>`;
    }).join("")}</div>`;
  };
  const autoLabel = { form: "استمارة", whatsapp: "واتساب", exclude: "خارج المقارنة" };
  const campaigns = state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name));
  const table = duel.map((row) => `<tr><th>${row.icon} ${escapeHtml(row.label)}</th><td dir="ltr">${escapeHtml(fmt[row.kind](row.a))}</td><td dir="ltr">${escapeHtml(fmt[row.kind](row.b))}</td></tr>`).join("");
  return `<section class="la-split la-split-v2">
    <div class="la-split-head"><h3>🧪 واتساب ضد الاستمارة</h3>${periodNote}</div>
    <p class="la-split-verdict${enough ? " is-ready" : ""}">${verdict}</p>
    ${scaleTip ? `<p class="la-scale-tip">${scaleTip}</p>` : ""}
    <div class="la-duel-cards">${hero("whatsapp")}${hero("form")}</div>
    <div class="la-duel"><div class="la-duel-row la-duel-headrow"><div></div><div class="la-side-whatsapp"><span class="la-side-dot"></span>واتساب</div><div class="la-side-form"><span class="la-side-dot"></span>الاستمارة</div></div>${duelRows}</div>
    <div class="la-funnels">${funnel("whatsapp")}${funnel("form")}</div>
    <div class="la-split-charts">${splitDailyChart(sides, "booked", "📅 المواعيد يومياً", (v) => number(v))}${splitDailyChart(sides, "spend", "💸 المصروف يومياً", (v) => money(v))}</div>
    <div class="la-split-legend"><span><span class="la-side-dot la-side-whatsapp"></span> واتساب</span><span><span class="la-side-dot la-side-form"></span> الاستمارة</span><small>النقاط: ROI المتوقع ×4، ثمن الموعد والمسجّل ×3، ROI الفعلي والتحويلات ×2، الباقي ×1. ROI = (الإيراد − المصروف) ÷ المصروف.</small></div>
    <details class="la-channels"><summary>📋 الجدول الكامل</summary><div class="table-wrap la-table-wrap"><table class="la-table la-split-table"><thead><tr><th></th><th>واتساب</th><th>الاستمارة</th></tr></thead><tbody>${table}</tbody></table></div></details>
    <details class="la-channels"><summary>أي حملة في أي جهة؟</summary><div class="la-channel-list">${campaigns.map((campaign) => `<label><span>${escapeHtml(campaign.name)}</span><select data-lead-channel="${escapeHtml(campaign.id)}"><option value="">تلقائي (${autoLabel[leadAutoChannel(campaign)]})</option><option value="whatsapp" ${state.settings?.channelOverrides?.[campaign.id] === "whatsapp" ? "selected" : ""}>واتساب</option><option value="form" ${state.settings?.channelOverrides?.[campaign.id] === "form" ? "selected" : ""}>استمارة</option><option value="exclude" ${state.settings?.channelOverrides?.[campaign.id] === "exclude" ? "selected" : ""}>خارج المقارنة</option></select></label>`).join("")}</div></details>
  </section>`;
}

// ---------- events ----------
async function leadSave(id, body, message) {
  const updated = await api(`/api/crm-leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
  const index = state.crmLeads.findIndex((lead) => lead.id === id);
  if (index >= 0) state.crmLeads[index] = updated;
  if (message) toast(message);
  await load(); // outcomes, stats and every screen stay in step
  if (LEAD_UI.detailId === id && document.getElementById("leadDialog")?.open) renderLeadDetail();
  return updated;
}
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

const LEAD_VIEW_ONLY_OK = "[data-lead-view], [data-lead-close], [data-lead-jump], [data-detail-back], [data-view-as-exit], [data-lead-open], [data-quick-status], [data-split-preset]";
async function handleLeadClick(event) {
  const target = event.target;
  if (leadReadOnly()) {
    const control = target.closest("a, button");
    if (control && !control.matches(LEAD_VIEW_ONLY_OK)) {
      event.preventDefault();
      event.stopPropagation();
      toast("👁️ وضع المشاهدة: لا يمكنك تعديل أي شيء", "error");
      return;
    }
  }
  const demoBtn = target.closest("[data-demo]");
  if (demoBtn) {
    const remove = demoBtn.dataset.demo === "remove";
    if (remove && !window.confirm("حذف كل الرسائل التجريبية؟")) return;
    try {
      const res = await api("/api/crm-leads/demo", { method: "POST", body: JSON.stringify({ action: remove ? "remove" : "create" }) });
      toast(remove ? `🗑️ حُذفت ${res.removed} رسالة تجريبية` : `🧪 أُضيفت ${res.created} رسائل تجريبية (2 لكل مستشارة)`);
      await load();
    } catch (error) { toast(error.message, "error"); }
    return;
  }
  const pauseBtn = target.closest("[data-agent-pause]");
  if (pauseBtn) {
    const id = pauseBtn.dataset.agentPause;
    const paused = leadAgentSetting(id).active === false;
    try { await saveAgentSetting(id, { active: paused }, paused ? `▶️ ${leadAgentName(id)} عادت تستقبل الرسائل` : `⏸️ ${leadAgentName(id)} لم تعد تستقبل رسائل جديدة`); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const hideBtn = target.closest("[data-agent-hide], [data-agent-show]");
  if (hideBtn) {
    const hide = Boolean(hideBtn.dataset.agentHide);
    const id = hideBtn.dataset.agentHide || hideBtn.dataset.agentShow;
    if (hide) {
      const open = leadsList().filter((lead) => lead.agentId === id && !["registered", "not_interested", "other_city", "not_qualified", "wrong_number"].includes(lead.status)).length;
      if (!window.confirm(`إخفاء ${leadAgentName(id)} من الرسائل؟ لن تستقبل رسائل جديدة${open ? `، ولديها ${open} رسالة مفتوحة: حوّليها من «🔀 تحويل الرسائل»` : ""}.`)) return;
    }
    try { await saveAgentSetting(id, hide ? { hidden: true, active: false } : { hidden: false }, hide ? "🙈 أُخفيت من الرسائل" : "👀 عادت إلى الرسائل"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const transferFrom = target.closest("[data-transfer-from]");
  if (transferFrom) { openTransfer(transferFrom.dataset.transferFrom || "__all"); return; }
  if (LEAD_UI.transfer && document.getElementById("leadDialog")?.open) {
    const t = LEAD_UI.transfer;
    const setFrom = target.closest("[data-transfer-set-from]");
    if (setFrom) { t.from = setFrom.dataset.transferSetFrom; renderTransfer(); return; }
    const status = target.closest("[data-transfer-status]");
    if (status) { const key = status.dataset.transferStatus; t.statuses = t.statuses.includes(key) ? t.statuses.filter((item) => item !== key) : [...t.statuses, key]; renderTransfer(); return; }
    const mode = target.closest("[data-transfer-mode]");
    if (mode) { t.mode = mode.dataset.transferMode; renderTransfer(); return; }
    const to = target.closest("[data-transfer-to]");
    if (to) { const key = to.dataset.transferTo; t.to = t.to.includes(key) ? t.to.filter((item) => item !== key) : [...t.to, key]; renderTransfer(); return; }
    const one = target.closest("[data-transfer-one]");
    if (one) { t.one = one.dataset.transferOne; renderTransfer(); return; }
    if (target.closest("[data-transfer-confirm]")) {
      const { fromIds, targets } = transferPlan();
      try {
        const result = await api("/api/crm-leads/transfer", { method: "POST", body: JSON.stringify({ from: fromIds, statuses: t.statuses, to: targets }) });
        LEAD_UI.transfer = null;
        document.getElementById("leadDialog")?.close();
        toast(`🔀 حُوّل ${result.moved} رسالة`);
        await load();
      } catch (error) { toast(error.message, "error"); }
      return;
    }
  }
  if (target.closest("[data-view-as-exit]")) { LEAD_UI.viewAs = ""; renderLeads(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const viewAs = target.closest("[data-view-as]");
  if (viewAs) { LEAD_UI.viewAs = viewAs.dataset.viewAs; LEAD_UI.view = "today"; renderLeads(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const linkButton = target.closest("[data-agent-link], [data-agent-link-revoke]");
  if (linkButton) {
    const revoke = Boolean(linkButton.dataset.agentLinkRevoke);
    const agentId = linkButton.dataset.agentLink || linkButton.dataset.agentLinkRevoke;
    const agent = leadAgent(agentId);
    if ((revoke || agent?.accessToken) && !window.confirm(revoke ? "إيقاف هذا الرابط؟ لن تتمكن المستشارة من الدخول حتى ترسلي لها رابطاً جديداً." : "تغيير الرابط؟ سيتوقف القديم عن العمل.")) return;
    try { await api(`/api/agents/${encodeURIComponent(agentId)}/access-link`, { method: revoke ? "DELETE" : "POST", body: "{}" }); LEAD_UI.settingsOpen = true; await load(); toast(revoke ? "أُوقف الرابط" : "الرابط جاهز ✓"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-push-enable]")) { enablePush().catch((error) => toast(error.message || "تعذّر تفعيل التنبيهات", "error")); return; }
  if (target.closest("[data-push-ios]")) { openIosHelp(); return; }
  if (target.closest("[data-push-test]")) { api("/api/push/test", { method: "POST", body: "{}" }).then((res) => toast(res.sent ? "🔔 أُرسل إشعار تجريبي" : "⚠️ لم يصل الإشعار، أعيدي التفعيل", res.sent ? undefined : "error")).catch((error) => toast(error.message, "error")); return; }
  const contact = target.closest("[data-lead-contact]");
  if (contact) {
    const kind = contact.dataset.kind;
    const id = contact.dataset.leadContact;
    if (kind === "reminder") {
      leadSave(id, { contacted: "reminder", reminded: true }, "🔔 سُجّل إرسال التذكير").catch(() => {});
    } else {
      // Log the tap right away (traceable), then ask for the result when the agent comes back.
      api(`/api/crm-leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ tap: kind === "call" ? "call" : "whatsapp" }) }).catch(() => {});
      setPendingCall({ leadId: id, kind, at: Date.now() });
      setTimeout(() => { if (pendingCall()?.leadId === id) openCallSheet(id, kind); }, 900);
    }
    event.stopPropagation();
    return;
  }
  if (target.closest(".la-actions a")) { event.stopPropagation(); return; }
  if (target.closest("[data-lead-close]")) { document.getElementById("leadDialog")?.close(); return; }

  // After-call sheet
  const result = target.closest("[data-call-result]");
  if (result && LEAD_UI.sheet) {
    const status = result.dataset.callResult;
    if (status === "booked" || status === "callback") { LEAD_UI.sheet.step = status; LEAD_UI.pick = { day: "", time: "" }; renderCallSheet(); return; }
    await saveCallResult({ status }, `${LEAD_STATUS[status].icon} ${LEAD_STATUS[status].label} · ${cheer()}`);
    return;
  }
  if (target.closest("[data-sheet-back]") && LEAD_UI.sheet) { LEAD_UI.sheet.step = "pick"; renderCallSheet(); return; }
  if (target.closest("[data-call-skip]")) { setPendingCall(null); LEAD_UI.sheet = null; document.getElementById("leadSheet")?.close(); return; }

  // Pickers (sheet or detail)
  const day = target.closest("[data-pick-day]");
  if (day) { LEAD_UI.pick = { day: day.dataset.pickDay, time: rdvSlotPast(day.dataset.pickDay, LEAD_UI.pick.time || "00:00") ? "" : LEAD_UI.pick.time }; rerenderPicker(); return; }
  const time = target.closest("[data-pick-time]");
  if (time && !time.disabled) { LEAD_UI.pick.time = time.dataset.pickTime; rerenderPicker(); return; }
  if (target.closest("[data-pick-confirm]") && LEAD_UI.pick.day && LEAD_UI.pick.time) {
    const appointmentAt = `${LEAD_UI.pick.day}T${LEAD_UI.pick.time}`;
    const message = `📅 موعد ${leadDayName(LEAD_UI.pick.day)} على ${LEAD_UI.pick.time} · ${cheer()}`;
    if (LEAD_UI.sheet) await saveCallResult({ status: "booked", appointmentAt }, message);
    else if (LEAD_UI.detailId) {
      try { await leadSave(LEAD_UI.detailId, { status: "booked", appointmentAt }, message); LEAD_UI.detailStep = ""; renderLeadDetail(); celebrate(); } catch (error) { toast(error.message, "error"); }
    }
    return;
  }
  const callbackAt = target.closest("[data-callback-at]");
  if (callbackAt) {
    const message = `⏳ سنذكّرك ${leadWhen(callbackAt.dataset.callbackAt)}`;
    if (LEAD_UI.sheet) await saveCallResult({ status: "callback", callbackAt: callbackAt.dataset.callbackAt }, message);
    else if (LEAD_UI.detailId) {
      try { await leadSave(LEAD_UI.detailId, { status: "callback", callbackAt: callbackAt.dataset.callbackAt }, message); LEAD_UI.detailStep = ""; renderLeadDetail(); } catch (error) { toast(error.message, "error"); }
    }
    return;
  }

  // Detail
  const detailStatus = target.closest("[data-detail-status]");
  if (detailStatus && LEAD_UI.detailId) {
    const status = detailStatus.dataset.detailStatus;
    if (status === "booked" || status === "callback") { LEAD_UI.detailStep = status === "booked" ? "rdv" : "callback"; LEAD_UI.pick = { day: "", time: "" }; renderLeadDetail(); return; }
    try { await leadSave(LEAD_UI.detailId, { status }, `${LEAD_STATUS[status].icon} ${LEAD_STATUS[status].label} · ${cheer()}`); if (status === "registered") celebrate(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const detailStep = target.closest("[data-detail-step]");
  if (detailStep) { LEAD_UI.detailStep = detailStep.dataset.detailStep; LEAD_UI.pick = { day: "", time: "" }; renderLeadDetail(); return; }
  if (target.closest("[data-detail-back]")) { LEAD_UI.detailStep = ""; renderLeadDetail(); return; }

  // Page
  const jump = target.closest("[data-lead-jump]");
  if (jump) { LEAD_UI.view = "today"; LEAD_UI.status = ""; renderLeads(); document.getElementById(`la-sec-${jump.dataset.leadJump}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const splitPreset = target.closest("[data-split-preset]");
  if (splitPreset) { setSplitPeriod({ preset: splitPreset.dataset.splitPreset }); return; }
  const quick = target.closest("[data-quick-status]");
  if (quick) { LEAD_UI.status = LEAD_UI.status === quick.dataset.quickStatus ? "" : quick.dataset.quickStatus; renderLeads(); return; }
  const view = target.closest("[data-lead-view]");
  if (view) { LEAD_UI.view = view.dataset.leadView; try { localStorage.setItem("cmcg-leads-view", LEAD_UI.view); } catch {} renderLeads(); return; }
  if (target.closest("[data-lead-new]")) { openNewLeadForm(); return; }
  if (target.closest("[data-lead-delete]") && LEAD_UI.detailId) {
    const lead = leadById(LEAD_UI.detailId);
    if (!lead || !window.confirm(`حذف ${lead.name || leadPhoneLabel(lead.phone)} نهائياً؟`)) return;
    try { await api(`/api/crm-leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" }); document.getElementById("leadDialog")?.close(); toast("حُذفت الرسالة"); await load(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-lead-redistribute]")) {
    try { const res = await api("/api/crm-leads/redistribute", { method: "POST", body: "{}" }); toast(`وُزّع ${res.assigned} رسالة`); await load(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.closest("[data-lead-token]")) {
    if (state.settings?.leadIntake?.token && !window.confirm("تغيير الرابط؟ يجب تغييره أيضاً في الكود داخل الورقة.")) return;
    try { await api("/api/lead-intake/token", { method: "POST", body: "{}" }); LEAD_UI.settingsOpen = true; await load(); toast("الرابط جاهز"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  const copy = target.closest("[data-lead-copy], [data-lead-copy-script]");
  if (copy) {
    const token = state.settings?.leadIntake?.token || "";
    const text = copy.dataset.leadCopy || leadAppsScript(`${window.location.origin}/api/lead-intake?token=${token}`);
    try { await navigator.clipboard.writeText(text); toast("تم النسخ ✓"); } catch { toast("حدّدي النص وانسخيه يدوياً", "error"); }
    return;
  }
  const settings = target.closest("[data-lead-settings] > summary");
  if (settings) { LEAD_UI.settingsOpen = !settings.parentElement.open; return; }
  const card = target.closest("[data-lead-open]");
  if (card) openLeadDetail(card.dataset.leadOpen);
}

function rerenderPicker() {
  if (LEAD_UI.sheet) renderCallSheet();
  else if (LEAD_UI.detailId) renderLeadDetail();
}

async function handleLeadChange(event) {
  const target = event.target;
  const filter = target.closest("[data-lead-filter]");
  if (filter && filter.dataset.leadFilter !== "search") { LEAD_UI[filter.dataset.leadFilter] = filter.value; renderLeads(); return; }
  if (target.matches("[data-lead-reassign]")) {
    try { await leadSave(target.dataset.leadReassign, { agentId: target.value }, "حُوّلت الرسالة"); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.matches("[data-split-custom]")) { setSplitPeriod({ preset: "custom", [target.dataset.splitCustom]: target.value }); return; }
  if (target.matches("[data-lead-channel]")) {
    try { await api("/api/settings/channels", { method: "POST", body: JSON.stringify({ campaignId: target.dataset.leadChannel, channel: target.value }) }); await load(); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (target.matches("[data-lead-csv]") && target.files?.[0]) {
    try {
      const csv = await target.files[0].text();
      const res = await api("/api/crm-leads/import", { method: "POST", body: JSON.stringify({ csv }) });
      toast(`${res.added} رسالة جديدة، ${res.updated} موجودة مسبقاً${res.test ? `، ${res.test} رسالة تجريبية تم تجاهلها` : ""}`);
      await load();
    } catch (error) { toast(error.message, "error"); }
    target.value = "";
    return;
  }
  if (target.matches('[data-lead-distribution-form] [name="mode"]')) {
    target.closest("form").querySelectorAll(".la-mode").forEach((item) => item.classList.toggle("is-on", item.contains(target)));
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
  if (!form.matches("[data-lead-notes-form], [data-lead-new-form], [data-lead-distribution-form], [data-lead-templates-form], [data-lead-sheet-form]")) return;
  event.preventDefault();
  event.stopPropagation(); // keep the app's generic form handler out of it
  if (leadReadOnly()) { toast("👁️ وضع المشاهدة: لا يمكنك تعديل أي شيء", "error"); return; }
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (form.matches("[data-lead-sheet-form]")) {
      const res = await api("/api/crm-leads/sync", { method: "POST", body: JSON.stringify({ sheetUrl: form.elements.sheetUrl.value.trim() }) });
      LEAD_UI.settingsOpen = true;
      await load();
      toast(res.sync?.error ? `⚠️ ${res.sync.error}` : `✅ تمت المزامنة · ${number(res.sync?.added || 0)} رسالة جديدة`, res.sync?.error ? "error" : undefined);
    } else if (form.matches("[data-lead-notes-form]")) {
      await leadSave(LEAD_UI.detailId, { notes: form.elements.notes.value }, "📝 حُفظت الملاحظة");
    } else if (form.matches("[data-lead-new-form]")) {
      const body = Object.fromEntries(new FormData(form).entries());
      const lead = await api("/api/crm-leads", { method: "POST", body: JSON.stringify({ ...body, source: "whatsapp" }) });
      toast(`أُضيفت الرسالة · ${cheer()}`);
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
      toast("حُفظ التوزيع ✓");
      await load();
    } else if (form.matches("[data-lead-templates-form]")) {
      await api("/api/settings/lead-distribution", { method: "POST", body: JSON.stringify({ templates: { first: form.elements.first.value, reminder: form.elements.reminder.value } }) });
      LEAD_UI.settingsOpen = true;
      toast("حُفظت الرسائل ✓");
      await load();
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

// When the agent comes back from the phone or WhatsApp, ask for the result.
function resumePendingCall() {
  const pending = pendingCall();
  if (!pending || !state || leadReadOnly()) return;
  if (Date.now() - pending.at > 6 * 3600000) { setPendingCall(null); return; }
  if (!document.getElementById("leadSheet")?.open) openCallSheet(pending.leadId, pending.kind);
}

(function bindLeads() {
  const root = document.getElementById("leadsRoot");
  if (!root) return;
  root.addEventListener("click", handleLeadClick);
  root.addEventListener("change", handleLeadChange);
  root.addEventListener("input", handleLeadInput);
  root.addEventListener("submit", handleLeadSubmit);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches(".la-card")) openLeadDetail(event.target.dataset.leadOpen);
  });
  ensureLeadDialog();
  ensureSheet();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(resumePendingCall, 300); });
  window.addEventListener("focus", () => setTimeout(resumePendingCall, 300));
  // Keep ages, today's lists and the goal ring fresh while the page stays open.
  setInterval(refreshLeadsQuietly, 30000);
  const waitForState = setInterval(() => { if (state) { clearInterval(waitForState); resumePendingCall(); refreshPushState(); handleDeepLink(); } }, 500);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type === "cmcg-push" && !document.hidden && message.data?.leadId && message.data.level === 0 && !message.data.admin) {
        const lead = leadById(message.data.leadId);
        startLeadAlarm(lead || { id: message.data.leadId, name: (message.data.title || "").replace(/^.*?:\s*/, ""), phone: message.data.phone });
        refreshLeadsQuietly();
      }
      if (message.type === "cmcg-open" && message.url) { window.location.hash = message.url.split("#")[1] || "view=leads"; handleDeepLink(); }
    });
  }
  window.addEventListener("hashchange", handleDeepLink);
})();
