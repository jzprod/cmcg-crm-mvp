// Meta Lead Feedback (Google Sheets): the single place that decides what a CRM lead
// means for Meta's native Instant Forms -> Google Sheets -> Conversions API connector.
//
// Pure functions only (no I/O). The service in sheet-feedback.js uses them to decide
// which `lead_status` cell to write, and when.
//
// IMPORTANT: the exact machine values Meta accepts in `lead_status` are NOT verified.
// Meta's help article for this connector could not be read; third-party guides quoting
// it list "Intake, Qualified, Converted, Lost, Not qualified" (title case), while the
// connected sheet itself shows uppercase ("CREATED" written by Meta). So every stage
// value is configuration, and a stage is only ever written once an admin has confirmed
// it in Events Manager (`confirmed: true`). Unconfirmed stages are queued as "blocked".

const STAGES = ["intake", "qualified", "converted", "lost", "not_qualified"];

const STAGE_INFO = {
  intake: { label: "Intake", meaning: "RDV booked (active lead, not yet qualified by attendance)" },
  qualified: { label: "Qualified", meaning: "Visited the centre (paid or not)" },
  converted: { label: "Converted", meaning: "Registered and paid" },
  lost: { label: "Lost", meaning: "Definitively declined / closed after showing interest" },
  not_qualified: { label: "Not qualified", meaning: "Unsuitable or invalid lead (other city, wrong number, conditions not met)" },
};

// Candidate spellings, first one is the default. None is verified.
const CANDIDATE_VALUES = {
  intake: ["Intake", "INTAKE"],
  qualified: ["Qualified", "QUALIFIED"],
  converted: ["Converted", "CONVERTED"],
  lost: ["Lost", "LOST"],
  not_qualified: ["Not qualified", "NOT_QUALIFIED"],
};

// Values Meta itself writes for a lead nobody has updated (observed in the sheet).
const INITIAL_VALUES = new Set(["", "created"]);

// The old integration ("CMCG First Form" -> "CMCG Leads" -> dataset 2406568106815480)
// must never be targeted by this feature.
const LEGACY = {
  spreadsheetIds: ["1AVwE6OB-IsIWKeRFZ-yAFmp2Q01p3P_z0HnPhFwQzgE"],
  datasetIds: ["2406568106815480"],
};

// Defaults = the new integration, from the actual connected services:
// spreadsheet id from Google Drive, form id from the sheet's own form_id column.
const DEFAULT_CONNECTION = {
  spreadsheetId: "16xul0xofuNSMLXrEghGZdAgjqPfs8grh3vXrSCpEDD0",
  spreadsheetName: "cmcg new leads",
  sheetName: "Sheet1",
  formId: "1149002150936595",
  formName: "CMCG First Form-copy",
  datasetId: "1118216094383015",
  datasetName: "CMCGC Offecial Pixel",
};

// CRM status (leads.js LEAD_STATUSES) -> business meaning, for the preview table.
// "WhatsApp sent" is a contact action (lead.lastWhatsappAt), never a status.
const STATUS_MAP = [
  ["new", "New lead", null, "Meta already shows CREATED"],
  ["no_answer", "No answer", null, "Still an active prospect"],
  ["callback", "Callback requested", null, "Still an active prospect"],
  ["contacted", "Contacted, thinking", null, "Still considering (keeps any earlier Qualified)"],
  ["booked", "RDV booked", "intake", "Appointment confirmed, not yet qualified by attendance"],
  ["visited", "Visited the centre", "qualified", "Strong demonstrated interest, paid or not"],
  ["registered", "Registered and paid", "converted", "Paying student (even without a recorded visit)"],
  ["not_interested", "Not interested", "lost", "Opportunity closed"],
  ["other_city", "Other city", "not_qualified", "Cannot attend physical training (Lost if already visited)"],
  ["not_qualified", "Not qualified", "not_qualified", "Conditions not met (Lost if already visited)"],
  ["wrong_number", "Wrong number", "not_qualified", "Invalid lead (Lost if already visited)"],
];
const NEGATIVE_STATUS = { not_interested: "lost", other_city: "not_qualified", not_qualified: "not_qualified", wrong_number: "not_qualified" };

