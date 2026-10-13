// Integration tables, next to the CRM's JSON document (which stays untouched):
//   int_wa_messages  - every incoming WhatsApp message id (dedupe) + minimal metadata
//   int_capi_events  - Conversions API queue: one row per (event_id, mode)
//   int_sync_runs    - Marketing API sync history
//   int_log          - integration log (admin only)
// MySQL in production; a JSON file under data/ when MySQL is not configured.
const fs = require("fs");
const path = require("path");

const TABLES = [
  `CREATE TABLE IF NOT EXISTS int_wa_messages (
    message_id VARCHAR(191) NOT NULL PRIMARY KEY,
    phone_number_id VARCHAR(64) NOT NULL DEFAULT '',
    from_phone VARCHAR(32) NOT NULL DEFAULT '',
    lead_id VARCHAR(64) NOT NULL DEFAULT '',
    kind VARCHAR(32) NOT NULL DEFAULT '',
    has_referral TINYINT(1) NOT NULL DEFAULT 0,
    received_at DATETIME NOT NULL,
    KEY idx_received (received_at)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS int_capi_events (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    event_id VARCHAR(160) NOT NULL,
    mode VARCHAR(8) NOT NULL,
    lead_id VARCHAR(64) NOT NULL,
    stage VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    payload LONGTEXT NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL,
    last_error TEXT NULL,
    response TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_due (status, next_attempt_at),
    KEY idx_lead (lead_id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS int_sync_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    status VARCHAR(16) NOT NULL,
    rows_count INT NOT NULL DEFAULT 0,
    message TEXT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS int_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    at DATETIME NOT NULL,
    kind VARCHAR(32) NOT NULL,
    level VARCHAR(8) NOT NULL,
    message TEXT NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
];

const sqlTime = (date = new Date()) => new Date(date).toISOString().slice(0, 19).replace("T", " ");
const isoTime = (value) => (value ? new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z")).toISOString() : "");
const EVENT_COLUMNS = ["id", "event_id", "mode", "lead_id", "stage", "channel", "payload", "status", "attempts", "next_attempt_at", "last_error", "response", "created_at", "updated_at"];

function createIntegrationStore(storage) {
  const mysql = () => (storage.useMysql ? storage.pool() : null);
  const file = path.join(storage.dataDir || "data", "integrations.json");
  let memory = null;
  const load = () => {
    if (memory) return memory;
    try { memory = JSON.parse(fs.readFileSync(file, "utf8")); } catch { memory = {}; }
    ["messages", "events", "runs", "log"].forEach((key) => { memory[key] = Array.isArray(memory[key]) ? memory[key] : []; });
    return memory;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(memory));
    fs.renameSync(`${file}.tmp`, file);
  };

  async function init() {
    const pool = mysql();
    if (pool) for (const sql of TABLES) await pool.query(sql);
    else { load(); save(); }
  }

  // Returns true the first time a WhatsApp message id is seen (dedupe across retries).
  async function recordMessage(row) {
    const pool = mysql();
    const values = { message_id: String(row.messageId).slice(0, 190), phone_number_id: row.phoneNumberId || "", from_phone: row.from || "", lead_id: row.leadId || "", kind: row.kind || "", has_referral: row.hasReferral ? 1 : 0 };
    if (pool) {
      const result = await pool.query("INSERT IGNORE INTO int_wa_messages (message_id, phone_number_id, from_phone, lead_id, kind, has_referral, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [values.message_id, values.phone_number_id, values.from_phone, values.lead_id, values.kind, values.has_referral, sqlTime()]);
      return Number(result.affectedRows || 0) > 0;
    }
    const data = load();
    if (data.messages.some((item) => item.message_id === values.message_id)) return false;
    data.messages.push({ ...values, received_at: new Date().toISOString() });
    data.messages = data.messages.slice(-5000);
    save();
    return true;
  }
  async function setMessageLead(messageId, leadId) {
    const pool = mysql();
    if (pool) return pool.query("UPDATE int_wa_messages SET lead_id = ? WHERE message_id = ?", [leadId, String(messageId).slice(0, 190)]);
    const item = load().messages.find((row) => row.message_id === messageId);
    if (item) { item.lead_id = leadId; save(); }
  }
  async function messageStats() {
    const pool = mysql();
    if (pool) {
      const rows = await pool.query("SELECT COUNT(*) AS total, SUM(has_referral) AS referred, MAX(received_at) AS last FROM int_wa_messages WHERE received_at >= ?", [sqlTime(Date.now() - 30 * 86400000)]);
      const row = rows[0] || {};
      return { total: Number(row.total || 0), referred: Number(row.referred || 0), last: row.last ? isoTime(row.last instanceof Date ? row.last.toISOString() : row.last) : "" };
    }
    const recent = load().messages.filter((row) => row.received_at >= new Date(Date.now() - 30 * 86400000).toISOString());
    return { total: recent.length, referred: recent.filter((row) => row.has_referral).length, last: recent.map((row) => row.received_at).sort().pop() || "" };
  }

  // ---- Conversions API queue ----
  async function enqueue(event) {
    const pool = mysql();
    const now = sqlTime();
    const row = { id: `${event.eventId}:${event.mode}`.slice(0, 190), event_id: event.eventId, mode: event.mode, lead_id: event.leadId, stage: event.stage, channel: event.channel, payload: JSON.stringify(event.payload), status: "pending", attempts: 0, next_attempt_at: now, last_error: null, response: null, created_at: now, updated_at: now };
    if (pool) {
      const result = await pool.query(`INSERT IGNORE INTO int_capi_events (${EVENT_COLUMNS.join(", ")}) VALUES (${EVENT_COLUMNS.map(() => "?").join(", ")})`, EVENT_COLUMNS.map((key) => row[key]));
      return Number(result.affectedRows || 0) > 0;
    }
    const data = load();
    if (data.events.some((item) => item.id === row.id)) return false;
    data.events.push({ ...row, next_attempt_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    save();
    return true;
  }
  const normalizeEvent = (row) => ({ ...row, attempts: Number(row.attempts || 0), payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload, next_attempt_at: row.next_attempt_at instanceof Date ? row.next_attempt_at.toISOString() : isoTime(row.next_attempt_at), created_at: row.created_at instanceof Date ? row.created_at.toISOString() : isoTime(row.created_at), updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : isoTime(row.updated_at) });
  async function dueEvents(limit = 20) {
    const pool = mysql();
    if (pool) {
      const rows = await pool.query("SELECT * FROM int_capi_events WHERE status IN ('pending', 'retry') AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?", [sqlTime(), limit]);
      return rows.map(normalizeEvent);
    }
    const now = new Date().toISOString();
    return load().events.filter((row) => ["pending", "retry"].includes(row.status) && row.next_attempt_at <= now).slice(0, limit).map(normalizeEvent);
  }
  async function updateEvent(id, patch) {
    const pool = mysql();
    const values = { ...patch, updated_at: new Date().toISOString() };
    if (pool) {
      const keys = Object.keys(values);
      const sqlValues = keys.map((key) => (/_at$/.test(key) && values[key] ? sqlTime(values[key]) : values[key]));
      return pool.query(`UPDATE int_capi_events SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`, [...sqlValues, id]);
    }
    const row = load().events.find((item) => item.id === id);
    if (row) { Object.assign(row, values); save(); }
  }
  async function listEvents({ limit = 200, status = "" } = {}) {
    const pool = mysql();
    if (pool) {
      const rows = status
        ? await pool.query("SELECT * FROM int_capi_events WHERE status = ? ORDER BY created_at DESC LIMIT ?", [status, limit])
        : await pool.query("SELECT * FROM int_capi_events ORDER BY created_at DESC LIMIT ?", [limit]);
      return rows.map(normalizeEvent);
    }
    return load().events.filter((row) => !status || row.status === status).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit).map(normalizeEvent);
  }
  async function eventCounts() {
    const pool = mysql();
    if (pool) {
      const rows = await pool.query("SELECT status, mode, COUNT(*) AS n, MAX(updated_at) AS last FROM int_capi_events GROUP BY status, mode");
      return rows.map((row) => ({ status: row.status, mode: row.mode, n: Number(row.n), last: row.last instanceof Date ? row.last.toISOString() : isoTime(row.last) }));
    }
    const groups = new Map();
    load().events.forEach((row) => {
      const key = `${row.status}|${row.mode}`;
      const item = groups.get(key) || { status: row.status, mode: row.mode, n: 0, last: "" };
      item.n += 1;
      if (row.updated_at > item.last) item.last = row.updated_at;
      groups.set(key, item);
    });
    return [...groups.values()];
  }
  async function retryFailed() {
    const pool = mysql();
    if (pool) {
      const result = await pool.query("UPDATE int_capi_events SET status = 'retry', next_attempt_at = ?, updated_at = ? WHERE status IN ('failed', 'paused')", [sqlTime(), sqlTime()]);
      return Number(result.affectedRows || 0);
    }
    let n = 0;
    load().events.forEach((row) => { if (["failed", "paused"].includes(row.status)) { row.status = "retry"; row.next_attempt_at = new Date().toISOString(); n += 1; } });
    save();
    return n;
  }
  async function cancelLeadStage(leadId, stage) {
    const pool = mysql();
    if (pool) return pool.query("UPDATE int_capi_events SET status = 'cancelled', updated_at = ? WHERE lead_id = ? AND stage = ? AND status IN ('pending', 'retry')", [sqlTime(), leadId, stage]);
    load().events.forEach((row) => { if (row.lead_id === leadId && row.stage === stage && ["pending", "retry"].includes(row.status)) row.status = "cancelled"; });
    save();
  }

  // ---- Sync runs and log ----
  async function startRun(kind) {
    const pool = mysql();
    if (pool) {
      const result = await pool.query("INSERT INTO int_sync_runs (kind, started_at, status) VALUES (?, ?, 'running')", [kind, sqlTime()]);
      return Number(result.insertId);
    }
    const data = load();
    const id = (data.runs.at(-1)?.id || 0) + 1;
    data.runs.push({ id, kind, started_at: new Date().toISOString(), status: "running", rows_count: 0, message: "" });
    data.runs = data.runs.slice(-200);
    save();
    return id;
  }
  async function finishRun(id, status, rowsCount, message = "") {
    const pool = mysql();
    if (pool) return pool.query("UPDATE int_sync_runs SET finished_at = ?, status = ?, rows_count = ?, message = ? WHERE id = ?", [sqlTime(), status, rowsCount, String(message).slice(0, 2000), id]);
    const run = load().runs.find((row) => row.id === id);
    if (run) { Object.assign(run, { finished_at: new Date().toISOString(), status, rows_count: rowsCount, message }); save(); }
  }
  async function lastRuns(kind, limit = 5) {
    const pool = mysql();
    if (pool) {
      const rows = await pool.query("SELECT * FROM int_sync_runs WHERE kind = ? ORDER BY id DESC LIMIT ?", [kind, limit]);
      return rows.map((row) => ({ ...row, rows_count: Number(row.rows_count), started_at: row.started_at instanceof Date ? row.started_at.toISOString() : isoTime(row.started_at), finished_at: row.finished_at instanceof Date ? row.finished_at.toISOString() : isoTime(row.finished_at) }));
    }
    return load().runs.filter((row) => row.kind === kind).slice(-limit).reverse();
  }
  async function log(kind, level, message) {
    const text = String(message).slice(0, 2000);
    const pool = mysql();
    try {
      if (pool) {
        await pool.query("INSERT INTO int_log (at, kind, level, message) VALUES (?, ?, ?, ?)", [sqlTime(), kind, level, text]);
        await pool.query("DELETE FROM int_log WHERE id < (SELECT id FROM (SELECT id FROM int_log ORDER BY id DESC LIMIT 1 OFFSET 2000) AS keep_from)");
        return;
      }
      const data = load();
      data.log.push({ id: (data.log.at(-1)?.id || 0) + 1, at: new Date().toISOString(), kind, level, message: text });
      data.log = data.log.slice(-2000);
      save();
    } catch {}
  }
  async function recentLog(limit = 100) {
    const pool = mysql();
    if (pool) {
      const rows = await pool.query("SELECT * FROM int_log ORDER BY id DESC LIMIT ?", [limit]);
      return rows.map((row) => ({ ...row, at: row.at instanceof Date ? row.at.toISOString() : isoTime(row.at) }));
    }
    return load().log.slice(-limit).reverse();
  }
  // Retention: message metadata 180 days, sent events 400 days.
  async function prune() {
    const pool = mysql();
    if (pool) {
      await pool.query("DELETE FROM int_wa_messages WHERE received_at < ?", [sqlTime(Date.now() - 180 * 86400000)]);
      await pool.query("DELETE FROM int_capi_events WHERE status IN ('sent', 'cancelled') AND updated_at < ?", [sqlTime(Date.now() - 400 * 86400000)]);
      return;
    }
    const data = load();
    const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    data.messages = data.messages.filter((row) => row.received_at >= cutoff);
    save();
  }

  return { init, recordMessage, setMessageLead, messageStats, enqueue, dueEvents, updateEvent, listEvents, eventCounts, retryFailed, cancelLeadStage, startRun, finishRun, lastRuns, log, recentLog, prune };
}

module.exports = { createIntegrationStore };
