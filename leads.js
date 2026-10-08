// Lead pipeline: Meta lead-form rows (via Google Sheets or CSV) and WhatsApp leads,
// matched to the ad that produced them, distributed to sales agents, and kept in
// step with the CRM outcomes (RDV / visit / registration) as their status changes.
const crypto = require("crypto");

const LEAD_STATUSES = ["new", "no_answer", "callback", "contacted", "booked", "visited", "registered", "not_interested", "other_city", "not_qualified", "wrong_number"];
const CLOSED_STATUSES = new Set(["registered", "not_interested", "other_city", "not_qualified", "wrong_number"]);
// The centre receives visitors from 11:00 to 20:00; the last RDV starts at 19:30.
const OPENING = { open: "11:00", lastSlot: "19:30" };
const DISTRIBUTION_MODES = ["balanced", "weighted", "adset", "manual"];

const DEFAULT_TEMPLATES = {
  first: "السلام عليكم {name} 🌸\nمعاك {agent} من مركز CMCG للتكوين بطنجة.\nشكراً بزاف على اهتمامك بالتكوينات ديالنا 🙏\nإمتى يناسبك نتواصلو باش نشرح ليك كلشي بالتفصيل؟",
  reminder: "السلام عليكم {name} 🌸\nكنتمناو تكون بألف خير 😊\nمعاك {agent} من مركز CMCG للتكوين بطنجة.\nبغينا غير نفكروك بالموعد ديالك معانا {day} على الساعة {time} ⏰\n\nإلا كان عندك أي سؤال، ولا بغيتي نصيفطو ليك موقع المركز 📍، ولا محتاج أي مساعدة، غير جاوبنا هنا وحنا رهن الإشارة.\n\nكنتسناوك بكل فرح، ومرحبا بك ديما عندنا 🤍",
};
// Earlier French defaults: replaced by the Arabic ones when nobody customised them.
const OLD_DEFAULTS = new Set([
  "Bonjour {name}, ici {agent} du centre CMCG Tanger. Merci pour votre demande d'information sur nos formations. Quand êtes-vous disponible pour en parler ?",
  "Bonjour {name}, ici {agent} du centre CMCG Tanger. Je vous rappelle votre rendez-vous {day} à {time}. À bientôt !",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function now() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

// Header -> field. Meta's Sheets integration, its CSV download, Zapier and French labels.
const FIELD_ALIASES = {
  externalId: ["id", "lead_id", "leadgen_id", "lead id", "id du prospect"],
  createdTime: ["created_time", "created time", "date", "created", "submitted_at", "date de création", "heure de création"],
  fullName: ["full_name", "full name", "name", "nom complet", "nom et prénom", "nom", "الاسم الكامل", "الاسم"],
  firstName: ["first_name", "first name", "prénom"],
  lastName: ["last_name", "last name", "nom de famille"],
  phone: ["phone_number", "phone number", "phone", "numéro de téléphone", "téléphone", "telephone", "mobile", "whatsapp", "رقم الهاتف", "الهاتف"],
  email: ["email", "e-mail", "adresse e-mail", "البريد الإلكتروني"],
  city: ["city", "ville", "المدينة"],
  adId: ["ad_id", "ad id", "id de la publicité"],
  adName: ["ad_name", "ad name", "nom de la publicité"],
  adSetId: ["adset_id", "ad_set_id", "ad set id", "id de l'ensemble de publicités"],
  adSetName: ["adset_name", "ad_set_name", "ad set name", "nom de l'ensemble de publicités"],
  campaignId: ["campaign_id", "campaign id", "id de la campagne"],
  campaignName: ["campaign_name", "campaign name", "nom de la campagne"],
  formId: ["form_id", "form id"],
  formName: ["form_name", "form name", "nom du formulaire"],
  platform: ["platform", "plateforme"],
  isOrganic: ["is_organic", "organic"],
};
const HEADER_TO_FIELD = new Map();
Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => aliases.forEach((alias) => HEADER_TO_FIELD.set(alias, field)));
const HIDDEN_FIELDS = new Set(["lead_status", "inbox_url", "is_organic"]);

function headerKey(header) {
  return clean(header).toLocaleLowerCase().replace(/[?:*]+$/g, "").trim();
}

// Meta prefixes exported values: "p:+2126…", "ag:120…", "as:…", "c:…", "l:…", "f:…".
function stripMetaPrefix(value) {
  return clean(value).replace(/^(?:p|ag|as|c|l|f):/i, "");
}

// Moroccan numbers to international digits for wa.me / tel: (0612345678 -> 212612345678).
function normalizePhone(value, defaultCountry = "212") {
  let digits = stripMetaPrefix(value).replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits.slice(1).replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith(defaultCountry)) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `${defaultCountry}${digits.slice(1)}`;
  if (digits.length === 9 && /^[5-7]/.test(digits)) return `${defaultCountry}${digits}`;
  return digits;
}

