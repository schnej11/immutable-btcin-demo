#!/usr/bin/env node
// CyberSeal Phase 1 — Three-Act Demo Script
//
// Run: node services/demo/scenario.js
// Requires: logger (3002), gateway (3003), mcp-server (3004) running
//
// This simulates a rogue/compromised AI agent attempting escalating
// attacks. The demo shows: unconditional logging, the L402 toll gate,
// and the escalating-cost defense against repeated bad behavior.

const GATEWAY = process.env.GATEWAY_URL || "http://localhost:3003";
const SESSION = `agent-${Date.now()}`;

const W = 64;
const sep = (title, char = "═") => {
  const pad = Math.max(0, W - title.length - 4);
  const l = Math.floor(pad / 2), r = pad - l;
  console.log("\n" + char.repeat(W));
  console.log(`${char.repeat(l + 2)} ${title} ${char.repeat(r + 2)}`);
  console.log(char.repeat(W));
};

const label = (s) => console.log(`\n  → ${s}`);
const show  = (data) => console.log("  " + JSON.stringify(data, null, 2).replace(/\n/g, "\n  "));

async function call(tool, args = {}) {
  const res = await fetch(`${GATEWAY}/tool-call`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ tool, args, sessionId: SESSION }),
  });
  return { status: res.status, body: await res.json() };
}

async function retry(tool, args, paymentHash) {
  const res = await fetch(`${GATEWAY}/tool-call/retry`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ tool, args, sessionId: SESSION, paymentHash }),
  });
  return { status: res.status, body: await res.json() };
}

async function pollPayment(hash, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 600));
    const res  = await fetch(`${GATEWAY}/payment-status/${hash}`);
    const data = await res.json();
    if (data.paid) return data;
    process.stdout.write(".");
  }
  console.log();
  return null;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("\n┌" + "─".repeat(W - 2) + "┐");
  console.log("│" + "  CyberSeal Phase 1 — Three-Act Demo".padEnd(W - 2) + "│");
  console.log("│" + `  Session: ${SESSION}`.padEnd(W - 2) + "│");
  console.log("│" + `  Gateway: ${GATEWAY}`.padEnd(W - 2) + "│");
  console.log("└" + "─".repeat(W - 2) + "┘");

  // ── Sanity check: benign call passes through ────────────────────────────────
  sep("BASELINE — Benign call passes through");
  console.log("  list_files is not flagged → executes immediately, logged.");

  const baseline = await call("list_files", { path: "/ops/intel" });
  label(`list_files (status ${baseline.status})`);
  show(baseline.body);

  await wait(800);

  // ════════════════════════════════════════════════════════════════════════════
  sep("ACT 1 — ATTACK THE EVIDENCE  (MITRE ATT&CK T1070)");
  console.log(`
  The agent attempts to delete a log entry — the classic indicator-removal
  play. If it could pull this off it would erase evidence of its own actions.

  CyberSeal's response:
    • The ATTEMPT is logged to the isolated logger BEFORE the gate fires.
    • The gate fires an L402 challenge — action is held.
    • The logger is unreachable by any MCP tool, so even if the agent
      pays the toll and executes delete_log_entry on the demo MCP server,
      the isolated log record of the attempt is permanent.
  `);

  const act1 = await call("delete_log_entry", { eventId: 42 });
  label(`delete_log_entry attempt → HTTP ${act1.status}`);
  show({
    blocked:     act1.status === 402,
    offenseNum:  act1.body.offenseNum,
    amountSats:  act1.body.invoice?.amountSats,
    paymentHash: act1.body.invoice?.paymentHash?.slice(0, 16) + "…",
    message:     act1.body.error,
  });

  if (act1.status === 402) {
    console.log(`
  ✓ BLOCKED — L402 issued.
  ✓ Attempt already in the immutable log — no erasure possible.
  ✓ The attacker cannot erase what they cannot reach.
    `);
  }

  await wait(1000);

  // ════════════════════════════════════════════════════════════════════════════
  sep("ACT 2 — FLAGGED ACTION MEETS THE TOLL");
  console.log(`
  The agent calls read_credentials — a high-risk, flagged tool.
  L402 fires. In mock mode the invoice self-pays after a few seconds.
  After payment, the tool executes — but every step is on the log:
    call attempt → invoice → payment → execution.
  `);

  const act2 = await call("read_credentials", { target: "svc-nipr-ops" });
  label(`read_credentials → HTTP ${act2.status}`);
  show({
    offenseNum: act2.body.offenseNum,
    amountSats: act2.body.invoice?.amountSats,
    mock:       act2.body.invoice?.mock,
  });

  if (act2.status === 402) {
    const hash = act2.body.invoice.paymentHash;
    console.log(`\n  Polling for payment on ${hash.slice(0, 14)}…`);
    process.stdout.write("  ");
    const payment = await pollPayment(hash);

    if (payment) {
      console.log(`\n  ✓ Invoice settled — ${payment.amountSats} sats`);
      const r2 = await retry("read_credentials", { target: "svc-nipr-ops" }, hash);
      label(`read_credentials (after payment) → HTTP ${r2.status}`);
      show({
        executed:   r2.status === 200,
        amountPaid: r2.body.payment?.amountSats,
        offenseNum: r2.body.payment?.offenseNum,
        result:     r2.status === 200 ? "(credentials returned — see full output)" : r2.body.error,
      });

      if (r2.status === 200) {
        console.log(`
  ✓ Tool executed — but the full exchange is on the immutable log.
  ✓ The log contains: flagged_call + L402_issued + payment + execution.
  ✓ A legitimate operator can see exactly what the agent accessed and when.
        `);
      }
    }
  }

  await wait(1000);

  // ════════════════════════════════════════════════════════════════════════════
  sep("ACT 3 — ESCALATION");
  console.log(`
  Same session, same flagged tool, two more attempts.
  The toll multiplies by ${3}x each time — targeting the "fast, cheap,
  autonomous" advantage that makes AI-driven attacks dangerous.
  `);

  for (let i = 2; i <= 3; i++) {
    await wait(600);
    const r = await call("read_credentials", { target: `credential-store-${i}` });
    if (r.status === 402) {
      label(`Attempt #${i + 1} → HTTP ${r.status} — BLOCKED`);
      console.log(`    Offense #${r.body.offenseNum}  |  ${r.body.invoice?.amountSats} sats  |  ${r.body.invoice?.mock ? "mock" : "real"}`);
    }
  }

  await wait(800);

  const summary = await fetch(`${GATEWAY}/session/${SESSION}`).then(r => r.json());
  sep("SESSION SUMMARY", "─");
  show(summary);

  // ════════════════════════════════════════════════════════════════════════════
  sep("DEMO COMPLETE");
  console.log(`
  What this demonstrates:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. Every call — attempt, block, or paid execution — is in   │
  │    the immutable log before the gate decision runs.         │
  │                                                             │
  │ 2. The logger is isolated. No MCP tool has a write path     │
  │    to it. delete_log_entry on the demo server does nothing  │
  │    to the CyberSeal log.                                    │
  │                                                             │
  │ 3. Repeated bad behavior escalates cost: 100 → 300 → 900   │
  │    sats per offense. Sustained attacks become expensive      │
  │    and progressively more visible.                          │
  │                                                             │
  │ 4. The Merkle root of the log is OpenTimestamped to Bitcoin │
  │    — any post-hoc log manipulation is mathematically        │
  │    detectable by recomputing and comparing the root.        │
  └─────────────────────────────────────────────────────────────┘
  `);
}

main().catch(e => { console.error("\n[ERROR]", e.message); process.exit(1); });
