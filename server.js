const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.CRM_DATA_FILE || path.join(__dirname, "data", "crm.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function emptyState() {
  return {
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD" },
    programs: [],
    agents: [],
    campaigns: [],
    adSets: [],
    creatives: [],
    leads: [],
    dailyLogs: [],
    events: [],
  };
}

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyState(), null, 2));
  }
}

function readState() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function slug(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 5)
    .toUpperCase();
}

function makeCode(state, creativeName, adSet) {
  const campaign = state.campaigns.find((item) => item.id === adSet?.campaignId);
  const program = state.programs.find((item) => item.id === campaign?.programId);
  const parts = ["CMCG", slug(program?.name || "TRN"), slug(creativeName || "AD")].filter(Boolean);
  let code = `${parts.join("-")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  while (state.creatives.some((creative) => creative.code === code)) {
    code = `${parts.join("-")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  }
  return code;
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function hasAuth() {
  return Boolean(process.env.CRM_USER && process.env.CRM_PASSWORD);
}

function authorized(req) {
  if (!hasAuth()) return true;
  const header = req.headers.authorization || "";
  const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return decoded === `${process.env.CRM_USER}:${process.env.CRM_PASSWORD}`;
}

function requireAuth(req, res) {
  if (authorized(req)) return true;
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="CMCG CRM"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Authentication required");
  return false;
}

function serveStatic(req, res) {
  const requested = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = requested === "/" ? "/index.html" : requested;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function addEvent(state, leadId, type, details = {}) {
  state.events.push({ id: id("evt"), leadId, type, details, createdAt: now() });
}

async function handleApi(req, res) {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const state = readState();

  try {
    if (method === "GET" && url.pathname === "/api/state") {
      return json(res, 200, { state, authEnabled: hasAuth() });
    }

    if (method === "POST" && url.pathname === "/api/programs") {
      const body = await parseBody(req);
      const item = { id: id("prg"), name: cleanText(body.name), createdAt: now() };
      if (!item.name) return json(res, 400, { error: "Program name is required" });
      state.programs.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/agents") {
      const body = await parseBody(req);
      const item = {
        id: id("agt"),
        name: cleanText(body.name),
        whatsapp: cleanText(body.whatsapp),
        active: body.active !== false,
        createdAt: now(),
      };
      if (!item.name) return json(res, 400, { error: "Agent name is required" });
      state.agents.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/campaigns") {
      const body = await parseBody(req);
      const item = {
        id: id("cmp"),
        programId: cleanText(body.programId),
        name: cleanText(body.name),
        createdAt: now(),
      };
      if (!item.programId || !item.name) return json(res, 400, { error: "Campaign program and name are required" });
      state.campaigns.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/adsets") {
      const body = await parseBody(req);
      const item = {
        id: id("ads"),
        campaignId: cleanText(body.campaignId),
        agentId: cleanText(body.agentId),
        name: cleanText(body.name),
        objective: cleanText(body.objective || "Messages"),
        status: cleanText(body.status || "Testing"),
        createdAt: now(),
      };
      if (!item.campaignId || !item.agentId || !item.name) {
        return json(res, 400, { error: "Campaign, agent, and ad set name are required" });
      }
      state.adSets.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/creatives") {
      const body = await parseBody(req);
      const adSet = state.adSets.find((item) => item.id === body.adSetId);
      const item = {
        id: id("crt"),
        adSetId: cleanText(body.adSetId),
        name: cleanText(body.name),
        format: cleanText(body.format || "Video"),
        language: cleanText(body.language || "Arabic"),
        code: cleanText(body.code).toUpperCase(),
        createdAt: now(),
      };
      if (!item.adSetId || !item.name) return json(res, 400, { error: "Ad set and creative name are required" });
      if (!adSet) return json(res, 400, { error: "Selected ad set does not exist" });
      if (!item.code) item.code = makeCode(state, item.name, adSet);
      if (state.creatives.some((creative) => creative.code === item.code)) {
        return json(res, 400, { error: "This tracking code already exists" });
      }
      state.creatives.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/leads") {
      const body = await parseBody(req);
      const creative = state.creatives.find((item) => item.id === body.creativeId || item.code === cleanText(body.code).toUpperCase());
      const adSet = state.adSets.find((item) => item.id === creative?.adSetId);
      const campaign = state.campaigns.find((item) => item.id === adSet?.campaignId);
      const item = {
        id: id("led"),
        creativeId: creative?.id || "",
        adSetId: adSet?.id || "",
        campaignId: campaign?.id || "",
        programId: campaign?.programId || "",
        agentId: adSet?.agentId || cleanText(body.agentId),
        code: creative?.code || cleanText(body.code).toUpperCase(),
        phone: cleanText(body.phone),
        stage: cleanText(body.stage || "new"),
        appointmentAt: cleanText(body.appointmentAt),
        registeredAt: cleanText(body.registeredAt),
        amountPaid: Number(body.amountPaid || 0),
        lostReason: cleanText(body.lostReason),
        notes: cleanText(body.notes),
        createdAt: cleanText(body.createdAt) || now(),
        updatedAt: now(),
      };
      if (!item.code) return json(res, 400, { error: "Tracking code is required" });
      state.leads.push(item);
      addEvent(state, item.id, "created", { stage: item.stage, code: item.code });
      if (item.appointmentAt) addEvent(state, item.id, "appointment_booked", { appointmentAt: item.appointmentAt });
      if (item.stage === "registered") addEvent(state, item.id, "registered", { amountPaid: item.amountPaid });
      writeState(state);
      return json(res, 201, item);
    }

    const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (method === "PATCH" && leadMatch) {
      const body = await parseBody(req);
      const lead = state.leads.find((item) => item.id === leadMatch[1]);
      if (!lead) return json(res, 404, { error: "Lead not found" });
      const oldStage = lead.stage;
      ["stage", "appointmentAt", "registeredAt", "lostReason", "notes", "phone"].forEach((field) => {
        if (body[field] !== undefined) lead[field] = cleanText(body[field]);
      });
      if (body.amountPaid !== undefined) lead.amountPaid = Number(body.amountPaid || 0);
      lead.updatedAt = now();
      if (lead.stage !== oldStage) addEvent(state, lead.id, "stage_changed", { from: oldStage, to: lead.stage });
      if (body.appointmentAt) addEvent(state, lead.id, "appointment_booked", { appointmentAt: lead.appointmentAt });
      if (lead.stage === "registered" && oldStage !== "registered") {
        addEvent(state, lead.id, "registered", { amountPaid: lead.amountPaid, registeredAt: lead.registeredAt || now() });
      }
      writeState(state);
      return json(res, 200, lead);
    }

    if (method === "POST" && url.pathname === "/api/daily-logs") {
      const body = await parseBody(req);
      const creative = state.creatives.find((item) => item.id === body.creativeId);
      const adSet = state.adSets.find((item) => item.id === (body.adSetId || creative?.adSetId));
      const campaign = state.campaigns.find((item) => item.id === (body.campaignId || adSet?.campaignId));
      const item = {
        id: id("log"),
        date: cleanText(body.date || new Date().toISOString().slice(0, 10)),
        creativeId: creative?.id || "",
        adSetId: adSet?.id || "",
        campaignId: campaign?.id || "",
        programId: campaign?.programId || "",
        spend: Number(body.spend || 0),
        messages: Number(body.messages || 0),
        notes: cleanText(body.notes),
        createdAt: now(),
      };
      if (!item.date) return json(res, 400, { error: "Date is required" });
      state.dailyLogs.push(item);
      writeState(state);
      return json(res, 201, item);
    }

    return json(res, 404, { error: "Route not found" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  if (!requireAuth(req, res)) return;
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`CMCG CRM running on http://localhost:${PORT}`);
});
