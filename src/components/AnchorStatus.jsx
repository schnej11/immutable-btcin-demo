import { P } from '../palette.js';

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AnchorStatus({ loggerState }) {
  const receipts = loggerState?.otsReceipts ?? {};
  const entries  = Object.entries(receipts).slice(-6); // show last 6

  return (
    <div>
      <div className="cs-panel-hd">Bitcoin Anchors</div>

      {entries.length === 0 ? (
        <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.muted,
          padding: '8px 0' }}>
          No OTS receipts yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([rootHash, receipt]) => {
            const confirmed = receipt.status === 'confirmed';
            const pending   = receipt.status === 'pending';
            const statusFg  = confirmed ? P.ok : pending ? P.warn : P.muted;
            const statusBg  = confirmed ? P.okBg : pending ? P.warnBg : P.surf2;
            const statusBd  = confirmed ? P.okBd : pending ? P.warnBd : P.border;
            const statusLbl = confirmed ? '✓ Confirmed' : pending ? '⟳ Pending' : 'Unknown';
            const icon      = confirmed ? '✓' : '⟳';

            return (
              <div key={rootHash} className="cs-card cs-tt-host" style={{ fontSize: 10 }}>
                {/* Tooltip with full hash */}
                <div className="cs-tt">{`Root: ${rootHash}\nCalendar: ${receipt.calendar || '—'}\nSubmitted: ${receipt.submittedAt ? new Date(receipt.submittedAt).toISOString() : '—'}\nConfirmed: ${receipt.confirmedAt ? new Date(receipt.confirmedAt).toISOString() : 'pending'}`}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontFamily: P.fontMono, fontSize: 10, color: P.dim }}>
                    {rootHash.slice(0, 14)}…
                  </span>
                  <span className="cs-badge"
                    style={{ color: statusFg, background: statusBg, borderColor: statusBd }}>
                    {statusLbl}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, color: P.muted,
                  fontFamily: P.fontCondensed, fontSize: 9 }}>
                  <span>↑ {fmtTime(receipt.submittedAt)}</span>
                  {confirmed && <span>✓ {fmtTime(receipt.confirmedAt)}</span>}
                  {receipt.calendar && (
                    <span style={{ color: P.muted }}>
                      {receipt.calendar.replace('https://', '').split('/')[0]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
