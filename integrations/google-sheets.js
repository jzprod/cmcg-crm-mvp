// Minimal Google Sheets API v4 client with service-account authentication.
// No extra npm dependency: the JWT is signed with Node's crypto (RS256).
// Credentials come only from environment variables and never reach the browser/logs.
const crypto = require("crypto");
const fs = require("fs");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

class SheetsError extends Error {
  // kind: auth | permission | not_found | rate_limit | transient | bad_request
  constructor(kind, message, { status = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON or base64), or GOOGLE_SERVICE_ACCOUNT_FILE,
// or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY. Returns { email, key } | { error }.
function credentialsFromEnv(env = process.env) {
  try {
    let json = String(env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
    if (!json && env.GOOGLE_SERVICE_ACCOUNT_FILE) json = fs.readFileSync(String(env.GOOGLE_SERVICE_ACCOUNT_FILE), "utf8");
    if (json) {
      if (!json.startsWith("{")) json = Buffer.from(json, "base64").toString("utf8");
      const parsed = JSON.parse(json);
      if (!parsed.client_email || !parsed.private_key) return { error: "The service account JSON has no client_email/private_key" };
      return { email: parsed.client_email, key: parsed.private_key };
    }
    const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
    const key = String(env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
    if (email && key) return { email, key };
    return null;
  } catch (error) {
    return { error: `Could not read the Google service account credentials (${error.message.split("\n")[0]})` };
  }
}

const base64url = (input) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function signedAssertion({ email, key }, nowSeconds) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key);
  return `${header}.${claims}.${base64url(signature)}`;
}

function retryAfter(response) {
  const value = response?.headers?.get?.("retry-after");
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

// Map an HTTP failure to a SheetsError. 403 can be a quota error as well.
function classify(status, body, response) {
  const message = body?.error?.message || body?.error_description || `HTTP ${status}`;
  const reason = JSON.stringify(body?.error?.details || body?.error?.errors || body?.error?.status || "");
  if (status === 429 || /RATE_LIMIT|rateLimitExceeded|RESOURCE_EXHAUSTED|quota/i.test(reason + message)) return new SheetsError("rate_limit", `Google rate limit: ${message}`, { status, retryAfterMs: retryAfter(response) });
  if (status >= 500) return new SheetsError("transient", `Google unavailable: ${message}`, { status, retryAfterMs: retryAfter(response) });
  if (status === 401 || body?.error === "invalid_grant" || body?.error === "invalid_client") return new SheetsError("auth", `Google authentication failed: ${message}`, { status });
  if (status === 403) return new SheetsError("permission", `No access to the spreadsheet: ${message}`, { status });
  if (status === 404) return new SheetsError("not_found", `Spreadsheet or tab not found: ${message}`, { status });
  return new SheetsError("bad_request", message, { status });
}

function createSheetsClient({ credentials, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
  let cached = { token: "", expiresAt: 0 };

  async function call(url, init) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20000) });
    } catch (error) {
      throw new SheetsError("transient", `Network error reaching Google: ${error.message}`);
    }
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) throw classify(response.status, body, response);
    return body;
  }

  async function token() {
    if (!credentials || credentials.error) throw new SheetsError("auth", credentials?.error || "Google service account credentials are missing");
    if (cached.token && cached.expiresAt - 60000 > now()) return cached.token;
    const assertion = signedAssertion(credentials, Math.floor(now() / 1000));
    const body = await call(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(assertion)}`,
    });
    if (!body.access_token) throw new SheetsError("auth", "Google returned no access token");
    cached = { token: body.access_token, expiresAt: now() + Number(body.expires_in || 3600) * 1000 };
    return cached.token;
  }

  async function api(method, path, payload) {
    const headers = { Authorization: `Bearer ${await token()}` };
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    return call(`${API}/${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  }

  return {
    email: credentials?.email || "",
    getSpreadsheet: (spreadsheetId) => api("GET", `${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent("spreadsheetId,properties.title,sheets.properties(sheetId,title,index)")}`),
    getValues: async (spreadsheetId, range) => (await api("GET", `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`)).values || [],
    // RAW: the value is stored as typed, never interpreted as a formula.
    updateCell: (spreadsheetId, range, value) => api("PUT", `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW&includeValuesInResponse=true`, { range, majorDimension: "ROWS", values: [[value]] }),
  };
}

// ---- Table helpers (columns found by header, rows found by Meta lead id) ----
function columnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}
const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;
const headerKey = (value) => String(value ?? "").trim().toLowerCase();
const ID_HEADERS = ["id", "lead_id", "leadgen_id"];

function findColumns(headerRow = []) {
  const keys = headerRow.map(headerKey);
  const idCol = keys.findIndex((key) => ID_HEADERS.includes(key));
  return {
    idCol,
    statusCol: keys.indexOf("lead_status"),
    formCol: keys.indexOf("form_id"),
    headers: headerRow.map((value) => String(value ?? "")),
  };
}

const stripId = (value) => String(value ?? "").trim().replace(/^l:/i, "");

// values = whole tab (row 0 = headers). Returns the 1-based sheet rows holding this lead id.
function locateLead(values, metaLeadId, columns = findColumns(values[0])) {
  const target = stripId(metaLeadId);
  const rows = [];
  if (!target || columns.idCol < 0) return rows;
  for (let i = 1; i < values.length; i += 1) {
    if (stripId(values[i]?.[columns.idCol]) === target) rows.push({ rowNumber: i + 1, row: values[i] });
  }
  return rows;
}

// Header row + data rows -> [{header: value}] for the lead importer.
function rowsAsObjects(values) {
  const [header = [], ...rest] = values || [];
  return rest.filter((row) => row.some((cell) => String(cell ?? "").trim())).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

module.exports = { SheetsError, credentialsFromEnv, createSheetsClient, signedAssertion, classify, columnLetter, quoteSheet, findColumns, locateLead, rowsAsObjects, stripId };
