// Meta integrations: Conversions API queue, Marketing API sync, WhatsApp webhook.
// Everything is OFF until credentials are in the environment AND switched on in
// the admin Integrations page. Secrets only ever come from environment variables.
const { createIntegrationStore } = require("./store");
const Capi = require("./capi");
const Ads = require("./ads-sync");
const Wa = require("./whatsapp");

function normalizeIntegrationSettings(input = {}) {
  const numbers = Array.isArray(input.whatsapp?.numbers) ? input.whatsapp.numbers : [];
  return {
    capi: Capi.normalizeCapiSettings(input.capi || {}),
    ads: {
      enabled: input.ads?.enabled === true,
      backfillFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(input.ads?.backfillFrom || "")) ? input.ads.backfillFrom : "",
      everyHours: [1, 2, 3, 6, 12, 24].includes(Number(input.ads?.everyHours)) ? Number(input.ads.everyHours) : 3,
      lastSyncAt: String(input.ads?.lastSyncAt || ""),
    },
    whatsapp: {
      enabled: input.whatsapp?.enabled === true,
      numbers: numbers.map((item) => ({ phoneNumberId: String(item.phoneNumberId || "").replace(/\D/g, "").slice(0, 30), agentId: String(item.agentId || "").slice(0, 60), label: String(item.label || "").slice(0, 60) })).filter((item) => item.phoneNumberId),
    },
  };
}

function envStatus(env = process.env) {
  const has = (key) => Boolean(String(env[key] || "").trim());
  return {
    META_ACCESS_TOKEN: has("META_ACCESS_TOKEN"),
    META_CAPI_TOKEN: has("META_CAPI_TOKEN"),
    META_DATASET_ID: has("META_DATASET_ID"),
    META_TEST_EVENT_CODE: has("META_TEST_EVENT_CODE"),
    META_AD_ACCOUNT_ID: has("META_AD_ACCOUNT_ID"),
    META_APP_SECRET: has("META_APP_SECRET"),
    WHATSAPP_VERIFY_TOKEN: has("WHATSAPP_VERIFY_TOKEN"),
    WHATSAPP_BUSINESS_ACCOUNT_ID: has("WHATSAPP_BUSINESS_ACCOUNT_ID"),
  };
}

