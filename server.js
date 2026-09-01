const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createStorage } = require("./storage");

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
    meta: { schemaVersion: 2, updatedAt: null },
    centre: { name: "CMCG", city: "Tanger" },
    settings: { currency: "MAD" },
    programs: [],
    agents: [],
    campaigns: [],
    adSets: [],
    creatives: [],
    usedCreativeCodes: [],
    leads: [],
    dailyLogs: [],
    events: [],
  };
}

function normalizeState(input) {
  const base = emptyState();
  const state = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  state.meta = { ...base.meta, ...(state.meta || {}) };
  state.centre = { ...base.centre, ...(state.centre || {}) };
  state.settings = { ...base.settings, ...(state.settings || {}) };
  ["programs", "agents", "campaigns", "adSets", "creatives", "leads", "dailyLogs", "events"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
  const usedCodes = new Set(
    (Array.isArray(state.usedCreativeCodes) ? state.usedCreativeCodes : [])
      .map(normalizeCode)
      .filter(Boolean),
  );
  state.creatives.forEach((creative) => {
    const code = normalizeCode(creative.code);
    if (code) usedCodes.add(code);
  });
  state.usedCreativeCodes = [...usedCodes];
  return state;
}

const storage = createStorage({ dataFile: DATA_FILE, createEmptyState: emptyState, normalizeState });

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return cleanText(value).toUpperCase();
}