function toIsoDate(value) {
  const text = clean(value);
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
  }
  return "";
}

// One sheet / CSV row -> lead fields. Unknown columns are the form's own questions.
// Meta's "Test lead" tool fills every column with "<test lead: dummy data for …>".
function isTestRow(row) {
  return Object.values(row || {}).some((value) => /^(?:p:)?<test lead/i.test(clean(value)));
}

function normalizeLeadRow(row) {
  const lead = { answers: {} };
  Object.entries(row || {}).forEach(([header, raw]) => {
    const key = headerKey(header);
    const value = clean(raw);
    if (!key || value === "") return;
    const field = HEADER_TO_FIELD.get(key);
    if (field) {
      if (!lead[field]) lead[field] = value;
    } else if (!HIDDEN_FIELDS.has(key)) {
      lead.answers[clean(header).replace(/_/g, " ")] = value;
    }
  });
  ["externalId", "adId", "adSetId", "campaignId", "formId"].forEach((field) => { if (lead[field]) lead[field] = stripMetaPrefix(lead[field]); });
  const fullName = clean(lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" "));
  return {
    externalId: lead.externalId || "",
    createdAt: toIsoDate(lead.createdTime) || now(),
    name: fullName,
    phone: normalizePhone(lead.phone),
    phoneRaw: stripMetaPrefix(lead.phone),
    email: clean(lead.email),
    city: clean(lead.city),
    meta: {
      adId: lead.adId || "",
      adName: clean(lead.adName),
      adSetId: lead.adSetId || "",
      adSetName: clean(lead.adSetName),
      campaignId: lead.campaignId || "",
      campaignName: clean(lead.campaignName),
      formId: lead.formId || "",
      formName: clean(lead.formName),
      platform: clean(lead.platform),
    },
    answers: lead.answers,
  };
}

const lower = (value) => clean(value).toLocaleLowerCase();

// Link a lead to the CRM's ad / ad set / campaign by Meta IDs, then by names.
function attributeLead(state, lead) {
  const meta = lead.meta || {};
  let ad = meta.adId ? state.creatives.find((item) => item.metaAdId === meta.adId) : null;
  let adSet = meta.adSetId ? state.adSets.find((item) => item.metaAdSetId === meta.adSetId) : null;
  let campaign = meta.campaignId ? state.campaigns.find((item) => item.metaCampaignId === meta.campaignId) : null;
  if (!campaign && meta.campaignName) campaign = state.campaigns.find((item) => lower(item.name) === lower(meta.campaignName)) || null;
  if (!adSet && meta.adSetName) adSet = state.adSets.find((item) => lower(item.name) === lower(meta.adSetName) && (!campaign || item.campaignId === campaign.id)) || null;
  if (!ad && meta.adName) ad = state.creatives.find((item) => lower(item.name) === lower(meta.adName) && (!adSet || item.adSetId === adSet.id)) || null;
  if (ad && !adSet) adSet = state.adSets.find((item) => item.id === ad.adSetId) || null;
  if (adSet && !campaign) campaign = state.campaigns.find((item) => item.id === adSet.campaignId) || null;
  return { creativeId: ad?.id || "", adSetId: adSet?.id || "", campaignId: campaign?.id || "" };
}

// Templates keep their line breaks (WhatsApp shows them); only trim each line.
function templateText(value, fallback) {
  const text = String(value ?? "").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").trim();
  return !text || OLD_DEFAULTS.has(text) ? fallback : text;
}

