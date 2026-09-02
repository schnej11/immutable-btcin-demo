// CyberSeal — Isolated Logger Service (port 3002)
//
// ARCHITECTURAL ISOLATION: this process is the ONLY writer to the event store
// and Merkle tree. Nothing in the agent's MCP toolset has a path to reach it.
// The gateway submits events via authenticated POST /events. The React dashboard
// reads state via GET /state (no auth required — read-only).
//
// The agent being monitored cannot call any logger endpoint because:
//   1. No MCP tool exposes the logger URL or credentials.
//   2. The LOGGER_SECRET is never passed to or visible from the agent context.
//   3. Even if the agent learned the URL, it has no write path to /events.

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const express = require("express");
const { sha256, buildMerkleRoot } = require("./merkle");
const { stampRoot, upgradeReceipt, getAllReceipts } = require("./ots");

const app = express();
app.use(express.json());

// Allow dashboard reads from any localhost origin
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const LOGGER_SECRET = process.env.LOGGER_SECRET || "dev-secret-change-me";

function requireAuth(req, res, next) {
  if (req.headers.authorization === `Bearer ${LOGGER_SECRET}`) return next();
  return res.status(401).json({ error: "Unauthorized — LOGGER_SECRET required" });
}

// ── Static hierarchy (mirrors the React dashboard) ────────────────────────────
const ENDPOINT_BASE = {
  "NIPR-WS-001": "JBPHH",       "NIPR-WS-042": "JBPHH",
  "NIPR-WS-117": "Al Udeid AB", "NIPR-WS-203": "Al Udeid AB",
  "NIPR-WS-311": "Peterson SFB","NIPR-WS-408": "Peterson SFB",
};
const BASE_REGION = {
  "JBPHH": "INDOPACOM", "Al Udeid AB": "CENTCOM", "Peterson SFB": "USSPACECOM",
};
const ENDPOINTS = Object.keys(ENDPOINT_BASE);
const BASES     = [...new Set(Object.values(ENDPOINT_BASE))];
const REGIONS   = [...new Set(Object.values(BASE_REGION))];

// ── Demo event generator (active when no gateway is connected) ─────────────────
const EVENT_TYPES = [
  { type: "FILE_SAVE",    label: "File saved"      },
  { type: "AI_PROMPT",   label: "AI prompt exec"  },
  { type: "FILE_MODIFY", label: "File modified"   },
  { type: "LOGIN_CAC",   label: "CAC login"       },
  { type: "NET_CONNECT", label: "Network connect" },
];
const FILES = [
  "logistics_manifest_v3.docx","unit_deploy_order.xlsx","supply_chain_data.csv",
  "ops_memo_final.docx","intel_brief.pdf","mission_plan_alpha.docx",
];

let counter = 0;
function genDemoEvent() {
  const et   = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ep   = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const file = FILES[Math.floor(Math.random() * FILES.length)];
  const base = ENDPOINT_BASE[ep];
  return {
    id:        ++counter,
    timestamp: Date.now(),
    type:      et.type,
    label:     et.label,
    endpoint:  ep,
    base,
    region:    BASE_REGION[base],
    file,
    user:      "GS" + (Math.floor(Math.random() * 5) + 9) + "-" + Math.floor(1000 + Math.random() * 9000),
    payload:   `${et.type}::${ep}::${file}::${Date.now()}::${Math.random()}`,
    source:    "DEMO_SIM",
    tampered:  false,
    flagged:   false,
  };
}

// ── In-memory store ────────────────────────────────────────────────────────────
let events       = [];
let eventHashes  = {};
let endpointRoots = {};
let baseRoots    = {};
let regionRoots  = {};
let globalRoot   = null;
let lastRootChange = null;
let computing    = false;

