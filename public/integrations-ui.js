// Admin "Integrations" page: Meta Conversions API, Marketing API sync, WhatsApp
// Cloud API webhook, attribution coverage and CRM-attributed reports.
// Uses app.js globals (state, api, toast, money, number, escapeHtml, filters…).
(() => {
  const INT = { status: null, events: [], loading: false, eventFilter: "" };
  const root = () => document.getElementById("integrationsRoot");
  const esc = (value) => escapeHtml(String(value ?? ""));
  const when = (iso) => (iso ? new Date(iso).toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" }) : "—");
  const ago = (iso) => {
    if (!iso) return "never";
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 2880) return `${Math.round(minutes / 60)} h ago`;
    return `${Math.round(minutes / 1440)} days ago`;
  };
  const dot = (ok, warn = false) => `<span class="int-dot ${ok ? "is-ok" : warn ? "is-warn" : "is-off"}" aria-hidden="true"></span>`;
  const isAdmin = () => currentUser?.role !== "sales";

  async function load() {
    if (!isAdmin() || INT.loading) return;
    INT.loading = true;
    try {
      const [status, events] = await Promise.all([
        api("/api/integrations/status"),
        api(`/api/integrations/events${INT.eventFilter ? `?status=${encodeURIComponent(INT.eventFilter)}` : ""}`),
      ]);
      INT.status = status;
      INT.events = events.events || [];
    } catch (error) {
      INT.error = error.message;
    } finally {
      INT.loading = false;
    }
    render();
  }

  async function save(patch, message) {
    try {
      await api("/api/integrations/settings", { method: "POST", body: JSON.stringify(patch) });
      if (message) toast(message);
      await load();
    } catch (error) { toast(error.message, "error"); render(); }
  }

  function envList(env) {
    const rows = [
      ["META_ACCESS_TOKEN", "System user token (Marketing API + Conversions API)"],
      ["META_DATASET_ID", "Dataset (pixel) ID from Events Manager"],
      ["META_TEST_EVENT_CODE", "Test event code (Events Manager → Test events)"],
      ["META_AD_ACCOUNT_ID", "Ad account ID (act_…)"],
      ["META_APP_SECRET", "App secret: verifies webhook signatures"],
      ["WHATSAPP_VERIFY_TOKEN", "Webhook verify token (any long random text)"],
      ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WhatsApp Business Account ID (for click-to-WhatsApp events)"],
    ];
    return `<ul class="int-env">${rows.map(([key, label]) => `<li>${dot(env[key])}<code>${key}</code><span>${esc(label)}</span><b>${env[key] ? "set" : "missing"}</b></li>`).join("")}</ul>`;
  }

  function countsTable(counts) {
    const by = (status, mode) => counts.filter((row) => row.status === status && (!mode || row.mode === mode)).reduce((sum, row) => sum + row.n, 0);
    const cell = (status, label, cls) => `<div class="int-count ${cls}"><strong>${number(by(status))}</strong><span>${label}</span><small>test ${number(by(status, "test"))} · live ${number(by(status, "live"))}</small></div>`;
    return `<div class="int-counts">${cell("sent", "Sent", "is-ok")}${cell("pending", "Waiting", "")}${cell("retry", "Retrying", "is-warn")}${cell("failed", "Failed", "is-bad")}${cell("paused", "Paused", "is-bad")}</div>`;
  }

  function eventsTable() {
    const leadName = (id) => (state.crmLeads || []).find((lead) => lead.id === id)?.name || id;
    const rows = INT.events.map((row) => `<tr class="int-ev-${esc(row.status)}"><td>${esc(when(row.created_at))}</td><td>${esc(leadName(row.lead_id))}</td><td>${esc(row.stage)}</td><td>${esc(row.channel)}<small>${esc(row.payload?.action_source || "")} · ${esc(row.payload?.event_name || "")}</small></td><td><span class="int-mode int-mode-${esc(row.mode)}">${esc(row.mode)}</span></td><td><b>${esc(row.status)}</b>${row.attempts > 1 ? `<small>${number(row.attempts)} attempts</small>` : ""}</td><td class="int-err">${esc(row.last_error || "")}</td></tr>`).join("");
    return `<div class="int-filter">${["", "sent", "pending", "retry", "failed", "paused", "cancelled"].map((status) => `<button type="button" class="${INT.eventFilter === status ? "is-on" : ""}" data-int-ev-filter="${status}">${status || "all"}</button>`).join("")}</div>
      <div class="table-wrap"><table class="int-table"><thead><tr><th>Queued</th><th>Lead</th><th>Stage</th><th>Channel</th><th>Mode</th><th>Status</th><th>Last error</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">No events yet.</td></tr>'}</tbody></table></div>`;
  }

  // CRM-attributed money view: spend from Meta, results from the CRM pipeline.
  function reportsHtml() {
    const logs = filteredLogs();
    const outcomes = filteredOutcomes();
    const leads = (state.crmLeads || []).filter((lead) => !lead.demo && overlapsRange(dateOnly(lead.createdAt), dateOnly(lead.createdAt)));
    const revenue = (n) => revenueEstimate(n, 0).revenue;
    const QUALIFIED_OUT = new Set(["new", "no_answer", "wrong_number", "not_qualified", "other_city"]);
    const group = (keyOf, nameOf) => {
      const rows = new Map();
      const row = (key) => { if (!rows.has(key)) rows.set(key, { key, name: nameOf(key), spend: 0, metaResults: 0, leads: 0, qualified: 0, booked: 0, registered: 0 }); return rows.get(key); };
      logs.forEach((log) => { const key = keyOf(relationForLog(log)); if (!key) return; const item = row(key); item.spend += Number(log.spend || 0); item.metaResults += Number(log.results || 0); });
      leads.forEach((lead) => { const key = keyOf({ ad: byId(state.creatives, lead.creativeId), adSet: byId(state.adSets, lead.adSetId), campaign: byId(state.campaigns, lead.campaignId) }); if (!key) return; const item = row(key); item.leads += 1; if (!QUALIFIED_OUT.has(lead.status)) item.qualified += 1; });
      outcomes.forEach((outcome) => { const key = keyOf(relationForOutcome(outcome)); if (!key) return; const item = row(key); if (outcome.type === "booked") item.booked += 1; if (outcome.type === "registered") item.registered += 1; });
      return [...rows.values()].filter((item) => item.spend || item.leads || item.booked || item.registered).sort((a, b) => b.registered - a.registered || b.spend - a.spend).slice(0, 25);
    };
    const per = (spend, n) => (n && spend ? money(spend / n) : "—");
    const table = (title, rows) => `<h4>${esc(title)}</h4><div class="table-wrap"><table class="int-table int-report"><thead><tr><th>Name</th><th>Spend <small>Meta</small></th><th>Meta results <small>Meta</small></th><th>Leads <small>CRM</small></th><th>Qualified <small>CRM</small></th><th>RDV <small>CRM</small></th><th>Paid <small>CRM</small></th><th>Cost / lead</th><th>Cost / qualified</th><th>Cost / RDV</th><th>Cost / paid</th><th>Revenue <small>CRM</small></th></tr></thead><tbody>${rows.map((item) => `<tr><td>${esc(item.name)}</td><td>${money(item.spend)}</td><td>${number(item.metaResults)}</td><td>${number(item.leads)}</td><td>${number(item.qualified)}</td><td><b>${number(item.booked)}</b></td><td><b>${number(item.registered)}</b></td><td>${per(item.spend, item.leads)}</td><td>${per(item.spend, item.qualified)}</td><td>${per(item.spend, item.booked)}</td><td>${per(item.spend, item.registered)}</td><td>${revenueMoney(revenue(item.registered))}</td></tr>`).join("") || '<tr><td colspan="12" class="empty">No data in this period.</td></tr>'}</tbody></table></div>`;
    const agents = (state.agents || []).map((agent) => {
      const mine = leads.filter((lead) => lead.agentId === agent.id);
      const booked = outcomes.filter((outcome) => outcome.type === "booked" && outcome.agentId === agent.id).length;
      const registered = outcomes.filter((outcome) => outcome.type === "registered" && outcome.agentId === agent.id).length;
      return { name: agent.name, leads: mine.length, qualified: mine.filter((lead) => !QUALIFIED_OUT.has(lead.status)).length, booked, registered };
    }).filter((row) => row.leads || row.booked || row.registered);
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
    const channel = ["whatsapp", "form"].map((source) => {
      const mine = leads.filter((lead) => lead.source === source);
      return { source, leads: mine.length, booked: mine.filter((lead) => lead.bookedAt).length, registered: mine.filter((lead) => lead.status === "registered").length };
    });
    return `<p class="int-note"><b>Spend</b> and <b>Meta results</b> come from Meta (API sync or CSV). <b>Leads, Qualified, RDV, Paid and Revenue</b> are <b>CRM-attributed</b> (your pipeline). What Meta itself attributes to the Conversions API events is visible in Ads Manager → Columns → Conversions. Period: the date filter of the Overview page.</p>
      ${table("By campaign", group((rel) => rel.campaign?.id || "", (key) => byId(state.campaigns, key)?.name || key))}
      ${table("By ad set", group((rel) => rel.adSet?.id || "", (key) => byId(state.adSets, key)?.name || key))}
      ${table("By creative (ad)", group((rel) => rel.ad?.id || "", (key) => byId(state.creatives, key)?.name || key))}
      <div class="int-two"><div><h4>Agents</h4><div class="table-wrap"><table class="int-table"><thead><tr><th>Agent</th><th>Leads</th><th>Qualified</th><th>RDV</th><th>Paid</th><th>Lead → RDV</th><th>RDV → paid</th></tr></thead><tbody>${agents.map((row) => `<tr><td>${esc(row.name)}</td><td>${number(row.leads)}</td><td>${number(row.qualified)}</td><td><b>${number(row.booked)}</b></td><td><b>${number(row.registered)}</b></td><td>${pct(row.booked, row.leads)}</td><td>${pct(row.registered, row.booked)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No leads in this period.</td></tr>'}</tbody></table></div></div>
      <div><h4>WhatsApp vs Instant Forms <small>(CRM leads)</small></h4><div class="table-wrap"><table class="int-table"><thead><tr><th>Channel</th><th>Leads</th><th>RDV</th><th>Paid</th><th>Lead → RDV</th><th>RDV → paid</th></tr></thead><tbody>${channel.map((row) => `<tr><td>${row.source === "form" ? "Instant Forms" : "WhatsApp"}</td><td>${number(row.leads)}</td><td>${number(row.booked)}</td><td>${number(row.registered)}</td><td>${pct(row.booked, row.leads)}</td><td>${pct(row.registered, row.booked)}</td></tr>`).join("")}</tbody></table></div><p class="int-note">Full cost comparison with ROI: Leads page → split test.</p></div></div>`;
  }

  function render() {
    const el = root();
    if (!el || !isAdmin()) return;
    const s = INT.status;
    if (!s) { el.innerHTML = `<p class="int-note">${INT.error ? `⚠️ ${esc(INT.error)}` : "Loading integrations…"}</p>`; return; }
    const capi = s.settings.capi;
    const ads = s.settings.ads;
    const wa = s.settings.whatsapp;
    const env = s.env;
    const webhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;
    const capiReady = env.META_DATASET_ID && (env.META_ACCESS_TOKEN || env.META_CAPI_TOKEN);
    const adsReady = env.META_AD_ACCOUNT_ID && env.META_ACCESS_TOKEN;
    const waReady = env.META_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN;
    const lastRun = s.ads.runs[0];
    const cov = s.coverage;
    const covPct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
    const agentsOptions = (selected) => `<option value="">Automatic distribution</option>${(state.agents || []).map((agent) => `<option value="${esc(agent.id)}" ${agent.id === selected ? "selected" : ""}>${esc(agent.name)}</option>`).join("")}`;
    el.innerHTML = `
      <section class="card int-card"><h3>🔐 Credentials <small>Hostinger → Node.js app → Environment variables</small></h3>${envList(env)}<p class="int-note">Secret values are never shown or stored in the CRM data. Everything below stays OFF until you switch it on. Full setup: INTEGRATIONS.md.</p></section>
      <section class="int-grid">
        <article class="card int-card"><h3>${dot(capiReady && capi.enabled && !s.capi.paused, capiReady && !capi.enabled)} Conversions API <small>RDV & paid registrations → Meta</small></h3>
          ${s.capi.paused ? `<p class="int-alert">⛔ Queue paused: ${esc(s.capi.paused)}. Fix the token or permissions, then press “Retry failed”.</p>` : ""}
          ${!capiReady ? '<p class="int-alert is-info">Add META_DATASET_ID and META_ACCESS_TOKEN in Hostinger to enable.</p>' : ""}
          <div class="int-controls">
            <label class="int-switch"><input type="checkbox" data-int-set="capi.enabled" ${capi.enabled ? "checked" : ""} ${capiReady ? "" : "disabled"} /><span>Send events</span></label>
            <label><span>Mode</span><select data-int-set="capi.mode"><option value="test" ${capi.mode === "test" ? "selected" : ""}>Test (Events Manager test tool only)</option><option value="live" ${capi.mode === "live" ? "selected" : ""}>Live (counts in reporting)</option></select></label>
            <label><span>Send events from</span><input type="date" value="${esc(capi.since)}" data-int-set="capi.since" /></label>
            <label class="int-switch"><input type="checkbox" data-int-set="capi.sendBooked" ${capi.sendBooked ? "checked" : ""} /><span>RDV</span></label>
            <label class="int-switch"><input type="checkbox" data-int-set="capi.sendRegistered" ${capi.sendRegistered ? "checked" : ""} /><span>Registered (paid)</span></label>
          </div>
          <details class="int-more"><summary>Event names</summary><div class="int-controls">
            <label><span>Instant Form stage: RDV</span><input value="${esc(capi.formStages.booked)}" data-int-set="capi.formStages.booked" /></label>
            <label><span>Instant Form stage: paid</span><input value="${esc(capi.formStages.registered)}" data-int-set="capi.formStages.registered" /></label>
            <label><span>WhatsApp/offline: RDV event</span><input value="${esc(capi.events.booked)}" data-int-set="capi.events.booked" /></label>
            <label><span>WhatsApp/offline: paid event</span><input value="${esc(capi.events.registered)}" data-int-set="capi.events.registered" /></label>
          </div><p class="int-note">Instant Form stage names must match the lead stages you set in Events Manager (Conversion Leads). Paid registrations carry the value from Settings (revenue per student) in MAD.</p></details>
          ${countsTable(s.capi.counts)}
          <div class="int-actions"><button type="button" class="button secondary" data-int-run>Run now</button><button type="button" class="button secondary" data-int-retry>Retry failed</button></div>
        </article>

        <article class="card int-card"><h3>${dot(adsReady && ads.enabled && lastRun?.status === "ok", adsReady && !ads.enabled)} Ad spend sync <small>Marketing API, replaces the CSV</small></h3>
          ${!adsReady ? '<p class="int-alert is-info">Add META_AD_ACCOUNT_ID and META_ACCESS_TOKEN (ads_read) in Hostinger to enable.</p>' : ""}
          <div class="int-controls">
            <label class="int-switch"><input type="checkbox" data-int-set="ads.enabled" ${ads.enabled ? "checked" : ""} ${adsReady ? "" : "disabled"} /><span>Automatic sync</span></label>
            <label><span>Every</span><select data-int-set="ads.everyHours">${[1, 2, 3, 6, 12, 24].map((h) => `<option value="${h}" ${ads.everyHours === h ? "selected" : ""}>${h} h</option>`).join("")}</select></label>
            <label><span>First sync from</span><input type="date" value="${esc(ads.backfillFrom)}" data-int-set="ads.backfillFrom" /></label>
          </div>
          <div class="int-controls"><label><span>Sync now from</span><input type="date" data-int-sync-from /></label><label><span>to</span><input type="date" data-int-sync-to /></label><button type="button" class="button secondary" data-int-sync ${adsReady ? "" : "disabled"}>${s.ads.busy ? "Syncing…" : "Sync now"}</button></div>
          <p class="int-note">Last sync: <b>${lastRun ? `${esc(lastRun.status)} · ${ago(lastRun.finished_at || lastRun.started_at)}` : "never"}</b>${lastRun?.message ? ` · ${esc(lastRun.message)}` : ""}. Every run re-reads the last 3 days so late Meta figures are corrected. CSV rows of synced days are replaced, never added twice.</p>
          <ul class="int-runs">${s.ads.runs.map((run) => `<li>${dot(run.status === "ok", run.status === "running")}${esc(when(run.started_at))} · ${esc(run.status)} · ${number(run.rows_count)} rows ${run.message ? `· ${esc(run.message)}` : ""}</li>`).join("")}</ul>
        </article>

        <article class="card int-card"><h3>${dot(waReady && wa.enabled && s.whatsapp.lastWebhookAt, waReady && !wa.enabled)} WhatsApp Cloud API <small>automatic leads + ad referral</small></h3>
          ${!waReady ? '<p class="int-alert is-info">Add META_APP_SECRET and WHATSAPP_VERIFY_TOKEN in Hostinger, then configure the webhook in Meta Developers.</p>' : ""}
          <div class="int-copy"><span>Callback URL</span><code>${esc(webhookUrl)}</code><button type="button" data-int-copy="${esc(webhookUrl)}">Copy</button></div>
          <div class="int-controls"><label class="int-switch"><input type="checkbox" data-int-set="whatsapp.enabled" ${wa.enabled ? "checked" : ""} ${waReady ? "" : "disabled"} /><span>Create leads from incoming messages</span></label></div>
          <h4>Business numbers → agent</h4>
          <div class="int-numbers">${wa.numbers.map((item, index) => `<div class="int-number"><input placeholder="Phone number ID" value="${esc(item.phoneNumberId)}" data-int-num="${index}" data-field="phoneNumberId" /><input placeholder="Label (e.g. Wiam)" value="${esc(item.label)}" data-int-num="${index}" data-field="label" /><select data-int-num="${index}" data-field="agentId">${agentsOptions(item.agentId)}</select><button type="button" data-int-num-remove="${index}" aria-label="Remove">×</button></div>`).join("")}
            <button type="button" class="button secondary" data-int-num-add>+ Add a number</button></div>
          <p class="int-note">Last webhook: <b>${ago(s.whatsapp.lastWebhookAt || s.whatsapp.last)}</b> · Messages (30 days): <b>${number(s.whatsapp.total || 0)}</b>, from ads: <b>${number(s.whatsapp.referred || 0)}</b>. Do not connect Wiam's or Souad's real numbers before reading the coexistence steps in INTEGRATIONS.md.</p>
        </article>

        <article class="card int-card"><h3>📌 Attribution coverage <small>last 30 days</small></h3>
          <div class="int-counts">
            <div class="int-count is-ok"><strong>${covPct(cov.whatsappApi, cov.whatsappLeads)}</strong><span>WhatsApp leads with ad confirmed by API</span><small>${number(cov.whatsappApi)} / ${number(cov.whatsappLeads)}</small></div>
            <div class="int-count is-warn"><strong>${covPct(cov.whatsappManual, cov.whatsappLeads)}</strong><span>WhatsApp leads with ad chosen by hand</span><small>${number(cov.whatsappManual)} / ${number(cov.whatsappLeads)}</small></div>
            <div class="int-count is-ok"><strong>${covPct(cov.formLinked, cov.formLeads)}</strong><span>Form leads linked to their ad (Meta ids)</span><small>${number(cov.formLinked)} / ${number(cov.formLeads)}</small></div>
          </div>
          <p class="int-note">“Confirmed by API” = the ad id came from WhatsApp's referral. The CRM never invents an ad when it is missing.</p>
          <h4>Integration log</h4><ul class="int-log">${(s.log || []).slice(0, 15).map((row) => `<li class="is-${esc(row.level)}"><time>${esc(when(row.at))}</time> <b>${esc(row.kind)}</b> ${esc(row.message)}</li>`).join("") || "<li>Nothing yet.</li>"}</ul>
        </article>
      </section>
      <section class="card int-card"><h3>📤 Conversion event log</h3>${eventsTable()}</section>
      <section class="card int-card"><h3>💰 Cost & revenue by campaign, ad set, ad and agent</h3>${reportsHtml()}</section>`;
  }

  function setPath(target, pathText, value) {
    const keys = pathText.split(".");
    let node = target;
    keys.slice(0, -1).forEach((key) => { node[key] = node[key] || {}; node = node[key]; });
    node[keys[keys.length - 1]] = value;
    return target;
  }

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("#integrationsRoot [data-int-set]");
    if (input) {
      let value = input.type === "checkbox" ? input.checked : input.value;
      if (input.dataset.intSet === "ads.everyHours") value = Number(value);
      if (input.dataset.intSet === "capi.mode" && value === "live" && !window.confirm("Live mode: events will count in your Meta reporting and optimization. Continue?")) { render(); return; }
      save(setPath({}, input.dataset.intSet, value), "Saved ✓");
      return;
    }
    const num = event.target.closest?.("#integrationsRoot [data-int-num]");
    if (num) {
      const numbers = INT.status.settings.whatsapp.numbers.map((item) => ({ ...item }));
      numbers[Number(num.dataset.intNum)][num.dataset.field] = num.value;
      save({ whatsapp: { numbers } }, "Saved ✓");
    }
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest(".tab[data-tab='integrations'], [data-tab-link='integrations']")) { load(); return; }
    const el = event.target.closest("#integrationsRoot [data-int-run], #integrationsRoot [data-int-retry], #integrationsRoot [data-int-sync], #integrationsRoot [data-int-copy], #integrationsRoot [data-int-num-add], #integrationsRoot [data-int-num-remove], #integrationsRoot [data-int-ev-filter]");
    if (!el) return;
    try {
      if (el.matches("[data-int-copy]")) { await navigator.clipboard.writeText(el.dataset.intCopy); toast("Copied ✓"); return; }
      if (el.matches("[data-int-ev-filter]")) { INT.eventFilter = el.dataset.intEvFilter; await load(); return; }
      if (el.matches("[data-int-num-add]")) { const numbers = [...INT.status.settings.whatsapp.numbers, { phoneNumberId: "", agentId: "", label: "" }]; INT.status.settings.whatsapp.numbers = numbers; render(); return; }
      if (el.matches("[data-int-num-remove]")) { const numbers = INT.status.settings.whatsapp.numbers.filter((_, index) => index !== Number(el.dataset.intNumRemove)); await save({ whatsapp: { numbers } }, "Removed"); return; }
      el.disabled = true;
      if (el.matches("[data-int-run]")) { const res = await api("/api/integrations/capi/run", { method: "POST", body: "{}" }); toast(`Queued ${res.queued}, sent ${res.sent}`); }
      if (el.matches("[data-int-retry]")) { const res = await api("/api/integrations/capi/retry", { method: "POST", body: "{}" }); toast(`${res.retried} event(s) will be retried`); }
      if (el.matches("[data-int-sync]")) {
        const from = root().querySelector("[data-int-sync-from]")?.value || "";
        const to = root().querySelector("[data-int-sync-to]")?.value || "";
        toast("Syncing ads…");
        const res = await api("/api/integrations/ads/sync", { method: "POST", body: JSON.stringify({ from, to }) });
        toast(`Synced ${res.written} rows (${res.since} → ${res.until})`);
        await window.load?.();
      }
    } catch (error) {
      toast(error.message, "error");
    } finally {
      el.disabled = false;
      await load();
    }
  });

  // Open directly on #view=integrations.
  const waitForState = setInterval(() => {
    if (typeof state !== "undefined" && state) {
      clearInterval(waitForState);
      if (document.getElementById("integrations")?.classList.contains("active")) load();
    }
  }, 500);
})();