function createIntegrations({ storage, lock, Leads, helpers, env = process.env, fetchImpl = (...args) => fetch(...args), log: consoleLog = console }) {
  const store = createIntegrationStore(storage);
  const runtime = { capiPaused: "", webhookLastAt: "", webhookLastError: "", busy: { capi: false, ads: false } };
  const settingsOf = (state) => normalizeIntegrationSettings(state.settings?.integrations || {});

  async function init() {
    await store.init();
    await store.prune().catch(() => {});
  }

  // ---------- Conversions API ----------
  async function reconcileCapi() {
    const config = Capi.capiConfig(env);
    const release = await lock();
    let state;
    try { state = await storage.read(); } finally { release(); }
    const settings = settingsOf(state).capi;
    if (!settings.enabled || !config.datasetId || !config.token) return 0;
    const value = Number(state.settings?.profit?.revenuePerRegistered ?? 3000);
    const currency = String(state.settings?.profit?.revenueCurrency || "MAD").toUpperCase() === "DH" ? "MAD" : String(state.settings?.profit?.revenueCurrency || "MAD").toUpperCase();
    let added = 0;
    for (const lead of state.crmLeads || []) {
      const events = Capi.eventsForLead(lead, { settings, value, currency, wabaId: config.wabaId, leadHadRdv: Leads.leadHadRdv });
      for (const event of events) {
        if (await store.enqueue({ ...event, mode: settings.mode })) added += 1;
      }
      // An RDV cancelled before its time must not be sent if still waiting in the queue.
      if (lead.bookedAt && !Leads.leadHadRdv(lead)) await store.cancelLeadStage(lead.id, "booked");
    }
    if (added) await store.log("capi", "info", `${added} event(s) queued (${settings.mode})`);
    return added;
  }

  async function deliverDue() {
    if (runtime.capiPaused) return 0;
    const config = Capi.capiConfig(env);
    if (!config.datasetId || !config.token) return 0;
    const due = await store.dueEvents(20);
    let sent = 0;
    for (const row of due) {
      const result = await Capi.deliver(row, config, fetchImpl);
      const attempts = row.attempts + 1;
      if (result.status === "sent") {
        sent += 1;
        await store.updateEvent(row.id, { status: "sent", attempts, response: result.response || "", last_error: null });
      } else if (result.status === "retry" && attempts < 6) {
        await store.updateEvent(row.id, { status: "retry", attempts, last_error: result.error, response: result.response || null, next_attempt_at: Capi.nextAttempt(attempts - 1) });
      } else {
        await store.updateEvent(row.id, { status: result.status === "paused" ? "paused" : "failed", attempts, last_error: result.error, response: result.response || null });
        await store.log("capi", "error", `${row.event_id}: ${result.error}`);
        if (result.pause) {
          runtime.capiPaused = result.error;
          await store.log("capi", "error", `Queue paused: ${result.error}. Fix the token/permissions, then press "Retry failed".`);
          break;
        }
      }
    }
    return sent;
  }

  async function tickCapi() {
    if (runtime.busy.capi) return;
    runtime.busy.capi = true;
    try { await reconcileCapi(); await deliverDue(); } catch (error) { consoleLog.error("CAPI tick failed:", error.message); } finally { runtime.busy.capi = false; }
  }
  async function retryFailed() {
    runtime.capiPaused = "";
    const n = await store.retryFailed();
    await store.log("capi", "info", `Retry requested for ${n} event(s)`);
    return n;
  }

  // ---------- Marketing API ----------
  async function syncAds({ from = "", to = "", force = false } = {}) {
    const config = Ads.adsConfig(env);
    if (!config.account || !config.token) throw new Error("META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required");
    if (runtime.busy.ads) throw new Error("A sync is already running");
    runtime.busy.ads = true;
    const runId = await store.startRun("ads");
    try {
      let state = await storage.read();
      const settings = settingsOf(state).ads;
      const today = new Date().toISOString().slice(0, 10);
      const until = to || today;
      const since = from || (settings.lastSyncAt ? Ads.addDays(until, -2) : (settings.backfillFrom || Ads.addDays(until, -29)));
      if (!force && !settings.enabled && !from) throw new Error("Ads sync is switched off");
      const chunks = [];
      for (let start = since; start <= until; start = Ads.addDays(start, 30)) {
        const end = Ads.addDays(start, 29) < until ? Ads.addDays(start, 29) : until;
        chunks.push([start, end]);
      }
      let written = 0;
      let info = {};
      for (const [start, end] of chunks) {
        const data = await Ads.fetchInsights(config, start, end, fetchImpl);
        const release = await lock();
        try {
          state = await storage.read();
          info = Ads.applyInsights(state, data, { from: start, to: end }, helpers);
          Leads.reattributeLeads(state);
          state.settings.integrations = { ...normalizeIntegrationSettings(state.settings.integrations || {}), ads: { ...settingsOf(state).ads, lastSyncAt: new Date().toISOString() } };
          await storage.write(state);
        } finally {
          release();
        }
        written += info.written;
      }
      await store.finishRun(runId, "ok", written, `${since} → ${until} · ${info.currency || ""} · ${info.timezone || ""}`);
      await store.log("ads", "info", `Synced ${written} ad-day row(s) ${since} → ${until}`);
      return { written, since, until, ...info };
    } catch (error) {
      await store.finishRun(runId, "error", 0, error.message);
      await store.log("ads", "error", error.message);
      throw error;
    } finally {
      runtime.busy.ads = false;
    }
  }
  async function tickAds() {
    try {
      const state = await storage.read();
      const settings = settingsOf(state).ads;
      const config = Ads.adsConfig(env);
      if (!settings.enabled || !config.account || !config.token) return;
      if (settings.lastSyncAt && Date.now() - Date.parse(settings.lastSyncAt) < settings.everyHours * 3600000) return;
      await syncAds();
    } catch (error) {
      consoleLog.error("Ads sync failed:", error.message);
    }
  }

  // ---------- WhatsApp webhook ----------
  function verifyWebhook(query) {
    return Wa.verifyChallenge(query, String(env.WHATSAPP_VERIFY_TOKEN || ""));
  }
  function checkSignature(rawBody, header) {
    return Wa.validSignature(rawBody, header, String(env.META_APP_SECRET || ""));
  }
  // Called after the 200 response was sent. Returns a summary (used by tests).
  async function processWebhook(body) {
    const { inbound, echoes } = Wa.parseWebhook(body);
    const summary = { inbound: inbound.length, created: 0, updated: 0, duplicates: 0, echoes: 0, ignored: 0 };
    if (!inbound.length && !echoes.length) return summary;
    runtime.webhookLastAt = new Date().toISOString();
    let state = await storage.read();
    const settings = settingsOf(state).whatsapp;
    if (!settings.enabled) { summary.ignored = inbound.length + echoes.length; await store.log("whatsapp", "warn", `Webhook received ${summary.ignored} message(s) while WhatsApp is switched off: ignored`); return summary; }
    for (const message of inbound) {
      const first = await store.recordMessage({ messageId: message.messageId, phoneNumberId: message.phoneNumberId, from: message.from, kind: "inbound", hasReferral: Boolean(message.referral) });
      if (!first) { summary.duplicates += 1; continue; }
      const mapping = settings.numbers.find((item) => item.phoneNumberId === message.phoneNumberId);
      const release = await lock();
      try {
        state = await storage.read();
        const { lead, created } = Leads.upsertWhatsappLead(state, message, { distribution: state.settings.leadDistribution, agentId: mapping?.agentId || "" });
        if (lead) {
          await storage.write(state);
          await store.setMessageLead(message.messageId, lead.id);
          summary[created ? "created" : "updated"] += 1;
        }
      } finally {
        release();
      }
    }
    for (const echo of echoes) {
      const first = await store.recordMessage({ messageId: echo.messageId, phoneNumberId: echo.phoneNumberId, from: echo.to, kind: "echo" });
      if (!first) { summary.duplicates += 1; continue; }
      const release = await lock();
      try {
        state = await storage.read();
        if (Leads.recordWhatsappEcho(state, echo)) { await storage.write(state); summary.echoes += 1; }
      } finally {
        release();
      }
    }
    if (summary.created || summary.updated) await store.log("whatsapp", "info", `Webhook: ${summary.created} new lead(s), ${summary.updated} update(s)`);
    return summary;
  }

  // ---------- Status for the admin page ----------
  async function status(state) {
    const settings = settingsOf(state);
    const since = Date.now() - 30 * 86400000;
    const recent = (state.crmLeads || []).filter((lead) => !lead.demo && Date.parse(lead.createdAt) >= since);
    const wa = recent.filter((lead) => lead.source === "whatsapp");
    const form = recent.filter((lead) => lead.source === "form");
    return {
      env: envStatus(env),
      settings,
      capi: { paused: runtime.capiPaused, counts: await store.eventCounts().catch(() => []) },
      ads: { runs: await store.lastRuns("ads", 5).catch(() => []), busy: runtime.busy.ads },
      whatsapp: { ...(await store.messageStats().catch(() => ({}))), lastWebhookAt: runtime.webhookLastAt },
      coverage: {
        whatsappLeads: wa.length,
        whatsappApi: wa.filter((lead) => lead.attributionSource === "api").length,
        whatsappManual: wa.filter((lead) => lead.attributionSource === "manual" || (!lead.attributionSource && (lead.creativeId || lead.adSetId || lead.campaignId))).length,
        formLeads: form.length,
        formLinked: form.filter((lead) => lead.creativeId || lead.adSetId || lead.campaignId).length,
      },
      log: await store.recentLog(40).catch(() => []),
    };
  }

  return { init, store, tickCapi, reconcileCapi, deliverDue, retryFailed, syncAds, tickAds, verifyWebhook, checkSignature, processWebhook, status, runtime };
}

module.exports = { createIntegrations, normalizeIntegrationSettings, envStatus };
