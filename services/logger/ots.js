// OpenTimestamps integration via HTTP to the public calendar pool.
// We call the calendar REST API directly rather than bundling the
// javascript-opentimestamps npm package, which has Node 18 ESM issues.
// The HTTP calls are exactly what the library does under the hood.
//
// Calendar docs: https://opentimestamps.org/

const CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://c.pool.opentimestamps.org",
];

// receipts: Map<rootHashHex, { status, submittedAt, receiptHex?, confirmedAt?, error? }>
const receipts = new Map();

async function stampRoot(rootHashHex) {
  if (receipts.has(rootHashHex)) return receipts.get(rootHashHex);

  const hashBytes = Buffer.from(rootHashHex, "hex");

  for (const cal of CALENDARS) {
    try {
      const res = await fetch(`${cal}/digest`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: hashBytes,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const receiptBytes = Buffer.from(await res.arrayBuffer());
      const record = {
        status: "pending",
        calendar: cal,
        submittedAt: Date.now(),
        receiptHex: receiptBytes.toString("hex"),
        confirmedAt: null,
      };
      receipts.set(rootHashHex, record);
      console.log(`[OTS] Stamped ${rootHashHex.slice(0, 8)}… via ${cal} — awaiting Bitcoin confirmation`);
      return record;
    } catch { /* try next calendar */ }
  }

  const errRecord = { status: "error", submittedAt: Date.now(), error: "All calendars unreachable" };
  receipts.set(rootHashHex, errRecord);
  console.warn(`[OTS] Could not stamp ${rootHashHex.slice(0, 8)}… — continuing without OTS`);
  return errRecord;
}

async function upgradeReceipt(rootHashHex) {
  const record = receipts.get(rootHashHex);
  if (!record || record.status !== "pending") return record;

  try {
    const res = await fetch(`${record.calendar}/timestamp/${rootHashHex}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return record; // not yet confirmed on-chain
    if (!res.ok) return record;

    const upgraded = Buffer.from(await res.arrayBuffer());
    record.status = "confirmed";
    record.confirmedAt = Date.now();
    record.upgradedReceiptHex = upgraded.toString("hex");
    console.log(`[OTS] Confirmed ${rootHashHex.slice(0, 8)}…`);
  } catch { /* retry next cycle */ }

  return record;
}

function getAllReceipts() {
  return Object.fromEntries(receipts);
}

module.exports = { stampRoot, upgradeReceipt, getAllReceipts };
