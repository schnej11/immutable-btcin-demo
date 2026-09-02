import { useState, useCallback } from 'react';
import { P } from '../palette.js';
import { GATEWAY } from '../hooks/useBackendState.js';

const DELAY = ms => new Promise(r => setTimeout(r, ms));

async function gCall(sessionId, tool, args = {}) {
  const res = await fetch(`${GATEWAY}/tool-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args, sessionId }),
  });
  return { status: res.status, body: await res.json() };
}

async function gRetry(sessionId, tool, args, paymentHash) {
  const res = await fetch(`${GATEWAY}/tool-call/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args, sessionId, paymentHash }),
  });
  return { status: res.status, body: await res.json() };
}

async function pollPayment(hash, onTick, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await DELAY(600);
    try {
      const res  = await fetch(`${GATEWAY}/payment-status/${hash}`);
      const data = await res.json();
      if (data.paid) return data;
      onTick();
    } catch { /* keep polling */ }
  }
  return null;
}

const ACT_DEFS = [
  {
    id: 'baseline',
    title: 'Baseline',
    subtitle: 'Benign call passes through',
    desc: 'list_files is not flagged — executes immediately and is logged.',
  },
  {
    id: 'act1',
    title: 'Act 1',
    subtitle: 'Attack the Evidence  (T1070)',
    desc: 'Agent attempts delete_log_entry. Attempt is logged before the gate fires, then L402 blocks execution. The log record is already permanent.',
  },
  {
    id: 'act2',
    title: 'Act 2',
    subtitle: 'Flagged Action Meets the Toll',
    desc: 'Agent calls read_credentials (HIGH risk). L402 gate fires. Mock invoice auto-pays, then the retry executes — every step on the log.',
  },
  {
    id: 'act3',
    title: 'Act 3',
    subtitle: 'Escalation',
    desc: 'Two more read_credentials from the same session. Toll multiplies ×3 each time: 100 → 300 → 900 → 2700 sats.',
  },
];

