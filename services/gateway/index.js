// CyberSeal — MCP Gateway (port 3003)
//
// Sits between any MCP client (or demo script) and the MCP tool server.
// Every tool invocation is:
//   1. Logged unconditionally to the isolated logger (auth'd write)
//   2. Checked against the flagged-tools list
//   3a. If clean → forwarded to MCP server → result returned
//   3b. If flagged → L402 challenge returned (action held)
//      Client must poll /payment-status/:hash, then POST /tool-call/retry

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const express = require("express");
const { createToll, checkPayment, getSessionSummary } = require("./l402");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const LOGGER_URL    = process.env.LOGGER_URL    || "http://localhost:3002";
const MCP_URL       = process.env.MCP_URL       || "http://localhost:3004";
const LOGGER_SECRET = process.env.LOGGER_SECRET || "dev-secret-change-me";

// Flagged tools — any call to these triggers the L402 toll gate.
// The dashboard /flagged-tools endpoint lets you add/remove at runtime.
const flaggedTools = new Set(["read_credentials", "write_external", "delete_log_entry"]);

// ── Log to isolated logger ────────────────────────────────────────────────────
async function logEvent(eventData) {
  try {
    await fetch(`${LOGGER_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOGGER_SECRET}` },
      body: JSON.stringify(eventData),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn(`[Gateway] Logger write failed: ${e.message}`);
  }
}

// ── Signal logger on startup/shutdown ─────────────────────────────────────────
async function signalLogger(path) {
  try {
    await fetch(`${LOGGER_URL}/gateway/${path}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOGGER_SECRET}` },
      signal: AbortSignal.timeout(2000),
    });
  } catch { /* logger may not be running yet */ }
}

// ── Tool call interception ─────────────────────────────────────────────────────