const RANK = { created: 0, intake: 1, not_qualified: 1, qualified: 2, lost: 2.5, converted: 3 };
const POSITIVE = new Set(["intake", "qualified", "converted"]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isTestLead = (lead) => Boolean(lead?.demo || lead?.test || /🧪|\btest\b|تجريبي/i.test(String(lead?.name || "")));
const stripLeadId = (value) => clean(value).replace(/^l:/i, "");
const stripFormId = (value) => clean(value).replace(/^f:/i, "");

function defaultStages() {
  return Object.fromEntries(STAGES.map((stage) => [stage, { value: CANDIDATE_VALUES[stage][0], confirmed: false, confirmedAt: "", confirmedBy: "", note: "" }]));
}

function normalizeSheetFeedbackSettings(input = {}) {
  const pick = (key, max = 120) => (typeof input[key] === "string" ? clean(input[key]).slice(0, max) : DEFAULT_CONNECTION[key]);
  const stages = defaultStages();
  STAGES.forEach((stage) => {
    const raw = input.stages?.[stage];
    if (!raw) return;
    const value = clean(raw.value).slice(0, 40);
    if (value) stages[stage].value = value;
    stages[stage].confirmed = raw.confirmed === true && Boolean(value);
    stages[stage].confirmedAt = stages[stage].confirmed ? clean(raw.confirmedAt) : "";
    stages[stage].confirmedBy = stages[stage].confirmed ? clean(raw.confirmedBy).slice(0, 80) : "";
    stages[stage].note = clean(raw.note).slice(0, 300);
  });
  const duplicates = {};
  Object.entries(input.duplicates || {}).forEach(([leadId, choice]) => { if (["report", "skip"].includes(choice)) duplicates[String(leadId).slice(0, 64)] = choice; });
  const interval = Number(input.minStageIntervalMinutes);
  return {
    enabled: input.enabled === true,
    importLeads: input.importLeads !== false,
    spreadsheetId: pick("spreadsheetId").replace(/[^\w-]/g, ""),
    spreadsheetName: pick("spreadsheetName"),
    sheetName: pick("sheetName", 100) || "Sheet1",
    formId: stripFormId(pick("formId")).replace(/\D/g, ""),
    formName: pick("formName"),
    datasetId: pick("datasetId").replace(/\D/g, ""),
    datasetName: pick("datasetName"),
    since: /^\d{4}-\d{2}-\d{2}/.test(String(input.since || "")) ? String(input.since).slice(0, 10) : "",
    minStageIntervalMinutes: Number.isFinite(interval) && interval >= 0 && interval <= 1440 ? Math.round(interval) : 15,
    stages,
    duplicates,
  };
}

// Problems that must block saving the connection (old integration isolation).
function connectionErrors(config) {
  const errors = [];
  if (LEGACY.spreadsheetIds.includes(config.spreadsheetId)) errors.push("This is the old “CMCG Leads” spreadsheet: the feedback must not write to the old integration.");
  if (LEGACY.datasetIds.includes(config.datasetId)) errors.push("Dataset 2406568106815480 belongs to the old integration.");
  if (config.enabled && !config.spreadsheetId) errors.push("Spreadsheet id is required.");
  if (config.enabled && !config.formId) errors.push("Instant Form id is required.");
  return errors;
}

// Is this CRM lead allowed to update the connected sheet? Only leads that came from
// the connected Instant Form, through the connected spreadsheet, with a Meta lead id.
function eligibility(lead, config) {
  if (!lead) return { eligible: false, reason: "Lead not found" };
  if (isTestLead(lead)) return { eligible: false, reason: "Demo or test lead" };
  if (lead.source !== "form") return { eligible: false, reason: lead.source === "whatsapp" ? "WhatsApp lead (not an Instant Form lead)" : "Not an Instant Form lead" };
  if (lead.manual) return { eligible: false, reason: "Added by hand (no Meta submission)" };
  if (!clean(lead.externalId)) return { eligible: false, reason: "Missing Meta lead id" };
  if (stripFormId(lead.meta?.formId) !== config.formId) return { eligible: false, reason: lead.meta?.formId ? "Different Instant Form (old integration or another form)" : "No Instant Form id on the lead" };
  if (lead.intake?.spreadsheetId !== config.spreadsheetId) return { eligible: false, reason: "Not imported from the connected spreadsheet" };
  return { eligible: true, reason: "" };
}

// The Meta stages this lead has genuinely reached, in funnel order, with the time
// each milestone happened. Milestones never disappear when an agent follows up later
// (visited -> thinking stays Qualified), except an RDV cancelled before its time.
function milestonesForLead(lead, { leadHadRdv }) {
  const out = [];
  const status = lead.status;
  const hadRdv = status === "booked" || (typeof leadHadRdv === "function" ? leadHadRdv(lead) : Boolean(lead.bookedAt));
  if (hadRdv && lead.bookedAt) out.push({ stage: "intake", at: lead.bookedAt });
  if (lead.visitedAt) out.push({ stage: "qualified", at: lead.visitedAt });
  else if (status === "visited") out.push({ stage: "qualified", at: lead.statusAt });
  const converted = lead.registeredAt || (status === "registered" ? lead.statusAt : "");
  if (converted) out.push({ stage: "converted", at: converted });
  else if (NEGATIVE_STATUS[status]) {
    const stage = NEGATIVE_STATUS[status] === "not_qualified" && out.some((item) => item.stage === "qualified") ? "lost" : NEGATIVE_STATUS[status];
    out.push({ stage, at: lead.statusAt });
  }
  return out.filter((item) => item.at).sort((a, b) => RANK[a.stage] - RANK[b.stage]);
}

function desiredStage(lead, options) {
  const list = milestonesForLead(lead, options);
  return list.length ? list[list.length - 1] : null;
}

// Sheet cell -> stage. Case-insensitive against the configured and candidate values.
function parseSheetValue(value, config) {
  const text = clean(value).toLowerCase();
  if (INITIAL_VALUES.has(text)) return "created";
  for (const stage of STAGES) {
    const known = [config?.stages?.[stage]?.value, ...CANDIDATE_VALUES[stage]].filter(Boolean).map((item) => clean(item).toLowerCase());
    if (known.includes(text)) return stage;
  }
  return "unknown";
}

// Should the cell move from `current` to `target`? Never downgrades Converted, never
// overwrites a value somebody typed by hand, never steps backwards in the funnel,
// unless this is an explicit admin correction.
function decideTransition(current, target, { correction = false } = {}) {
  if (!STAGES.includes(target)) return { action: "skip", reason: `Unknown target stage “${target}”` };
  if (current === target) return { action: "noop", reason: "Sheet already shows this stage" };
  if (correction) return { action: "write", reason: "Admin correction" };
  if (current === "unknown") return { action: "skip", reason: "The sheet holds a value the CRM does not recognise (edited by hand?)" };
  if (current === "converted") return { action: "skip", reason: "Regression prevented: the lead is already Converted" };
  if (target === "converted") return { action: "write", reason: "" };
  if (target === "qualified") return ["created", "intake", "lost", "not_qualified"].includes(current) ? { action: "write", reason: "" } : { action: "skip", reason: "Regression prevented" };
  if (target === "lost") return { action: "write", reason: "" };
  if (target === "not_qualified") return ["created", "intake"].includes(current) ? { action: "write", reason: "" } : { action: "skip", reason: "A lead that already visited is closed as Lost, not Not qualified" };
  // intake
  return current === "created" ? { action: "write", reason: "" } : { action: "skip", reason: "Regression prevented: the sheet is already further in the funnel" };
}

// Duplicate submissions: two eligible leads with the same phone that both reached a
// stage are ambiguous (the same outcome could be reported twice). Nothing is written
// for them until an admin marks which one reports ("report") and which not ("skip").
function duplicateFlags(leads, config, options) {
  const groups = new Map();
  leads.forEach((lead) => {
    if (!lead.phone || !eligibility(lead, config).eligible || !desiredStage(lead, options)) return;
    if (!groups.has(lead.phone)) groups.set(lead.phone, []);
    groups.get(lead.phone).push(lead);
  });
  const flags = new Map(); // leadId -> "ambiguous" | "skip"
  groups.forEach((group) => {
    if (group.length < 2) return;
    const choices = config.duplicates || {};
    const kept = group.filter((lead) => choices[lead.id] !== "skip");
    group.filter((lead) => choices[lead.id] === "skip").forEach((lead) => flags.set(lead.id, "skip"));
    if (kept.length > 1) kept.forEach((lead) => flags.set(lead.id, "ambiguous"));
  });
  return flags;
}

module.exports = {
  STAGES, STAGE_INFO, CANDIDATE_VALUES, LEGACY, DEFAULT_CONNECTION, STATUS_MAP, RANK, POSITIVE,
  normalizeSheetFeedbackSettings, connectionErrors, eligibility, milestonesForLead, desiredStage,
  parseSheetValue, decideTransition, duplicateFlags, stripLeadId, stripFormId, isTestLead,
};