// ── Merkle recompute ───────────────────────────────────────────────────────────
async function recomputeMerkle() {
  if (computing) return;
  computing = true;
  try {
    const hashes = await Promise.all(
      events.map(e => sha256(e.tampered ? "TAMPERED::" + e.payload : e.payload))
    );
    events.forEach((e, i) => { eventHashes[e.id] = hashes[i]; });

    const epRoots = {};
    for (const ep of ENDPOINTS) {
      const hs = events.map(e => e.endpoint === ep ? eventHashes[e.id] : null).filter(Boolean);
      if (hs.length) epRoots[ep] = await buildMerkleRoot(hs);
    }
    endpointRoots = epRoots;

    const bRoots = {};
    for (const base of BASES) {
      const roots = ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base && epRoots[ep]).map(ep => epRoots[ep]);
      const r = await buildMerkleRoot(roots);
      if (r) bRoots[base] = r;
    }
    baseRoots = bRoots;

    const rRoots = {};
    for (const reg of REGIONS) {
      const roots = BASES.filter(b => BASE_REGION[b] === reg && bRoots[b]).map(b => bRoots[b]);
      const r = await buildMerkleRoot(roots);
      if (r) rRoots[reg] = r;
    }
    regionRoots = rRoots;

    const gr = await buildMerkleRoot(Object.values(rRoots));
    if (gr && gr !== globalRoot) {
      globalRoot      = gr;
      lastRootChange  = Date.now();
      console.log(`[Logger] New global root: ${gr.slice(0, 12)}…`);
      stampRoot(gr).catch(() => {}); // non-blocking OTS stamp
    }
  } finally {
    computing = false;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /events — gateway submits a real tool-call event (auth required)
app.post("/events", requireAuth, async (req, res) => {
  const e = req.body;
  if (!e || !e.type || !e.endpoint) {
    return res.status(400).json({ error: "Missing required fields: type, endpoint" });
  }
  const base   = e.base   || ENDPOINT_BASE[e.endpoint] || "UNKNOWN";
  const region = e.region || BASE_REGION[base]         || "UNKNOWN";
  const event  = {
    id:        ++counter,
    timestamp: e.timestamp || Date.now(),
    type:      e.type,
    label:     e.label || e.type,
    endpoint:  e.endpoint,
    base,
    region,
    file:      e.file    || "",
    user:      e.user    || "UNKNOWN",
    payload:   e.payload || JSON.stringify(e),
    source:    e.source  || "GATEWAY",
    toolName:  e.toolName || null,
    tampered:  false,
    flagged:   e.flagged || false,
  };
  events.unshift(event);
  if (events.length > 500) events = events.slice(0, 500);
  recomputeMerkle().catch(console.error);
  res.json({ id: event.id, ok: true });
});

// POST /flag/:id — operator flags a logged event (auth required)
app.post("/flag/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ error: "Event not found" });

  ev.flagged   = true;
  ev.flaggedAt = Date.now();
  ev.flaggedBy = req.body.flaggedBy || "OPERATOR";

  // The flag action itself is a logged event (immutable record of the decision)
  const flagRecord = {
    id:        ++counter,
    timestamp: Date.now(),
    type:      "FLAG_ACTION",
    label:     `Flagged event #${id}`,
    endpoint:  ev.endpoint,
    base:      ev.base,
    region:    ev.region,
    file:      ev.file,
    user:      ev.flaggedBy,
    payload:   `FLAG::${id}::${ev.type}::${Date.now()}`,
    source:    "OPERATOR",
    tampered:  false,
    flagged:   false,
    isFlagRecord:  true,
    targetEventId: id,
  };
  events.unshift(flagRecord);
  recomputeMerkle().catch(console.error);
  res.json({ ok: true, event: ev });
});

// DELETE /flag/:id — operator removes flag (auth required)
app.delete("/flag/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ error: "Event not found" });
  ev.flagged   = false;
  ev.flaggedAt = null;
  recomputeMerkle().catch(console.error);
  res.json({ ok: true });
});

// POST /tamper/:id — demo control: simulate log tamper (auth required)
app.post("/tamper/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ error: "Event not found" });
  ev.tampered = !ev.tampered;
  recomputeMerkle().catch(console.error);
  res.json({ ok: true, tampered: ev.tampered });
});

// GET /state — dashboard read-only view (no auth)
app.get("/state", (req, res) => {
  res.json({
    events:         events.slice(0, 50),
    eventHashes,
    endpointRoots,
    baseRoots,
    regionRoots,
    globalRoot,
    lastRootChange,
    otsReceipts:    getAllReceipts(),
    flaggedCount:   events.filter(e => e.flagged).length,
    tamperedCount:  events.filter(e => e.tampered).length,
    eventCount:     events.length,
    mode:           demoMode ? "DEMO_SIM" : "GATEWAY",
  });
});

// GET /health — liveness probe
app.get("/health", (_, res) => res.json({ ok: true, events: events.length, globalRoot }));

// Gateway connect/disconnect signals (allow gateway to stop demo simulation)
app.post("/gateway/connect", requireAuth, (req, res) => {
  stopDemoMode();
  res.json({ ok: true });
});
app.post("/gateway/disconnect", requireAuth, (req, res) => {
  startDemoMode();
  res.json({ ok: true });
});

// ── OTS upgrade polling (every 60s) ───────────────────────────────────────────
setInterval(() => {
  for (const h of Object.keys(getAllReceipts())) upgradeReceipt(h).catch(() => {});
}, 60_000);

// ── Demo mode ──────────────────────────────────────────────────────────────────
let demoMode     = true;
let demoInterval = null;

function startDemoMode() {
  if (demoInterval) return;
  demoMode     = true;
  demoInterval = setInterval(async () => {
    const e = genDemoEvent();
    events.unshift(e);
    if (events.length > 500) events = events.slice(0, 500);
    await recomputeMerkle().catch(console.error);
  }, 1200);
  console.log("[Logger] Demo mode ON — generating simulated events");
}

function stopDemoMode() {
  if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
  demoMode = false;
  console.log("[Logger] Demo mode OFF — gateway is live");
}

startDemoMode();

const PORT = process.env.LOGGER_PORT || 3002;
app.listen(PORT, () => {
  console.log(`[Logger] Isolated logger running on http://localhost:${PORT}`);
  console.log(`[Logger] Dashboard reads: GET /state  |  Gateway writes: POST /events (auth)`);
});