// POST /tool-call — primary endpoint
app.post("/tool-call", async (req, res) => {
  const { tool, args = {}, sessionId = "default" } = req.body;
  if (!tool) return res.status(400).json({ error: "tool is required" });

  const isFlagged = flaggedTools.has(tool);

  // Step 1 — Log unconditionally (requirement #2: logging is unconditional)
  await logEvent({
    type:     isFlagged ? "FLAGGED_TOOL_CALL" : "TOOL_CALL",
    label:    `${isFlagged ? "⚠ FLAGGED" : "Tool call"}: ${tool}`,
    endpoint: "NIPR-WS-001",
    base:     "JBPHH",
    region:   "INDOPACOM",
    file:     args.path || args.target || args.endpoint || tool,
    user:     sessionId,
    payload:  `TOOL_CALL::${tool}::${sessionId}::${Date.now()}::${JSON.stringify(args)}`,
    source:   "GATEWAY",
    toolName: tool,
    flagged:  isFlagged,
  });

  // Step 2 — Flagged → L402 challenge
  if (isFlagged) {
    const { toll, invoice } = await createToll(sessionId, tool, args);
    console.log(`[Gateway] BLOCKED "${tool}" — ${invoice.amountSats} sats (offense #${toll.offenseNum}, session: ${sessionId})`);

    return res.status(402)
      .set("WWW-Authenticate", `L402 token="", invoice="${invoice.paymentRequest}"`)
      .json({
        error:       "Payment required — CyberSeal flagged this tool call",
        tool,
        sessionId,
        offenseNum:  toll.offenseNum,
        invoice: {
          paymentRequest: invoice.paymentRequest,
          paymentHash:    invoice.paymentHash,
          amountSats:     invoice.amountSats,
          mock:           invoice.mock,
        },
        instructions: invoice.mock
          ? `Mock mode: auto-pays in ${process.env.MOCK_PAYMENT_DELAY_MS || 3000}ms. Poll GET /payment-status/${invoice.paymentHash} then POST /tool-call/retry.`
          : `Pay the Lightning invoice, then POST /tool-call/retry with the paymentHash.`,
      });
  }

  // Step 3 — Clean → forward to MCP server
  try {
    const mcpRes = await fetch(`${MCP_URL}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await mcpRes.json();
    console.log(`[Gateway] Executed "${tool}" for session ${sessionId}`);
    return res.json({ ok: true, tool, sessionId, result });
  } catch (e) {
    return res.status(502).json({ error: `MCP server unreachable: ${e.message}` });
  }
});

// POST /tool-call/retry — client proves payment, action is released
app.post("/tool-call/retry", async (req, res) => {
  const { tool, args = {}, sessionId = "default", paymentHash } = req.body;
  if (!paymentHash) return res.status(400).json({ error: "paymentHash required" });

  const payment = await checkPayment(paymentHash);
  if (!payment.found) return res.status(404).json({ error: "Invoice not found" });
  if (!payment.paid)  return res.status(402).json({ error: "Invoice not yet paid", paymentHash });

  // Log the paid execution
  await logEvent({
    type:    "TOOL_CALL_PAID",
    label:   `Paid execution: ${tool}`,
    endpoint: "NIPR-WS-001",
    base:    "JBPHH",
    region:  "INDOPACOM",
    file:    args.path || args.target || tool,
    user:    sessionId,
    payload: `TOOL_CALL_PAID::${tool}::${sessionId}::${paymentHash}::${payment.toll.invoice.amountSats}sats`,
    source:  "GATEWAY",
    toolName: tool,
    flagged: false,
  });

  // Forward to MCP server
  try {
    const mcpRes = await fetch(`${MCP_URL}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await mcpRes.json();
    console.log(`[Gateway] Released "${tool}" after payment (${payment.toll.invoice.amountSats} sats, offense #${payment.toll.offenseNum})`);
    return res.json({
      ok: true,
      tool,
      sessionId,
      result,
      payment: {
        amountSats: payment.toll.invoice.amountSats,
        offenseNum: payment.toll.offenseNum,
        preimage:   payment.toll.preimage,
      },
    });
  } catch (e) {
    return res.status(502).json({ error: `MCP server unreachable: ${e.message}` });
  }
});

// ── Supporting endpoints ───────────────────────────────────────────────────────

// GET /payment-status/:hash — client polls this while waiting
app.get("/payment-status/:hash", async (req, res) => {
  const payment = await checkPayment(req.params.hash);
  if (!payment.found) return res.status(404).json({ error: "Invoice not found" });
  res.json({
    paid:       payment.paid,
    amountSats: payment.toll?.invoice.amountSats,
    paidAt:     payment.toll?.paidAt,
    preimage:   payment.toll?.preimage,
  });
});

// GET /session/:id — session toll history
app.get("/session/:id", (req, res) => {
  const summary = getSessionSummary(req.params.id);
  if (!summary) return res.status(404).json({ error: "Session not found" });
  res.json(summary);
});

// GET/POST /flagged-tools — runtime flag management
app.get("/flagged-tools", (_, res) => res.json({ flagged: [...flaggedTools] }));

app.post("/flagged-tools", (req, res) => {
  const { tool } = req.body;
  if (!tool) return res.status(400).json({ error: "tool required" });
  flaggedTools.add(tool);
  console.log(`[Gateway] Flagged: ${tool}`);
  res.json({ flagged: [...flaggedTools] });
});

app.delete("/flagged-tools/:tool", (req, res) => {
  flaggedTools.delete(req.params.tool);
  console.log(`[Gateway] Unflagged: ${req.params.tool}`);
  res.json({ flagged: [...flaggedTools] });
});

// GET /tools — proxy tool discovery from MCP server
app.get("/tools", async (req, res) => {
  try {
    const r = await fetch(`${MCP_URL}/tools`, { signal: AbortSignal.timeout(3000) });
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: `MCP server unreachable: ${e.message}` });
  }
});

const PORT = process.env.GATEWAY_PORT || 3003;
app.listen(PORT, async () => {
  console.log(`[Gateway] MCP gateway running on http://localhost:${PORT}`);
  console.log(`[Gateway] Flagged tools: ${[...flaggedTools].join(", ")}`);
  await signalLogger("connect");
});

process.on("SIGINT",  async () => { await signalLogger("disconnect"); process.exit(); });
process.on("SIGTERM", async () => { await signalLogger("disconnect"); process.exit(); });
