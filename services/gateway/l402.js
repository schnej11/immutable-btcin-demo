// CyberSeal — L402 Toll Gate with Escalating Pricing
//
// Pricing: starts at TOLL_BASE_SATS, multiplied by TOLL_MULTIPLIER
// for each subsequent flagged call from the same session.
//
// Lightning integration: set LND_HOST + LND_MACAROON in .env to use
// a real Polar/LND node. Otherwise mock invoices auto-settle after
// MOCK_PAYMENT_DELAY_MS (default 3000ms) so the demo works standalone.

if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const TOLL_BASE_SATS  = 100;
const TOLL_MULTIPLIER = 3; // offense 1 = 100, offense 2 = 300, offense 3 = 900, …

// sessions: Map<sessionId, { offenseCount }>
const sessions     = new Map();
// tolls: Map<paymentHash, tollRecord>
const pendingTolls = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, { offenseCount: 0 });
  return sessions.get(sessionId);
}

function nextTollAmount(sessionId) {
  const s = getSession(sessionId);
  return Math.round(TOLL_BASE_SATS * Math.pow(TOLL_MULTIPLIER, s.offenseCount));
}

function incrementOffense(sessionId) {
  const s = getSession(sessionId);
  s.offenseCount++;
  return s.offenseCount;
}

// ── Invoice generation ─────────────────────────────────────────────────────────
const LND_HOST     = process.env.LND_HOST;
const LND_MACAROON = process.env.LND_MACAROON;
const MOCK_DELAY   = parseInt(process.env.MOCK_PAYMENT_DELAY_MS || "3000", 10);

function randHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateInvoice(amountSats, memo) {
  // Real LND path (Polar regtest)
  if (LND_HOST && LND_MACAROON) {
    try {
      const res = await fetch(`${LND_HOST}/v1/invoices`, {
        method: "POST",
        headers: {
          "Content-Type":           "application/json",
          "Grpc-Metadata-macaroon": LND_MACAROON,
        },
        body: JSON.stringify({ value: amountSats, memo, expiry: 3600 }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[L402] Real LND invoice: ${amountSats} sats`);
        return { paymentRequest: data.payment_request, paymentHash: data.r_hash, amountSats, mock: false };
      }
    } catch (e) {
      console.warn(`[L402] LND unreachable (${e.message}) — falling back to mock`);
    }
  }

  // Mock path
  const paymentHash = randHex(32);
  return {
    paymentRequest: `lnbcrt${amountSats}u1p_CYBERSEAL_${paymentHash.slice(0, 16)}`,
    paymentHash,
    amountSats,
    mock: true,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function createToll(sessionId, tool, args) {
  const amount      = nextTollAmount(sessionId);
  const offenseNum  = incrementOffense(sessionId);
  const invoice     = await generateInvoice(amount, `CyberSeal: flagged ${tool} (offense #${offenseNum})`);

  const record = {
    sessionId,
    tool,
    args,
    invoice,
    offenseNum,
    createdAt: Date.now(),
    paid:      false,
    preimage:  null,
    paidAt:    null,
  };
  pendingTolls.set(invoice.paymentHash, record);

  // Auto-settle mock invoices after delay
  if (invoice.mock) {
    setTimeout(() => {
      const t = pendingTolls.get(invoice.paymentHash);
      if (t && !t.paid) {
        t.paid     = true;
        t.preimage = randHex(32);
        t.paidAt   = Date.now();
        console.log(`[L402] Mock settled: ${tool} — ${amount} sats (offense #${offenseNum})`);
      }
    }, MOCK_DELAY);
  }

  return { toll: record, invoice };
}

async function checkPayment(paymentHash) {
  const toll = pendingTolls.get(paymentHash);
  if (!toll) return { found: false };

  // Check real LND if configured and not yet paid
  if (!toll.paid && !toll.invoice.mock && LND_HOST && LND_MACAROON) {
    try {
      const hashB64 = Buffer.from(paymentHash, "hex").toString("base64url");
      const res = await fetch(`${LND_HOST}/v1/invoice/${hashB64}`, {
        headers: { "Grpc-Metadata-macaroon": LND_MACAROON },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state === "SETTLED") {
          toll.paid     = true;
          toll.preimage = Buffer.from(data.r_preimage, "base64").toString("hex");
          toll.paidAt   = Date.now();
        }
      }
    } catch { /* retry next check */ }
  }

  return { found: true, paid: toll.paid, toll };
}

function getSessionSummary(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const tolls = Array.from(pendingTolls.values()).filter(t => t.sessionId === sessionId);
  return {
    sessionId,
    offenseCount:   s.offenseCount,
    totalPaidSats:  tolls.filter(t => t.paid).reduce((sum, t) => sum + t.invoice.amountSats, 0),
    nextTollSats:   nextTollAmount(sessionId),
    tollHistory:    tolls.map(t => ({
      tool:       t.tool,
      offenseNum: t.offenseNum,
      amountSats: t.invoice.amountSats,
      paid:       t.paid,
      paidAt:     t.paidAt,
      mock:       t.invoice.mock,
    })),
  };
}

module.exports = { createToll, checkPayment, getSessionSummary, nextTollAmount };