function makeCode(state) {
  const usedCodes = new Set(state.usedCreativeCodes.map(normalizeCode));

  for (const length of [2, 3]) {
    const available = [];
    const total = 36 ** length;
    for (let value = 0; value < total; value += 1) {
      const code = value.toString(36).toUpperCase().padStart(length, "0");
      if (!/[A-Z]/.test(code) || !/[0-9]/.test(code) || usedCodes.has(code)) continue;
      available.push(code);
    }
    if (available.length) return available[crypto.randomInt(available.length)];
  }

  throw new Error("All available creative codes have been used");
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
      if (body.length > 10_000_000) {
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

function downloadJson(res, state) {
  const date = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="cmcg-crm-backup-${date}.json"`,
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(state, null, 2));
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

let mutationTail = Promise.resolve();

async function acquireMutationLock() {
  const previous = mutationTail;
  let release;
  mutationTail = new Promise((resolve) => { release = resolve; });
  await previous;
  return release;
}

function duplicateName(items, name) {
  const normalized = cleanText(name).toLocaleLowerCase();
  return items.some((item) => cleanText(item.name).toLocaleLowerCase() === normalized);
}

async function handleApi(req, res) {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const releaseMutation = method === "GET" ? null : await acquireMutationLock();

  try {
    let state = await storage.read();
    if (method === "GET" && url.pathname === "/api/state") {
      return json(res, 200, { state, authEnabled: hasAuth(), storage: storage.info() });
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        storage: storage.info(),
        updatedAt: state.meta.updatedAt,
        counts: {
          programs: state.programs.length,
          agents: state.agents.length,
          creatives: state.creatives.length,
          leads: state.leads.length,
          dailyLogs: state.dailyLogs.length,
        },
      });
    }

    if (method === "GET" && url.pathname === "/api/backup") {
      return downloadJson(res, state);
    }

    if (method === "POST" && url.pathname === "/api/restore") {
      const body = await parseBody(req);
      const restored = normalizeState(body.state || body);
      const entityCount = restored.programs.length + restored.agents.length + restored.campaigns.length
        + restored.adSets.length + restored.creatives.length + restored.leads.length + restored.dailyLogs.length;
      if (!entityCount) return json(res, 400, { error: "This backup does not contain CRM records" });
      restored.meta.restoredAt = now();
      await storage.write(restored);
      return json(res, 200, { restored: true, state: restored });
    }

    if (method === "POST" && url.pathname === "/api/programs") {
      const body = await parseBody(req);
      const item = { id: id("prg"), name: cleanText(body.name), createdAt: now() };
      if (!item.name) return json(res, 400, { error: "Program name is required" });
      if (duplicateName(state.programs, item.name)) return json(res, 409, { error: "This training already exists" });
      state.programs.push(item);
      await storage.write(state);
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
      if (duplicateName(state.agents, item.name)) return json(res, 409, { error: "This sales agent already exists" });
      state.agents.push(item);
      await storage.write(state);
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
      if (!state.programs.some((item) => item.id === body.programId)) return json(res, 400, { error: "Selected training does not exist" });
      state.campaigns.push(item);
      await storage.write(state);
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
      if (!state.campaigns.some((campaign) => campaign.id === item.campaignId)) return json(res, 400, { error: "Selected campaign does not exist" });
      if (!state.agents.some((agent) => agent.id === item.agentId)) return json(res, 400, { error: "Selected sales agent does not exist" });
      state.adSets.push(item);
      await storage.write(state);
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
        code: "",
        createdAt: now(),
      };
      if (!item.adSetId || !item.name) return json(res, 400, { error: "Ad set and creative name are required" });
      if (!adSet) return json(res, 400, { error: "Selected ad set does not exist" });
      item.code = makeCode(state);
      state.creatives.push(item);
      state.usedCreativeCodes.push(item.code);
      await storage.write(state);
      return json(res, 201, item);
    }

    if (method === "POST" && url.pathname === "/api/leads") {
      const body = await parseBody(req);
      const creative = state.creatives.find((item) => item.id === body.creativeId || normalizeCode(item.code) === normalizeCode(body.code));
      const adSet = state.adSets.find((item) => item.id === creative?.adSetId);
      const campaign = state.campaigns.find((item) => item.id === adSet?.campaignId);
      const item = {
        id: id("led"),
        creativeId: creative?.id || "",
        adSetId: adSet?.id || "",
        campaignId: campaign?.id || "",
        programId: campaign?.programId || "",
        agentId: adSet?.agentId || cleanText(body.agentId),
        code: creative?.code || normalizeCode(body.code),
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
      if (!creative) return json(res, 400, { error: "Select a valid creative code" });
      if (!new Set(["new", "contacted", "qualified", "booked", "showed", "no_show", "registered", "lost"]).has(item.stage)) {
        return json(res, 400, { error: "Invalid lead stage" });
      }
      if (item.stage === "lost" && !item.lostReason) return json(res, 400, { error: "Lost reason is required" });
      if (!Number.isFinite(item.amountPaid) || item.amountPaid < 0) return json(res, 400, { error: "Paid amount must be zero or greater" });
      state.leads.push(item);
      addEvent(state, item.id, "created", { stage: item.stage, code: item.code });
      if (item.appointmentAt) addEvent(state, item.id, "appointment_booked", { appointmentAt: item.appointmentAt });
      if (item.stage === "registered") addEvent(state, item.id, "registered", { amountPaid: item.amountPaid });
      await storage.write(state);
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
      if (!new Set(["new", "contacted", "qualified", "booked", "showed", "no_show", "registered", "lost"]).has(lead.stage)) {
        return json(res, 400, { error: "Invalid lead stage" });
      }
      if (lead.stage === "lost" && !lead.lostReason) return json(res, 400, { error: "Lost reason is required" });
      if (!Number.isFinite(lead.amountPaid) || lead.amountPaid < 0) return json(res, 400, { error: "Paid amount must be zero or greater" });
      lead.updatedAt = now();
      if (lead.stage !== oldStage) addEvent(state, lead.id, "stage_changed", { from: oldStage, to: lead.stage });
      if (body.appointmentAt) addEvent(state, lead.id, "appointment_booked", { appointmentAt: lead.appointmentAt });
      if (lead.stage === "registered" && oldStage !== "registered") {
        addEvent(state, lead.id, "registered", { amountPaid: lead.amountPaid, registeredAt: lead.registeredAt || now() });
      }
      await storage.write(state);
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
      if (!item.date || !item.creativeId) return json(res, 400, { error: "Date and creative are required" });
      if (!creative) return json(res, 400, { error: "Selected creative does not exist" });
      if (!Number.isFinite(item.spend) || item.spend < 0) return json(res, 400, { error: "Spend must be zero or greater" });
      if (!Number.isInteger(item.messages) || item.messages < 0) return json(res, 400, { error: "Messages must be a whole number" });
      if (state.dailyLogs.some((log) => log.date === item.date && log.creativeId === item.creativeId)) {
        return json(res, 409, { error: "A daily log already exists for this creative and date" });
      }
      state.dailyLogs.push(item);
      await storage.write(state);
      return json(res, 201, item);
    }

    return json(res, 404, { error: "Route not found" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  } finally {
    if (releaseMutation) releaseMutation();
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  if (!requireAuth(req, res)) return;
  return serveStatic(req, res);
});

async function start() {
  await storage.init();
  server.listen(PORT, () => {
    console.log(`CMCG CRM running on http://localhost:${PORT} with ${storage.info().label}`);
  });
}

start().catch((error) => {
  console.error("Failed to start CMCG CRM:", error.message);
  process.exitCode = 1;
});
