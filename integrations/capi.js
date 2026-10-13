// Meta Conversions API: which events a lead should produce, how they are built,
// and how the queue delivers them (stable ids, retries, test mode, no duplicates).
const crypto = require("crypto");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const DAY = 86400000;
// Meta accepts events up to 7 days old; physical_store up to 62 days.
const MAX_AGE_DAYS = { system_generated: 7, business_messaging: 7, phone_call: 7, physical_store: 62 };
const RETRY_MINUTES = [1, 5, 30, 120, 720];

function defaultCapiSettings() {
  return {
    enabled: false,
    mode: "test", // "test" sends with META_TEST_EVENT_CODE only; "live" counts in reporting
    since: "",
    sendBooked: true,
    sendRegistered: true,
    // Conversion Leads stage names must match the stages configured in Events Manager.
    formStages: { booked: "RDV", registered: "Registered" },
    events: { booked: "Schedule", registered: "Purchase" },
  };
}
function normalizeCapiSettings(input = {}) {
  const base = defaultCapiSettings();
  const clean = (value, fallback) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 50) : fallback);
  return {
    enabled: input.enabled === true,
    mode: input.mode === "live" ? "live" : "test",
    since: /^\d{4}-\d{2}-\d{2}/.test(String(input.since || "")) ? String(input.since) : base.since,
    sendBooked: input.sendBooked !== false,
    sendRegistered: input.sendRegistered !== false,
    formStages: { booked: clean(input.formStages?.booked, base.formStages.booked), registered: clean(input.formStages?.registered, base.formStages.registered) },
    events: { booked: clean(input.events?.booked, base.events.booked), registered: clean(input.events?.registered, base.events.registered) },
  };
}

// Normalised identifiers, hashed the way Meta requires (lowercase, trimmed, SHA-256).
function hashedUserData(lead) {
  const data = {};
  const phone = String(lead.phone || "").replace(/\D/g, "");
  if (phone.length >= 9) data.ph = [sha256(phone)];
  const parts = String(lead.name || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parts[0]) data.fn = [sha256(parts[0])];
  if (parts.length > 1) data.ln = [sha256(parts[parts.length - 1])];
  data.country = [sha256("ma")];
  data.external_id = [sha256(`cmcg:${lead.id}`)];
  return data;
}

const isTestLead = (lead) => Boolean(lead.demo || lead.test || /🧪|\btest\b|تجريبي/i.test(String(lead.name || "")));

// The events a lead should produce right now. Pure: same lead -> same event ids.
function eventsForLead(lead, { settings, value, currency = "MAD", wabaId = "", leadHadRdv, now = Date.now() }) {
  if (!lead || isTestLead(lead)) return [];
  const out = [];
  const stages = [];
  if (settings.sendBooked && leadHadRdv(lead)) stages.push(["booked", lead.bookedAt]);
  if (settings.sendRegistered && lead.status === "registered") stages.push(["registered", lead.registeredAt || lead.statusAt]);
  stages.forEach(([stage, at]) => {
    const time = Date.parse(at || "");
    if (!Number.isFinite(time)) return;
    if (settings.since && new Date(time).toISOString().slice(0, 10) < settings.since.slice(0, 10)) return;
    const custom = stage === "registered" ? { value: Number(value) || 0, currency } : {};
    let channel; let payload;
    if (lead.source === "form" && lead.externalId) {
      // Conversion Leads (Instant Forms): Meta lead id + CRM stage name.
      channel = "crm_lead";
      payload = {
        event_name: settings.formStages[stage],
        action_source: "system_generated",
        user_data: { lead_id: String(lead.externalId), ...hashedUserData(lead) },
        custom_data: { event_source: "crm", lead_event_source: "CMCG CRM", ...custom },
      };
    } else if (lead.ctwaClid && wabaId) {
      // Click-to-WhatsApp with the click id captured by the Cloud API webhook.
      channel = "whatsapp_ctwa";
      payload = {
        event_name: settings.events[stage],
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: { whatsapp_business_account_id: String(wabaId), ctwa_clid: String(lead.ctwaClid), ...hashedUserData(lead) },
        custom_data: custom,
      };
    } else if (lead.phone) {
      // No click id: RDVs are booked over the phone, payments happen at the centre.
      channel = "offline";
      payload = {
        event_name: settings.events[stage],
        action_source: stage === "registered" ? "physical_store" : "phone_call",
        user_data: hashedUserData(lead),
        custom_data: custom,
      };
    } else {
      return;
    }
    const maxAge = MAX_AGE_DAYS[payload.action_source] || 7;
    if (now - time > maxAge * DAY) return;
    const eventId = `cmcg-${lead.id}-${stage}`;
    out.push({ eventId, leadId: lead.id, stage, channel, payload: { ...payload, event_id: eventId, event_time: Math.floor(time / 1000) } });
  });
  return out;
}

function capiConfig(env = process.env) {
  return {
    datasetId: String(env.META_DATASET_ID || "").trim(),
    token: String(env.META_CAPI_TOKEN || env.META_ACCESS_TOKEN || "").trim(),
    testCode: String(env.META_TEST_EVENT_CODE || "").trim(),
    wabaId: String(env.WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim(),
    version: String(env.META_API_VERSION || "v21.0").trim(),
  };
}

// Send one queued event. Returns { status, error, response, pause }.
async function deliver(row, config, fetchImpl = fetch) {
  const body = { data: [row.payload] };
  if (row.mode === "test") {
    if (!config.testCode) return { status: "failed", error: "META_TEST_EVENT_CODE is missing: test mode never sends to live reporting" };
    body.test_event_code = config.testCode;
  }
  let response; let text = "";
  try {
    response = await fetchImpl(`https://graph.facebook.com/${config.version}/${encodeURIComponent(config.datasetId)}/events?access_token=${encodeURIComponent(config.token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    text = await response.text();
  } catch (error) {
    return { status: "retry", error: `Network: ${error.message}` };
  }
  let json = {};
  try { json = JSON.parse(text); } catch {}
  if (response.ok && Number(json.events_received) >= 1) return { status: "sent", response: text.slice(0, 1000) };
  const code = Number(json.error?.code);
  const message = json.error?.message || `HTTP ${response.status}`;
  // 190 = token expired/invalid, 10/200/2xx = permissions: stop the queue, the admin must fix it.
  if (code === 190 || code === 10 || (code >= 200 && code < 300)) return { status: "paused", error: message, response: text.slice(0, 1000), pause: true };
  if (response.status >= 500 || code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 613) return { status: "retry", error: message, response: text.slice(0, 1000) };
  return { status: "failed", error: message, response: text.slice(0, 1000) };
}

function nextAttempt(attempts, now = Date.now()) {
  const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)];
  return new Date(now + minutes * 60000).toISOString();
}

module.exports = { defaultCapiSettings, normalizeCapiSettings, hashedUserData, eventsForLead, capiConfig, deliver, nextAttempt, isTestLead, sha256, RETRY_MINUTES };