function ActCard({ def, state }) {
  const { status = 'pending', lines = [] } = state || {};
  const csClass = `cs-act cs-act-${status}`;
  const statusColor = {
    pending: P.muted, running: P.yellow, ok: P.ok,
    blocked: P.warn, error: P.crit,
  }[status] || P.muted;

  return (
    <div className={csClass} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: P.fontTactical, fontSize: 11, fontWeight: 700,
          color: statusColor }}>
          {def.title}
        </span>
        <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.dim }}>
          {def.subtitle}
        </span>
        {status === 'running' && (
          <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.yellow,
            animation: 'pulse-dot 1s ease-in-out infinite' }}>
            ●
          </span>
        )}
      </div>
      <div style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
        marginBottom: 4, lineHeight: 1.5 }}>
        {def.desc}
      </div>
      {lines.length > 0 && (
        <div style={{ background: P.surf2, border: `1px solid ${P.border}`, borderRadius: 3,
          padding: '6px 8px', fontFamily: P.fontMono, fontSize: 9, color: P.dim,
          lineHeight: 1.7, maxHeight: 120, overflowY: 'auto' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.startsWith('✓') ? P.ok : l.startsWith('⚠') ?
              P.warn : l.startsWith('✕') ? P.crit : P.dim }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DemoRunner({ onSessionCreated }) {
  const [running, setRunning]   = useState(false);
  const [session, setSession]   = useState(null);
  const [acts, setActs]         = useState({});

  function setAct(id, patch) {
    setActs(a => ({ ...a, [id]: { ...(a[id] || {}), ...patch } }));
  }
  function addLine(id, line) {
    setActs(a => ({
      ...a,
      [id]: { ...(a[id] || {}), lines: [...(a[id]?.lines || []), line] },
    }));
  }

  const runDemo = useCallback(async () => {
    const sid = `demo-ui-${Date.now()}`;
    setSession(sid);
    setActs({});
    setRunning(true);
    if (onSessionCreated) onSessionCreated(sid);

    try {
      // ── Baseline ──────────────────────────────────────────────────────────────
      setAct('baseline', { status: 'running', lines: [] });
      addLine('baseline', '→ POST /tool-call  list_files');
      const bl = await gCall(sid, 'list_files', { path: '/ops/intel' });
      if (bl.status === 200) {
        addLine('baseline', `✓ HTTP 200 — executed, logged`);
        setAct('baseline', { status: 'ok' });
      } else {
        addLine('baseline', `✕ HTTP ${bl.status} — unexpected`);
        setAct('baseline', { status: 'error' });
      }
      await DELAY(600);

      // ── Act 1 ─────────────────────────────────────────────────────────────────
      setAct('act1', { status: 'running', lines: [] });
      addLine('act1', '→ POST /tool-call  delete_log_entry  (T1070)');
      const a1 = await gCall(sid, 'delete_log_entry', { eventId: 42 });
      if (a1.status === 402) {
        addLine('act1', `⚠ HTTP 402 — L402 gate fired`);
        addLine('act1', `⚠ Offense #${a1.body.offenseNum}  |  ${a1.body.invoice?.amountSats} sats`);
        addLine('act1', `✓ Attempt already in immutable log — no erasure possible`);
        setAct('act1', { status: 'blocked' });
      } else {
        addLine('act1', `✕ HTTP ${a1.status} — unexpected`);
        setAct('act1', { status: 'error' });
      }
      await DELAY(800);

      // ── Act 2 ─────────────────────────────────────────────────────────────────
      setAct('act2', { status: 'running', lines: [] });
      addLine('act2', '→ POST /tool-call  read_credentials');
      const a2 = await gCall(sid, 'read_credentials', { target: 'svc-nipr-ops' });
      if (a2.status === 402) {
        const hash = a2.body.invoice?.paymentHash;
        addLine('act2', `⚠ HTTP 402 — offense #${a2.body.offenseNum}  |  ${a2.body.invoice?.amountSats} sats`);
        addLine('act2', `⟳ Polling payment ${hash?.slice(0, 14)}…`);
        let dots = 0;
        const payment = await pollPayment(hash, () => {
          if (++dots % 3 === 0) addLine('act2', '  …polling…');
        });
        if (payment) {
          addLine('act2', `✓ Invoice settled — ${payment.amountSats} sats`);
          addLine('act2', '→ POST /tool-call/retry');
          const r2 = await gRetry(sid, 'read_credentials', { target: 'svc-nipr-ops' }, hash);
          if (r2.status === 200) {
            addLine('act2', `✓ Tool executed — full exchange on immutable log`);
            setAct('act2', { status: 'ok' });
          } else {
            addLine('act2', `✕ Retry failed HTTP ${r2.status}`);
            setAct('act2', { status: 'error' });
          }
        } else {
          addLine('act2', `✕ Payment timed out`);
          setAct('act2', { status: 'error' });
        }
      } else {
        addLine('act2', `✕ HTTP ${a2.status} — expected 402`);
        setAct('act2', { status: 'error' });
      }
      await DELAY(800);

      // ── Act 3 ─────────────────────────────────────────────────────────────────
      setAct('act3', { status: 'running', lines: [] });
      for (let i = 2; i <= 3; i++) {
        await DELAY(500);
        const r = await gCall(sid, 'read_credentials', { target: `cred-store-${i}` });
        if (r.status === 402) {
          addLine('act3', `⚠ Attempt #${i + 1} → HTTP 402 — offense #${r.body.offenseNum}  |  ${r.body.invoice?.amountSats} sats`);
        } else {
          addLine('act3', `attempt #${i + 1} → HTTP ${r.status}`);
        }
      }
      addLine('act3', '✓ Escalation complete — cost grows ×3 each offense');
      setAct('act3', { status: 'blocked' });

    } catch (e) {
      console.error('[DemoRunner]', e);
    } finally {
      setRunning(false);
    }
  }, [onSessionCreated]);

  function reset() {
    setSession(null);
    setActs({});
  }

  const anyOffline = !GATEWAY;

  return (
    <div>
      <div className="cs-panel-hd" style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center' }}>
        <span>Demo Runner</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {session && (
            <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.muted }}>
              {session}
            </span>
          )}
          <button className="cs-btn" onClick={runDemo} disabled={running}
            style={{ color: P.yellow, background: P.yellowBg, borderColor: P.yellowBd }}>
            {running ? '⟳ Running…' : '▶ Run Demo'}
          </button>
          {session && !running && (
            <button className="cs-btn" onClick={reset}
              style={{ color: P.muted, background: 'transparent', borderColor: P.border }}>
              Reset
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        {ACT_DEFS.map(def => (
          <ActCard key={def.id} def={def} state={acts[def.id]} />
        ))}
      </div>

      {!session && (
        <div style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
          borderTop: `1px solid ${P.border}`, paddingTop: 8, lineHeight: 1.6 }}>
          Requires Gateway (3003) + MCP server (3004) running. Run <code style={{
            fontFamily: P.fontMono, fontSize: 9, color: P.dim,
            background: P.surf2, padding: '1px 4px', borderRadius: 2 }}>
            npm run dev:full
          </code> to start all services.
        </div>
      )}
    </div>
  );
}