// "2026-10-10T19:30" -> null when inside opening hours, else the error to show.
function appointmentError(value) {
  const match = String(value || "").match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const time = `${match[1]}:${match[2]}`;
  return time < OPENING.open || time > OPENING.lastSlot ? "المركز مفتوح من 11:00 إلى 20:00، اختاري موعداً بين 11:00 و19:30" : null;
}

function defaultDistribution() {
  return { mode: "balanced", agents: {}, templates: { ...DEFAULT_TEMPLATES } };
}

function normalizeDistribution(input = {}) {
  const base = defaultDistribution();
  const agents = {};
  Object.entries(input.agents || {}).forEach(([agentId, value]) => {
    const weight = Number(value?.weight);
    agents[agentId] = { active: value?.active !== false, hidden: value?.hidden === true, weight: Number.isFinite(weight) && weight >= 0 ? Math.round(weight * 100) / 100 : 1 };
  });
  return {
    mode: DISTRIBUTION_MODES.includes(input.mode) ? input.mode : base.mode,
    agents,
    templates: {
      first: templateText(input.templates?.first, base.templates.first),
      reminder: templateText(input.templates?.reminder, base.templates.reminder),
    },
  };
}

function agentSetting(distribution, agentId) {
  return distribution.agents[agentId] || { active: true, weight: 1 };
}

// Who gets the next lead. balanced: fewest leads today, then this week.
// weighted: leads in the last 30 days in proportion to each agent's weight.
// adset: the agent named in the ad set, else balanced. manual: nobody.
function pickAgent(state, lead, distribution, at = new Date()) {
  const mode = distribution.mode;
  if (mode === "manual") return "";
  const pool = state.agents.filter((agent) => agent.active !== false && agentSetting(distribution, agent.id).active && !agentSetting(distribution, agent.id).hidden && (mode !== "weighted" || agentSetting(distribution, agent.id).weight > 0));
  if (mode === "adset" && lead.adSetId) {
    const adSet = state.adSets.find((item) => item.id === lead.adSetId);
    if (adSet?.agentId && pool.some((agent) => agent.id === adSet.agentId)) return adSet.agentId;
  }
  if (!pool.length) return "";
  const day = at.toISOString().slice(0, 10);
  const weekAgo = new Date(at.getTime() - 7 * 86400000).toISOString();
  const monthAgo = new Date(at.getTime() - 30 * 86400000).toISOString();
  const count = (agentId, since) => (state.crmLeads || []).filter((item) => item.agentId === agentId && item.source === "form" && (item.assignedAt || item.createdAt) >= since).length;
  const scored = pool.map((agent) => {
    const today = count(agent.id, `${day}T00:00:00.000Z`);
    const week = count(agent.id, weekAgo);
    const month = count(agent.id, monthAgo);
    const weight = agentSetting(distribution, agent.id).weight || 1;
    return { id: agent.id, name: agent.name, key: mode === "weighted" ? [month / weight, today / weight] : [today, week] };
  });
  scored.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || String(a.name).localeCompare(String(b.name)));
  return scored[0].id;
}

function pushHistory(lead, type, details = {}, by = "") {
  lead.history = Array.isArray(lead.history) ? lead.history : [];
  lead.history.push({ at: now(), type, by, ...details });
}

// Keep CRM outcomes in step with the lead: an RDV once booked stays a "booked"
// outcome; "visited" adds a "showed" (visited without registering); "registered"
// replaces it with "registered". Outcomes carry leadId so they never duplicate.
function syncLeadOutcomes(state, lead) {
  // Demo leads never touch the ad results.
  if (lead.demo) { state.outcomes = state.outcomes.filter((outcome) => outcome.leadId !== lead.id); return; }
  const wanted = new Map();
  const day = (iso) => String(iso || "").slice(0, 10);
  const firstContact = day(lead.createdAt);
  if (lead.bookedAt) wanted.set("booked", day(lead.bookedAt));
  if (lead.status === "registered") wanted.set("registered", day(lead.registeredAt || lead.statusAt));
  else if (lead.status === "visited") wanted.set("showed", day(lead.visitedAt || lead.statusAt));
  state.outcomes = state.outcomes.filter((outcome) => outcome.leadId !== lead.id || wanted.has(outcome.type));
  const level = lead.creativeId ? "ad" : lead.adSetId ? "adSet" : lead.campaignId ? "campaign" : lead.agentId ? "agent" : "";
  if (!level) return;
  const targetId = lead.creativeId || lead.adSetId || lead.campaignId || lead.agentId;
  wanted.forEach((date, type) => {
    let outcome = state.outcomes.find((item) => item.leadId === lead.id && item.type === type);
    if (!outcome) {
      outcome = { id: newId("out"), leadId: lead.id, type, auto: true, createdAt: now() };
      state.outcomes.push(outcome);
    }
    Object.assign(outcome, {
      assignmentLevel: level,
      targetId,
      creativeId: lead.creativeId || "",
      adSetId: lead.adSetId || "",
      campaignId: lead.campaignId || "",
      agentId: lead.agentId || "",
      personName: lead.name || "",
      phone: lead.phone || "",
      date: date || day(now()),
      sourceDate: firstContact,
      notes: `Lead (${lead.source === "form" ? "lead form" : "WhatsApp"})`,
    });
  });
}

