// Meta Lead Feedback: CRM stage changes -> `lead_status` cell of the connected
// Instant Form Google Sheet -> (Meta's native connector) -> Conversions API.
//
// Flow: agents work normally. Every 30 s `tick()` (1) reconciles: each eligible lead's
// milestones become idempotent jobs, (2) processes due jobs: find the row by Meta lead
// id, re-read it, check the transition, write ONE cell, log the result.
// A successful write means "Sheet updated" - NOT "Meta received the event".
const crypto = require("crypto");
const Map_ = require("./sheet-mapping");
const G = require("./google-sheets");

const RETRY_MINUTES = [1, 5, 30, 120, 720];
const MAX_ATTEMPTS = 6;
const STATUS_LABELS = {
  pending: "Waiting", retry: "Retrying", updated: "Sheet updated", in_sync: "Already in sync", skipped: "Skipped",
  superseded: "Superseded", blocked: "Blocked: value not confirmed", held: "Held: duplicate submission", failed: "Failed", paused: "Paused",
};

function createSheetFeedback({ storage, lock, store, Leads, env = process.env, fetchImpl = (...args) => fetch(...args), clientFactory = null, log: consoleLog = console, now = () => Date.now() }) {
  const runtime = { busy: false, paused: "", lastError: null, lastImport: { at: "", rows: 0, added: 0, tagged: 0, error: "" } };
  const options = { leadHadRdv: Leads.leadHadRdv };
  const settingsOf = (state) => Map_.normalizeSheetFeedbackSettings(state.settings?.integrations?.sheetFeedback || {});
  const credentials = () => G.credentialsFromEnv(env);
  let clientCache = { key: "", client: null };
  function client() {
    const creds = credentials();
    if (clientFactory) return clientFactory(creds);
    const key = creds?.email || creds?.error || "";
    if (clientCache.key !== key || !clientCache.client) clientCache = { key, client: G.createSheetsClient({ credentials: creds, fetchImpl }) };
    return clientCache.client;
  }
  async function readState() {
    const release = await lock();
    try { return await storage.read(); } finally { release(); }
  }
  const tabRange = (cfg) => G.quoteSheet(cfg.sheetName);
  const readTab = (cfg) => client().getValues(cfg.spreadsheetId, tabRange(cfg));
  const jobId = (lead, milestone) => `${lead.id}:${milestone.stage}:${milestone.at}`;
  const backoff = (attempts, retryAfterMs = 0) => new Date(now() + Math.max(retryAfterMs, RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)] * 60000)).toISOString();
  const noteError = async (message, level = "error") => {
    runtime.lastError = { at: new Date(now()).toISOString(), message };
    await store.log("sheets", level, message);
  };

  // ---------- 1. CRM -> queue ----------
  async function reconcile() {
    const state = await readState();
    const cfg = settingsOf(state);
    if (!cfg.enabled) return 0;
    const leads = state.crmLeads || [];
    const flags = Map_.duplicateFlags(leads, cfg, options);
    let added = 0;
    for (const lead of leads) {
      if (!Map_.eligibility(lead, cfg).eligible) continue;
      const flag = flags.get(lead.id);
      if (flag === "skip") continue;
      for (const milestone of Map_.milestonesForLead(lead, options)) {
        // No automatic historical sync: only milestones from the day the sync was enabled.
        if (cfg.since && String(milestone.at).slice(0, 10) < cfg.since) continue;
        const confirmed = cfg.stages[milestone.stage].confirmed;
        const status = flag === "ambiguous" ? "held" : confirmed ? "pending" : "blocked";
        const lastError = status === "held" ? "Duplicate submission: several leads with this phone reached a stage. Choose which one reports." : status === "blocked" ? `“${cfg.stages[milestone.stage].value}” is not confirmed in Events Manager yet` : null;
        const fresh = await store.enqueueSheetJob({ id: jobId(lead, milestone), leadId: lead.id, metaLeadId: G.stripId(lead.externalId), spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, stage: milestone.stage, milestoneAt: milestone.at, status, lastError });
        if (fresh) added += 1;
      }
    }
    if (added) await store.log("sheets", "info", `${added} lead status update(s) queued`);
    return added;
  }

  // ---------- 2. queue -> sheet ----------
  async function lastWriteAt(leadId) {
    const [last] = await store.listSheetJobs({ leadId, status: "updated", limit: 1 });
    return last ? Date.parse(last.updated_at) : 0;
  }

  async function failJob(job, error, extra = {}) {
    const attempts = job.attempts + 1;
    if (error instanceof G.SheetsError && ["auth", "permission", "not_found"].includes(error.kind)) {
      runtime.paused = error.message;
      await store.updateSheetJob(job.id, { status: "paused", attempts, last_error: error.message, ...extra });
      await noteError(`Queue paused: ${error.message}. Share the sheet with the service account (Editor) or fix the connection, then press “Retry failed”.`);
      return "stop";
    }
    const transient = !(error instanceof G.SheetsError) || ["rate_limit", "transient"].includes(error.kind) || extra.retryable;
    if (transient && attempts < MAX_ATTEMPTS) {
      await store.updateSheetJob(job.id, { status: "retry", attempts, last_error: error.message, next_attempt_at: backoff(attempts - 1, error.retryAfterMs || 0), ...extra });
      if (error.kind === "rate_limit") { await noteError(error.message, "warn"); return "stop"; }
      return "retry";
    }
    await store.updateSheetJob(job.id, { status: "failed", attempts, last_error: error.message, ...extra });
    await noteError(`${job.meta_lead_id} → ${job.stage}: ${error.message}`);
    return "failed";
  }

  async function processJob(job, ctx) {
    const { state, cfg, flags, snapshot, columns } = ctx;
    const lead = (state.crmLeads || []).find((item) => item.id === job.lead_id);
    const correction = job.kind === "correction";
    if (!lead) { await store.updateSheetJob(job.id, { status: "skipped", last_error: "Lead deleted from the CRM" }); return; }
    if (!correction) {
      const elig = Map_.eligibility(lead, cfg);
      if (!elig.eligible) { await store.updateSheetJob(job.id, { status: "skipped", last_error: elig.reason }); return; }
      const holds = Map_.milestonesForLead(lead, options).some((item) => item.stage === job.stage && item.at === job.milestone_at);
      if (!holds) { await store.updateSheetJob(job.id, { status: "superseded", last_error: `Lead is now “${lead.status}”: this milestone no longer applies` }); return; }
      const flag = flags.get(lead.id);
      if (flag === "ambiguous") { await store.updateSheetJob(job.id, { status: "held", last_error: "Duplicate submission: choose which lead reports" }); return; }
      if (flag === "skip") { await store.updateSheetJob(job.id, { status: "skipped", last_error: "Duplicate submission marked “do not report”" }); return; }
    }
    const stageCfg = cfg.stages[job.stage];
    if (!stageCfg?.confirmed) { await store.updateSheetJob(job.id, { status: "blocked", last_error: `“${stageCfg?.value}” is not confirmed in Events Manager yet` }); return; }
    // Give Meta's connector time to see each milestone (Visited, then Paid minutes later).
    if (!correction && cfg.minStageIntervalMinutes) {
      const last = await lastWriteAt(lead.id);
      const readyAt = last + cfg.minStageIntervalMinutes * 60000;
      if (last && readyAt > now()) { await store.updateSheetJob(job.id, { next_attempt_at: new Date(readyAt).toISOString(), last_error: "Waiting so Meta can see the previous stage first" }); return; }
    }
    const matches = G.locateLead(snapshot, job.meta_lead_id, columns);
    if (matches.length > 1) { await store.updateSheetJob(job.id, { status: "failed", attempts: job.attempts + 1, last_error: `${matches.length} rows hold Meta lead id ${job.meta_lead_id}: not guessing` }); await noteError(`Ambiguous rows for ${job.meta_lead_id}`); return; }
    if (!matches.length) return failJob(job, new Error("Meta lead id not found in the tab (row deleted, moved to another tab, or not written by Meta yet)"), { retryable: true });
    const rowNumber = matches[0].rowNumber;
    const lastCol = G.columnLetter(Math.max(columns.idCol, columns.statusCol));
    // Row numbers are never trusted: re-read this exact row right before writing.
    const [fresh = []] = await client().getValues(cfg.spreadsheetId, `${tabRange(cfg)}!A${rowNumber}:${lastCol}${rowNumber}`);
    if (G.stripId(fresh[columns.idCol]) !== G.stripId(job.meta_lead_id)) return failJob(job, new Error("Rows moved during the update: will locate the lead again"), { retryable: true });
    const raw = String(fresh[columns.statusCol] ?? "");
    const current = Map_.parseSheetValue(raw, cfg);
    const decision = Map_.decideTransition(current, job.stage, { correction });
    const base = { row: rowNumber, from: raw, fromStage: current };
    if (decision.action === "noop") { await store.updateSheetJob(job.id, { status: "in_sync", attempts: job.attempts + 1, last_error: null, result: base }); return; }
    if (decision.action === "skip") { await store.updateSheetJob(job.id, { status: "skipped", attempts: job.attempts + 1, last_error: decision.reason, result: base }); await store.log("sheets", "warn", `${job.meta_lead_id} → ${job.stage} skipped: ${decision.reason}`); return; }
    const range = `${tabRange(cfg)}!${G.columnLetter(columns.statusCol)}${rowNumber}`;
    await client().updateCell(cfg.spreadsheetId, range, stageCfg.value);
    await store.updateSheetJob(job.id, { status: "updated", attempts: job.attempts + 1, last_error: null, result: { ...base, range, to: stageCfg.value } });
    await store.log("sheets", "info", `Sheet updated: lead ${job.meta_lead_id} ${raw || "(empty)"} → ${stageCfg.value}${correction ? " (admin correction)" : ""}`);
  }

  async function processDue({ limit = 10 } = {}) {
    if (runtime.paused) return 0;
    const state = await readState();
    const cfg = settingsOf(state);
    if (!cfg.enabled) return 0;
    const due = await store.dueSheetJobs(200);
    if (!due.length) return 0;
    // One job per lead per run, lowest funnel stage first (Visited before Paid).
    const perLead = new Map();
    due.forEach((job) => {
      const best = perLead.get(job.lead_id);
      const rank = (item) => Map_.RANK[item.stage] ?? 9;
      if (!best || rank(job) < rank(best) || (rank(job) === rank(best) && job.created_at < best.created_at)) perLead.set(job.lead_id, job);
    });
    const jobs = [...perLead.values()].slice(0, limit);
    let snapshot;
    try {
      snapshot = await readTab(cfg);
    } catch (error) {
      for (const job of jobs) { if (await failJob(job, error) === "stop") break; }
      return 0;
    }
    const columns = G.findColumns(snapshot[0]);
    if (columns.idCol < 0 || columns.statusCol < 0) {
      runtime.paused = `The tab “${cfg.sheetName}” has no ${columns.idCol < 0 ? "“id”" : "“lead_status”"} column`;
      await noteError(`Queue paused: ${runtime.paused}`);
      return 0;
    }
    const ctx = { state, cfg, flags: Map_.duplicateFlags(state.crmLeads || [], cfg, options), snapshot, columns };
    let done = 0;
    for (const job of jobs) {
      try {
        await processJob(job, ctx);
        done += 1;
      } catch (error) {
        if (await failJob(job, error) === "stop") break;
      }
    }
    return done;
  }

  async function tick() {
    if (runtime.busy) return;
    runtime.busy = true;
    try { await reconcile(); await processDue(); } catch (error) { consoleLog.error("Sheet feedback tick failed:", error.message); await noteError(error.message).catch(() => {}); } finally { runtime.busy = false; }
  }

  async function retryFailed() {
    runtime.paused = "";
    const n = await store.requeueSheetJobs({ statuses: ["failed", "paused"] });
    await store.log("sheets", "info", `Retry requested for ${n} update(s)`);
    return n;
  }

  // ---------- Lead import from the connected sheet (Sheets API, private sheet) ----------
  async function importLeads({ onAdded } = {}) {
    let state = await readState();
    const cfg = settingsOf(state);
    const creds = credentials();
    if (!cfg.importLeads || !cfg.spreadsheetId || !creds || creds.error) return runtime.lastImport;
    try {
      const rows = G.rowsAsObjects(await readTab(cfg));
      const release = await lock();
      try {
        state = await storage.read();
        const summary = Leads.ingestLeadRows(state, rows, { distribution: state.settings.leadDistribution, source: "form" });
        const tagged = Leads.tagIntake(state, rows, { spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, via: "sheets_api" });
        if (summary.added || tagged) await storage.write(state);
        runtime.lastImport = { at: new Date(now()).toISOString(), rows: rows.length, added: summary.added, tagged, error: "" };
        if (summary.added && onAdded) onAdded(summary);
      } finally {
        release();
      }
    } catch (error) {
      runtime.lastImport = { ...runtime.lastImport, at: new Date(now()).toISOString(), error: error.message };
    }
    return runtime.lastImport;
  }

  // ---------- Admin tools ----------
  async function saveSettings(patch = {}, by = "") {
    const release = await lock();
    try {
      const state = await storage.read();
      const current = settingsOf(state);
      const merged = { ...current, ...patch, stages: { ...current.stages }, duplicates: { ...current.duplicates, ...(patch.duplicates || {}) } };
      // Stage values: a changed spelling must be confirmed again.
      Object.entries(patch.stages || {}).forEach(([stage, value]) => {
        if (!current.stages[stage]) return;
        const nextValue = String(value?.value ?? current.stages[stage].value).trim();
        merged.stages[stage] = nextValue === current.stages[stage].value ? { ...current.stages[stage], note: value?.note ?? current.stages[stage].note } : { value: nextValue, confirmed: false, confirmedAt: "", confirmedBy: "", note: "" };
      });
      if (patch.since === undefined && merged.enabled && !current.enabled && !current.since) merged.since = new Date(now()).toISOString().slice(0, 10);
      const next = Map_.normalizeSheetFeedbackSettings(merged);
      const errors = Map_.connectionErrors(next);
      if (errors.length) throw new Error(errors.join(" "));
      state.settings.integrations = { ...(state.settings.integrations || {}), sheetFeedback: next };
      await storage.write(state);
      await store.log("settings", "info", `Meta lead feedback: sync ${next.enabled ? "on" : "off"}, import ${next.importLeads ? "on" : "off"}${by ? ` (by ${by})` : ""}`);
      if (patch.duplicates) await store.requeueSheetJobs({ statuses: ["held"] });
      return next;
    } finally {
      release();
    }
  }

  // The admin attests a stage value was seen in Events Manager for this dataset.
  async function confirmStage({ stage, confirmed, note = "", by = "" }) {
    if (!Map_.STAGES.includes(stage)) throw new Error("Unknown stage");
    const release = await lock();
    let next;
    try {
      const state = await storage.read();
      const current = settingsOf(state);
      current.stages[stage] = { ...current.stages[stage], confirmed: confirmed === true, confirmedAt: confirmed ? new Date(now()).toISOString() : "", confirmedBy: confirmed ? by : "", note: String(note || "").slice(0, 300) };
      next = Map_.normalizeSheetFeedbackSettings(current);
      state.settings.integrations = { ...(state.settings.integrations || {}), sheetFeedback: next };
      await storage.write(state);
    } finally {
      release();
    }
    await store.log("sheets", "info", `Stage ${stage} (“${next.stages[stage].value}”) ${confirmed ? "confirmed in Events Manager" : "marked unconfirmed"}${by ? ` by ${by}` : ""}${note ? `: ${note}` : ""}`);
    const unblocked = confirmed ? await store.requeueSheetJobs({ statuses: ["blocked"], stage }) : 0;
    return { stage: next.stages[stage], unblocked };
  }

  async function testConnection() {
    const state = await readState();
    const cfg = settingsOf(state);
    const creds = credentials();
    const out = { ok: false, serviceAccountEmail: creds?.email || "", spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, checks: [] };
    const check = (ok, label, detail = "") => { out.checks.push({ ok, label, detail }); return ok; };
    if (!check(Boolean(creds && !creds.error), "Google service account credentials", creds?.error || (creds ? creds.email : "GOOGLE_SERVICE_ACCOUNT_JSON is not set"))) return out;
    if (!check(!Map_.LEGACY.spreadsheetIds.includes(cfg.spreadsheetId), "Not the old integration's spreadsheet")) return out;
    try {
      const meta = await client().getSpreadsheet(cfg.spreadsheetId);
      out.title = meta.properties?.title || "";
      const tabs = (meta.sheets || []).map((sheet) => sheet.properties?.title);
      check(true, "Spreadsheet reachable", out.title);
      if (!check(tabs.includes(cfg.sheetName), `Tab “${cfg.sheetName}” exists`, `Tabs: ${tabs.join(", ")}`)) return out;
      const values = await readTab(cfg);
      const columns = G.findColumns(values[0]);
      check(columns.idCol >= 0, "Meta lead id column (“id”)", columns.idCol >= 0 ? `column ${G.columnLetter(columns.idCol)}` : "not found");
      check(columns.statusCol >= 0, "“lead_status” column", columns.statusCol >= 0 ? `column ${G.columnLetter(columns.statusCol)}` : "not found");
      const formIds = [...new Set(values.slice(1).map((row) => Map_.stripFormId(row[columns.formCol])).filter(Boolean))];
      check(!formIds.length || formIds.includes(cfg.formId), "Rows come from the connected Instant Form", formIds.length ? `form ids in sheet: ${formIds.join(", ")}` : "no rows yet");
      out.rows = Math.max(0, values.length - 1);
      out.idColumn = columns.idCol >= 0 ? G.columnLetter(columns.idCol) : "";
      out.statusColumn = columns.statusCol >= 0 ? G.columnLetter(columns.statusCol) : "";
      out.statusValues = [...new Set(values.slice(1).map((row) => String(row[columns.statusCol] ?? "")))].slice(0, 20);
      out.writeAccess = "Checked on the first update (the test never writes)";
      out.ok = out.checks.every((item) => item.ok);
    } catch (error) {
      check(false, "Google Sheets API", error.message);
    }
    return out;
  }

  // Dry run for one lead: what would happen, without writing anything.
  async function testMatch({ leadId = "", metaLeadId = "" } = {}) {
    const state = await readState();
    const cfg = settingsOf(state);
    const target = G.stripId(metaLeadId);
    const lead = (state.crmLeads || []).find((item) => (leadId && item.id === leadId) || (target && G.stripId(item.externalId) === target));
    const out = { found: Boolean(lead), leadId: lead?.id || "", metaLeadId: lead ? G.stripId(lead.externalId) : target, crmStatus: lead?.status || "" };
    if (!lead) { out.reason = "No CRM lead with this id"; }
    else {
      const elig = Map_.eligibility(lead, cfg);
      Object.assign(out, { eligible: elig.eligible, reason: elig.reason, milestones: Map_.milestonesForLead(lead, options), desired: Map_.desiredStage(lead, options), duplicate: Map_.duplicateFlags(state.crmLeads || [], cfg, options).get(lead.id) || "" });
      out.jobs = (await store.listSheetJobs({ leadId: lead.id, limit: 20 })).map((job) => ({ stage: job.stage, status: job.status, label: STATUS_LABELS[job.status] || job.status, error: job.last_error || "", at: job.updated_at }));
    }
    const creds = credentials();
    if (out.metaLeadId && creds && !creds.error) {
      try {
        const values = await readTab(cfg);
        const columns = G.findColumns(values[0]);
        const rows = G.locateLead(values, out.metaLeadId, columns);
        out.sheetRows = rows.map((item) => item.rowNumber);
        if (rows.length === 1) {
          out.sheetValue = String(rows[0].row[columns.statusCol] ?? "");
          out.sheetStage = Map_.parseSheetValue(out.sheetValue, cfg);
          if (out.desired) out.decision = Map_.decideTransition(out.sheetStage, out.desired.stage);
        }
      } catch (error) { out.sheetError = error.message; }
    } else if (!creds || creds.error) out.sheetError = "Google credentials not configured: sheet not checked";
    return out;
  }

  function previewMapping(state) {
    const cfg = settingsOf(state);
    const counts = {};
    const reasons = {};
    (state.crmLeads || []).filter((lead) => lead.source === "form" && !lead.demo).forEach((lead) => {
      const elig = Map_.eligibility(lead, cfg);
      if (!elig.eligible) { reasons[elig.reason] = (reasons[elig.reason] || 0) + 1; return; }
      const stage = Map_.desiredStage(lead, options)?.stage || "none";
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return {
      rows: Map_.STATUS_MAP.map(([status, label, stage, rule]) => ({ status, label, stage, value: stage ? cfg.stages[stage].value : "", confirmed: stage ? cfg.stages[stage].confirmed : null, rule })),
      eligibleByStage: counts,
      ineligible: reasons,
    };
  }

  // Historical reconciliation: dry run first, apply only with the plan id it returned.
  async function backfillPlan() {
    const state = await readState();
    const cfg = settingsOf(state);
    const formLeads = (state.crmLeads || []).filter((lead) => lead.source === "form" && !lead.demo);
    const flags = Map_.duplicateFlags(state.crmLeads || [], cfg, options);
    const plan = { matching: 0, missingMetaId: 0, ambiguous: 0, eligibleUpdates: 0, skipped: 0, skippedReasons: {}, jobs: [] };
    for (const lead of formLeads) {
      const elig = Map_.eligibility(lead, cfg);
      if (!elig.eligible) {
        if (elig.reason === "Missing Meta lead id") plan.missingMetaId += 1;
        plan.skipped += 1;
        plan.skippedReasons[elig.reason] = (plan.skippedReasons[elig.reason] || 0) + 1;
        continue;
      }
      plan.matching += 1;
      if (flags.get(lead.id) === "ambiguous") { plan.ambiguous += 1; continue; }
      if (flags.get(lead.id) === "skip") continue;
      // Only the furthest stage per lead: history is not replayed step by step.
      const top = Map_.desiredStage(lead, options);
      if (!top || (cfg.since && String(top.at).slice(0, 10) >= cfg.since)) continue;
      const id = jobId(lead, top);
      if (await store.hasSheetJob(id)) continue;
      plan.jobs.push({ id, leadId: lead.id, metaLeadId: G.stripId(lead.externalId), stage: top.stage, milestoneAt: top.at, name: lead.name || "" });
    }
    plan.eligibleUpdates = plan.jobs.length;
    const creds = credentials();
    if (plan.jobs.length && creds && !creds.error) {
      try {
        const values = await readTab(cfg);
        const columns = G.findColumns(values[0]);
        plan.notInSheet = plan.jobs.filter((job) => G.locateLead(values, job.metaLeadId, columns).length !== 1).length;
      } catch (error) { plan.sheetError = error.message; }
    }
    plan.planId = crypto.createHash("sha256").update(plan.jobs.map((job) => job.id).sort().join("|")).digest("hex").slice(0, 16);
    return { ...plan, jobs: plan.jobs.slice(0, 200), sample: plan.jobs.length > 200 };
  }

  async function backfillApply({ planId, by = "" }) {
    const plan = await backfillPlanFull();
    if (!planId || planId !== plan.planId) throw new Error("The data changed since the preview: run the dry run again before approving");
    const state = await readState();
    const cfg = settingsOf(state);
    let queued = 0;
    for (const job of plan.jobs) {
      const confirmed = cfg.stages[job.stage].confirmed;
      if (await store.enqueueSheetJob({ ...job, spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, kind: "backfill", requestedBy: by, status: confirmed ? "pending" : "blocked", lastError: confirmed ? null : "Stage value not confirmed" })) queued += 1;
    }
    await store.log("sheets", "info", `Historical backfill approved${by ? ` by ${by}` : ""}: ${queued} update(s) queued`);
    return { queued };
  }
  async function backfillPlanFull() {
    const plan = await backfillPlan();
    if (!plan.sample) return plan;
    // Re-run without truncation for apply.
    const state = await readState();
    const cfg = settingsOf(state);
    const flags = Map_.duplicateFlags(state.crmLeads || [], cfg, options);
    const jobs = [];
    for (const lead of state.crmLeads || []) {
      if (!Map_.eligibility(lead, cfg).eligible || flags.get(lead.id)) continue;
      const top = Map_.desiredStage(lead, options);
      if (!top || (cfg.since && String(top.at).slice(0, 10) >= cfg.since)) continue;
      const id = jobId(lead, top);
      if (!(await store.hasSheetJob(id))) jobs.push({ id, leadId: lead.id, metaLeadId: G.stripId(lead.externalId), stage: top.stage, milestoneAt: top.at });
    }
    return { ...plan, jobs };
  }

  // Authorized correction: may move a lead backwards (e.g. Converted entered by mistake).
  async function correct({ leadId, stage, by = "", reason = "" }) {
    const state = await readState();
    const cfg = settingsOf(state);
    const lead = (state.crmLeads || []).find((item) => item.id === leadId);
    const elig = Map_.eligibility(lead, cfg);
    if (!elig.eligible) throw new Error(elig.reason);
    if (!Map_.STAGES.includes(stage)) throw new Error("Choose a stage");
    if (!cfg.stages[stage].confirmed) throw new Error(`“${cfg.stages[stage].value}” is not confirmed in Events Manager yet`);
    if (!String(reason).trim()) throw new Error("A correction needs a reason");
    const id = `${lead.id}:${stage}:correction:${now()}`;
    await store.enqueueSheetJob({ id, leadId: lead.id, metaLeadId: G.stripId(lead.externalId), spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, stage, kind: "correction", requestedBy: by, status: "pending" });
    await store.log("sheets", "warn", `Correction requested by ${by || "admin"}: lead ${G.stripId(lead.externalId)} → ${stage} (${String(reason).slice(0, 200)})`);
    return { id };
  }

  // Verification helper: write one stage value to ONE row (a Meta test lead by default)
  // so the admin can check Events Manager. Never marks the stage confirmed by itself.
  async function testWrite({ metaLeadId, stage, allowRealLead = false, by = "" }) {
    const state = await readState();
    const cfg = settingsOf(state);
    if (!Map_.STAGES.includes(stage)) throw new Error("Choose a stage");
    const values = await readTab(cfg);
    const columns = G.findColumns(values[0]);
    if (columns.idCol < 0 || columns.statusCol < 0) throw new Error("id / lead_status column not found");
    const rows = G.locateLead(values, metaLeadId, columns);
    if (rows.length !== 1) throw new Error(rows.length ? "Several rows hold this lead id" : "Lead id not found in the sheet");
    const rowObject = Object.fromEntries((values[0] || []).map((header, index) => [header, rows[0].row[index] ?? ""]));
    const isTest = Leads.isTestRow(rowObject);
    if (!isTest && !allowRealLead) throw new Error("This row is a real lead. Use a Meta test lead, or tick “real lead” to confirm on purpose.");
    const range = `${tabRange(cfg)}!${G.columnLetter(columns.statusCol)}${rows[0].rowNumber}`;
    const from = String(rows[0].row[columns.statusCol] ?? "");
    await client().updateCell(cfg.spreadsheetId, range, cfg.stages[stage].value);
    await store.log("sheets", "warn", `Verification write by ${by || "admin"}: ${isTest ? "test" : "REAL"} lead ${G.stripId(metaLeadId)} ${from || "(empty)"} → ${cfg.stages[stage].value}. Sheet updated; check Events Manager for receipt.`);
    return { range, from, to: cfg.stages[stage].value, testLead: isTest, note: "Sheet updated. This does not prove Meta received an event: check the dataset in Events Manager." };
  }

  async function status(state) {
    const cfg = settingsOf(state);
    const creds = credentials();
    const counts = await store.sheetJobCounts().catch(() => []);
    const sum = (predicate) => counts.filter(predicate).reduce((total, row) => total + row.n, 0);
    const lastOk = counts.filter((row) => row.status === "updated").map((row) => row.last).sort().pop() || "";
    const [lastFailed] = await store.listSheetJobs({ status: "failed", limit: 1 }).catch(() => []);
    const credentialsOk = Boolean(creds && !creds.error);
    let health = "not_configured";
    if (credentialsOk) health = !cfg.enabled ? "disabled" : runtime.paused ? "paused" : sum((row) => row.status === "failed") ? "errors" : "ok";
    return {
      settings: cfg,
      credentials: { present: credentialsOk, email: creds?.email || "", error: creds?.error || "" },
      health,
      paused: runtime.paused,
      lastSuccessAt: lastOk,
      lastError: runtime.lastError || (lastFailed ? { at: lastFailed.updated_at, message: lastFailed.last_error } : null),
      lastImport: runtime.lastImport,
      counts: {
        pending: sum((row) => ["pending", "retry"].includes(row.status)),
        blocked: sum((row) => row.status === "blocked"),
        held: sum((row) => row.status === "held"),
        failed: sum((row) => ["failed", "paused"].includes(row.status)),
        updated: sum((row) => row.status === "updated"),
        qualifiedUpdated: sum((row) => row.status === "updated" && row.stage === "qualified"),
        convertedUpdated: sum((row) => row.status === "updated" && row.stage === "converted"),
      },
      statusLabels: STATUS_LABELS,
      stageInfo: Map_.STAGE_INFO,
      candidates: Map_.CANDIDATE_VALUES,
    };
  }

  async function history({ limit = 100, status: filter = "" } = {}) {
    return (await store.listSheetJobs({ limit, status: filter })).map((job) => ({ ...job, label: STATUS_LABELS[job.status] || job.status }));
  }

  return { tick, reconcile, processDue, retryFailed, importLeads, saveSettings, confirmStage, testConnection, testMatch, previewMapping, backfillPlan, backfillApply, correct, testWrite, status, history, settingsOf, runtime };
}

module.exports = { createSheetFeedback, STATUS_LABELS };
