// Merkle tree computation — shared between logger and dashboard
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const { subtle } = globalThis.crypto;

async function sha256(data) {
  const enc = new TextEncoder().encode(data);
  const buf = await subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Pair(a, b) { return sha256(a + b); }

async function buildMerkleRoot(hashes) {
  if (!hashes.length) return null;
  let lvl = [...hashes];
  while (lvl.length > 1) {
    const next = [];
    for (let i = 0; i < lvl.length; i += 2)
      next.push(await sha256Pair(lvl[i], lvl[i + 1] || lvl[i]));
    lvl = next;
  }
  return lvl[0];
}

module.exports = { sha256, buildMerkleRoot };