// Insert or update form leads. Duplicates are matched by Meta lead id, then by phone
// within the same form/campaign, so re-sending the whole sheet is safe.
function ingestLeadRows(state, rows, { distribution, source = "form", at = new Date() } = {}) {
  state.crmLeads = Array.isArray(state.crmLeads) ? state.crmLeads : [];
  const summary = { received: 0, added: 0, updated: 0, skipped: 0, assigned: {} };
  (rows || []).forEach((row) => {
    summary.received += 1;
    if (isTestRow(row)) { summary.test = (summary.test || 0) + 1; return; }
    const data = normalizeLeadRow(row);
    if (!data.phone && !data.name && !data.email) { summary.skipped += 1; return; }
    const existing = state.crmLeads.find((lead) => (data.externalId && lead.externalId === data.externalId)
      || (!data.externalId && data.phone && lead.phone === data.phone && lead.source === source
        && (lead.meta?.formId || lead.meta?.campaignName || "") === (data.meta.formId || data.meta.campaignName || "")));
    if (existing) {
      // Fill gaps only; never overwrite what agents changed.
      ["name", "email", "city", "phoneRaw"].forEach((key) => { if (!existing[key] && data[key]) existing[key] = data[key]; });
      if (!existing.phone && data.phone) existing.phone = data.phone;
      existing.meta = { ...data.meta, ...Object.fromEntries(Object.entries(existing.meta || {}).filter(([, value]) => value)) };
      existing.answers = { ...data.answers, ...(existing.answers || {}) };
      if (!existing.creativeId && !existing.adSetId && !existing.campaignId) Object.assign(existing, attributeLead(state, existing));
      summary.updated += 1;
      return;
    }
    const lead = {
      id: newId("lea"),
      source,
      ...data,
      ...attributeLead(state, data),
      status: "new",
      statusAt: data.createdAt,
      agentId: "",
      assignedAt: "",
      appointmentAt: "",
      bookedAt: "",
      remindedAt: "",
      callAttempts: 0,
      notes: "",
      history: [],
      importedAt: now(),
      updatedAt: now(),
    };
    lead.agentId = pickAgent(state, lead, distribution, at);
    if (lead.agentId) {
      lead.assignedAt = now();
      summary.assigned[lead.agentId] = (summary.assigned[lead.agentId] || 0) + 1;
    }
    pushHistory(lead, "created", { agentId: lead.agentId, auto: true });
    state.crmLeads.push(lead);
    summary.added += 1;
  });
  return summary;
}

