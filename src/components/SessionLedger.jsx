import { useState } from 'react';
import { P } from '../palette.js';

const BASE  = 100;
const MULT  = 3;
function projectedSats(n) { return Math.round(BASE * Math.pow(MULT, n - 1)); }

function EscalationChart({ tollHistory }) {
  if (!tollHistory.length) return null;
  const maxSats = tollHistory.reduce((m, t) => Math.max(m, t.amountSats), 1);

  const barColor = (t) => t.paid ? P.ok : P.warn;

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {tollHistory.map(t => (
        <div key={t.paymentHash || t.offenseNum} className="cs-bar-row">
          <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.muted,
            width: 20, textAlign: 'right', flexShrink: 0 }}>
            #{t.offenseNum}
          </span>
          <div className="cs-bar-track">
            <div className="cs-bar-fill"
              style={{ width: `${(t.amountSats / maxSats) * 100}%`,
                background: barColor(t) }} />
          </div>
          <span style={{ fontFamily: P.fontMono, fontSize: 9,
            color: t.paid ? P.ok : P.warn, width: 40, flexShrink: 0 }}>
            {t.amountSats}
          </span>
          <span style={{ fontFamily: P.fontCondensed, fontSize: 9, color: P.muted }}>
            {t.tool}
          </span>
          {t.paid && (
            <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.ok }}>✓</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SessionCard({ session }) {
  const [open, setOpen] = useState(false);
  const { sessionId, offenseCount, totalPaidSats, nextTollSats, tollHistory = [] } = session;

  const critLevel = offenseCount >= 4 ? P.crit : offenseCount >= 2 ? P.warn : P.ok;

  return (
    <div className="cs-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header row */}
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 120 }}>
            {sessionId}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: P.fontTactical, fontSize: 10, fontWeight: 600,
            color: critLevel }}>
            ×{offenseCount}
          </span>
          <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.ok }}>
            {totalPaidSats}ₛ paid
          </span>
          <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.dim }}>
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Next toll info */}
      <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: P.fontCondensed, fontSize: 9, color: P.muted }}>
          Next toll:
        </span>
        <span style={{ fontFamily: P.fontMono, fontSize: 10, fontWeight: 600,
          color: P.warn }}>
          {nextTollSats} sats
        </span>
        <span style={{ fontFamily: P.fontCondensed, fontSize: 9, color: P.muted }}>
          ({offenseCount + 1 === 1 ? '1st' : `offense #${offenseCount + 1}`})
        </span>
      </div>

      {/* Expanded */}
      {open && tollHistory.length > 0 && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${P.border}`, paddingTop: 8 }}>
          {/* Table */}
          <div style={{ display: 'grid',
            gridTemplateColumns: '28px 1fr 52px 52px',
            gap: '2px 6px', fontSize: 9, fontFamily: P.fontCondensed }}>
            {['#', 'Tool', 'Sats', 'Status'].map(h => (
              <span key={h} style={{ color: P.muted, fontWeight: 600,
                letterSpacing: '0.06em', borderBottom: `1px solid ${P.border}`,
                paddingBottom: 3 }}>
                {h}
              </span>
            ))}
            {tollHistory.map(t => (
              <>
                <span key={`n-${t.offenseNum}`} style={{ color: P.muted }}>
                  #{t.offenseNum}
                </span>
                <span key={`t-${t.offenseNum}`} className="cs-tt-host"
                  style={{ color: P.dim, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}>
                  {t.tool}
                  <div className="cs-tt">{`Tool: ${t.tool}\nHash: ${t.paymentHash || '—'}\nCreated: ${t.createdAt ? new Date(t.createdAt).toISOString() : '—'}\nPaid at: ${t.paidAt ? new Date(t.paidAt).toISOString() : 'unpaid'}`}</div>
                </span>
                <span key={`s-${t.offenseNum}`}
                  style={{ color: t.paid ? P.ok : P.warn, fontFamily: P.fontMono }}>
                  {t.amountSats}
                </span>
                <span key={`st-${t.offenseNum}`} style={{ color: t.paid ? P.ok : P.warn }}>
                  {t.paid ? '✓ paid' : '⟳ open'}
                </span>
              </>
            ))}
          </div>
          <EscalationChart tollHistory={tollHistory} />
        </div>
      )}
    </div>
  );
}

export default function SessionLedger({ sessions }) {
  const total = sessions.reduce((s, sess) => s + sess.totalPaidSats, 0);

  return (
    <div>
      <div className="cs-panel-hd" style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center' }}>
        <span>Session &amp; Toll Ledger</span>
        {sessions.length > 0 && (
          <span style={{ fontFamily: P.fontMono, fontSize: 10, color: P.ok,
            textTransform: 'none', letterSpacing: 0 }}>
            {total} sats total
          </span>
        )}
      </div>

      {sessions.length === 0 ? (
        <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.muted,
          padding: '12px 0' }}>
          No sessions yet. Run the demo to see toll history.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...sessions].reverse().map(s => (
            <SessionCard key={s.sessionId} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