// Apply a status / RDV / note change from an agent and resync outcomes.
function updateLead(state, lead, body = {}, by = "") {
  const changes = {};
  if (body.status !== undefined) {
    const status = clean(body.status);
    if (!LEAD_STATUSES.includes(status)) throw new Error("اختاري نتيجة صحيحة");
    if (status !== lead.status) {
      changes.status = { from: lead.status, to: status };
      lead.status = status;
      lead.statusAt = now();
      if (status === "booked" && !lead.bookedAt) lead.bookedAt = now();
      if (status === "visited") lead.visitedAt = now();
      if (status === "registered") {
        lead.registeredAt = now();
        if (!lead.bookedAt) lead.bookedAt = now(); // a student who registers had an RDV
      }
      if (status === "no_answer") lead.callAttempts = Number(lead.callAttempts || 0) + 1;
    }
  }
  if (body.appointmentAt !== undefined) {
    const at = clean(body.appointmentAt);
    if (at && Number.isNaN(new Date(at).getTime())) throw new Error("اختاري تاريخ الموعد ووقته");
    if (at && appointmentError(at)) throw new Error(appointmentError(at));
    if (at !== lead.appointmentAt) {
      changes.appointmentAt = { from: lead.appointmentAt, to: at };
      lead.appointmentAt = at;
      lead.remindedAt = "";
      if (at && !lead.bookedAt) lead.bookedAt = now();
      if (at && ["new", "no_answer", "contacted"].includes(lead.status)) {
        lead.status = "booked";
        lead.statusAt = now();
        changes.status = { to: "booked" };
      }
    }
  }
  if (body.callbackAt !== undefined) {
    const at = clean(body.callbackAt);
    if (at && Number.isNaN(new Date(at).getTime())) throw new Error("اختاري وقت إعادة الاتصال");
    if (at !== (lead.callbackAt || "")) { lead.callbackAt = at; changes.callbackAt = at; }
  }
  if (body.notes !== undefined && clean(body.notes) !== lead.notes) { lead.notes = clean(body.notes); changes.notes = true; }
  if (body.name !== undefined && clean(body.name)) lead.name = clean(body.name);
  if (body.phone !== undefined && clean(body.phone)) lead.phone = normalizePhone(body.phone);
  if (body.lostReason !== undefined) lead.lostReason = clean(body.lostReason);
  if (body.contacted) { lead.callAttempts = Number(lead.callAttempts || 0) + 1; lead.lastContactAt = now(); changes.contact = clean(body.contacted); }
  if (body.reminded) { lead.remindedAt = now(); changes.reminded = true; }
  // Every tap on call / WhatsApp is logged, even before the result is chosen.
  if (body.tap) {
    const channel = clean(body.tap) === "whatsapp" ? "whatsapp" : clean(body.tap) === "reminder" ? "reminder" : "call";
    lead.lastTapAt = now();
    pushHistory(lead, "tap", { channel }, by);
  }
  lead.updatedAt = now();
  if (Object.keys(changes).length) pushHistory(lead, "updated", changes, by);
  syncLeadOutcomes(state, lead);
  return lead;
}

function createManualLead(state, body = {}, { by = "", agentId = "" } = {}) {
  const data = normalizeLeadRow({ full_name: body.name, phone_number: body.phone, email: body.email, city: body.city });
  if (!data.phone) throw new Error("أدخلي رقم هاتف الشخص");
  const lead = {
    id: newId("lea"),
    source: body.source === "form" ? "form" : "whatsapp",
    ...data,
    createdAt: toIsoDate(body.createdAt) || now(),
    creativeId: "", adSetId: "", campaignId: "",
    status: "new", statusAt: now(),
    agentId: agentId || clean(body.agentId),
    assignedAt: now(),
    appointmentAt: "", bookedAt: "", remindedAt: "", callAttempts: 0,
    notes: clean(body.notes),
    history: [], importedAt: now(), updatedAt: now(),
  };
  const target = { creativeId: clean(body.creativeId), adSetId: clean(body.adSetId), campaignId: clean(body.campaignId) };
  const ad = target.creativeId ? state.creatives.find((item) => item.id === target.creativeId) : null;
  const adSet = state.adSets.find((item) => item.id === (target.adSetId || ad?.adSetId));
  const campaign = state.campaigns.find((item) => item.id === (target.campaignId || adSet?.campaignId));
  Object.assign(lead, { creativeId: ad?.id || "", adSetId: adSet?.id || "", campaignId: campaign?.id || "" });
  pushHistory(lead, "created", { agentId: lead.agentId }, by);
  state.crmLeads.push(lead);
  if (body.status && body.status !== "new") updateLead(state, lead, { status: body.status }, by);
  return lead;
}

function fillTemplate(template, lead, { agentName = "", locale = "fr-FR" } = {}) {
  const at = lead.appointmentAt ? new Date(lead.appointmentAt) : null;
  const firstName = clean(lead.name).split(" ")[0] || "";
  const values = {
    name: firstName,
    fullname: clean(lead.name),
    agent: agentName,
    day: at ? at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) : "",
    time: at ? at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "",
  };
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match)).replace(/\s+/g, " ").trim();
}

// vCard so agents can save the lead with a prefilled name in one tap.
function leadVcard(lead, { campaignName = "", label = "CMCG" } = {}) {
  const escape = (value) => String(value || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const name = clean(lead.name) || lead.phone;
  const display = `${name} · ${label}${campaignName ? ` ${campaignName}` : ""}`;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escape(display)}`,
    `N:${escape(name)};;;;`,
    lead.phone ? `TEL;TYPE=CELL:+${lead.phone}` : "",
    lead.email ? `EMAIL:${escape(lead.email)}` : "",
    `ORG:${escape(label)}`,
    `NOTE:${escape(`Lead ${lead.source === "form" ? "formulaire" : "WhatsApp"} du ${String(lead.createdAt).slice(0, 10)}`)}`,
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
}

// Split test: a campaign is "form" when it produced form leads or its objective is
// leads; everything else is click-to-WhatsApp. An explicit override wins.
function channelOfCampaign(state, campaign, overrides = {}) {
  if (!campaign) return "";
  if (overrides[campaign.id]) return overrides[campaign.id];
  if ((state.crmLeads || []).some((lead) => lead.source === "form" && lead.campaignId === campaign.id)) return "form";
  return /lead/i.test(campaign.objective || "") ? "form" : "whatsapp";
}

// Demo leads to show the agents' screen: for each agent, one hot new lead and
// one RDV today (or tomorrow after closing time) still waiting for its reminder.
const DEMO_PEOPLE = [
  ["سلمى بناني", "Salma Bennani"], ["ياسين العمراني", "Yassine Amrani"], ["خديجة العلوي", "Khadija Alaoui"],
  ["مهدي برادة", "Mehdi Berrada"], ["نورة الشرايبي", "Nora Chraibi"], ["حمزة التازي", "Hamza Tazi"],
  ["إيمان الفاسي", "Imane Fassi"], ["عمر الإدريسي", "Omar El Idrissi"],
];
function createDemoLeads(state, agentIds, at = new Date()) {
  const created = [];
  const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const nextSlot = () => {
    const slot = new Date(at.getTime() + 90 * 60000);
    const minutes = slot.getMinutes();
    if (minutes % 30) slot.setMinutes(minutes < 30 ? 30 : 60, 0, 0); else slot.setSeconds(0, 0);
    const hhmm = `${String(slot.getHours()).padStart(2, "0")}:${String(slot.getMinutes()).padStart(2, "0")}`;
    if (hhmm >= OPENING.open && hhmm <= OPENING.lastSlot && local(slot) === local(at)) return `${local(slot)}T${hhmm}`;
    const tomorrow = new Date(at.getTime() + 86400000);
    return `${local(tomorrow)}T15:00`;
  };
  agentIds.forEach((agentId, index) => {
    [0, 1].forEach((n) => {
      const [arabic, latin] = DEMO_PEOPLE[(index * 2 + n) % DEMO_PEOPLE.length];
      const lead = {
        id: newId("lea"), demo: true, source: n === 0 ? "form" : "whatsapp",
        externalId: "", createdAt: new Date(at.getTime() - (n === 0 ? 4 : 26 * 60) * 60000).toISOString(),
        name: `🧪 ${latin}`, phone: `21260000${String(index * 2 + n).padStart(4, "0")}`, phoneRaw: "", email: "", city: "طنجة",
        meta: { adName: "إعلان تجريبي", formName: "CMCG First Form" },
        answers: n === 0 ? { "التكوين حضوري فقط فمدينة طنجة. واش تقدر تحضر للمركز بانتظام؟": "نعم", "2️⃣ شنو هو المستوى الدراسي ديالك؟": "باك" } : {},
        creativeId: "", adSetId: "", campaignId: "",
        status: "new", statusAt: now(), agentId, assignedAt: now(),
        appointmentAt: "", bookedAt: "", remindedAt: "", callAttempts: 0,
        notes: n === 1 ? `رسالة تجريبية (${arabic}): موعد لتجربة رسالة التذكير.` : `رسالة تجريبية (${arabic}): رسالة ساخنة لتجربة الاتصال.`,
        history: [], importedAt: now(), updatedAt: now(),
      };
      pushHistory(lead, "created", { agentId, demo: true });
      state.crmLeads.push(lead);
      if (n === 1) updateLead(state, lead, { appointmentAt: nextSlot() }, "demo");
      created.push(lead);
    });
  });
  return created;
}
function removeDemoLeads(state) {
  const demoIds = new Set((state.crmLeads || []).filter((lead) => lead.demo).map((lead) => lead.id));
  state.crmLeads = (state.crmLeads || []).filter((lead) => !demoIds.has(lead.id));
  state.outcomes = state.outcomes.filter((outcome) => !demoIds.has(outcome.leadId));
  return demoIds.size;
}

// Move leads between agents. from: agent ids ("" = unassigned); statuses: which
// leads move (RDVs are left out unless asked); to: one or more agents, filled in
// turn so the leads are spread evenly. A lead never moves to the agent it is on.
// dryRun returns the plan without changing anything.
function transferLeads(state, { from = [], statuses = ["new"], to = [], by = "", dryRun = false } = {}) {
  const fromSet = new Set(from);
  const statusSet = new Set(statuses.filter((status) => LEAD_STATUSES.includes(status)));
  const targets = to.filter((agentId) => state.agents.some((agent) => agent.id === agentId));
  if (!statusSet.size) throw new Error("اختاري حالة واحدة على الأقل");
  if (!targets.length) throw new Error("اختاري إلى من ستُحوَّل الرسائل");
  const leads = (state.crmLeads || [])
    .filter((lead) => fromSet.has(lead.agentId || "") && statusSet.has(lead.status))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const name = (agentId) => state.agents.find((agent) => agent.id === agentId)?.name || "";
  const plan = {};
  let turn = 0;
  const moves = [];
  leads.forEach((lead) => {
    const options = targets.filter((agentId) => agentId !== lead.agentId);
    if (!options.length) return;
    const agentId = options[turn % options.length];
    turn += 1;
    plan[agentId] = (plan[agentId] || 0) + 1;
    moves.push([lead, agentId]);
  });
  if (!dryRun) {
    moves.forEach(([lead, agentId]) => {
      pushHistory(lead, "reassigned", { from: name(lead.agentId), to: name(agentId), transfer: true }, by);
      lead.agentId = agentId;
      lead.assignedAt = now();
      lead.updatedAt = now();
      syncLeadOutcomes(state, lead);
    });
  }
  return { moved: moves.length, plan };
}

// Per-agent activity for today and this month (no personal data): calls and
// messages logged, RDVs booked, registrations, leads received and still new.
function leadStats(state, at = new Date()) {
  const day = at.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const leads = state.crmLeads || [];
  const hidden = state.settings?.leadDistribution?.agents || {};
  return (state.agents || []).filter((agent) => agent.active !== false && !hidden[agent.id]?.hidden).map((agent) => {
    const mine = leads.filter((lead) => lead.agentId === agent.id);
    const actionsToday = mine.reduce((sum, lead) => sum + (lead.history || []).filter((item) => String(item.at).slice(0, 10) === day && (item.contact || item.status)).length, 0);
    return {
      agentId: agent.id,
      name: agent.name,
      code: agent.code || "",
      actionsToday,
      leadsToday: mine.filter((lead) => String(lead.assignedAt || lead.createdAt).slice(0, 10) === day).length,
      rdvsToday: mine.filter((lead) => String(lead.bookedAt).slice(0, 10) === day).length,
      rdvsMonth: mine.filter((lead) => String(lead.bookedAt).slice(0, 7) === month).length,
      registeredMonth: mine.filter((lead) => lead.status === "registered" && String(lead.registeredAt).slice(0, 7) === month).length,
      waiting: mine.filter((lead) => lead.status === "new").length,
    };
  });
}

module.exports = {
  createDemoLeads, removeDemoLeads, transferLeads, leadStats, appointmentError, OPENING,
  LEAD_STATUSES, CLOSED_STATUSES, DISTRIBUTION_MODES, DEFAULT_TEMPLATES,
  normalizePhone, normalizeLeadRow, isTestRow, attributeLead, pickAgent, ingestLeadRows, updateLead, createManualLead,
  syncLeadOutcomes, normalizeDistribution, defaultDistribution, fillTemplate, leadVcard, channelOfCampaign,
};
