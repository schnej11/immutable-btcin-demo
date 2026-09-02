import { P } from '../palette.js';

function truncate(h, n = 12) {
  return h ? `${h.slice(0, n)}…` : '—';
}

function RootRow({ label, hash, depth = 0 }) {
  return (
    <div className="cs-tt-host" style={{ paddingLeft: depth * 12,
      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      {depth > 0 && (
        <span style={{ color: P.border, fontFamily: P.fontMono, fontSize: 9 }}>
          {'└─'}
        </span>
      )}
      <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
        minWidth: 72, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: P.fontMono, fontSize: 10, color: P.dim }}>
        {truncate(hash)}
      </span>
      {hash && (
        <div className="cs-tt">
          {`${label}\n${hash}`}
        </div>
      )}
    </div>
  );
}

export default function MerkleHierarchy({ loggerState }) {
  if (!loggerState) {
    return (
      <div>
        <div className="cs-panel-hd">Merkle Hierarchy</div>
        <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.muted,
          padding: '12px 0' }}>
          Logger offline
        </div>
      </div>
    );
  }

  const { globalRoot, regionRoots = [], baseRoots = [], endpointRoots = [],
          tamperedCount = 0, eventCount = 0, otsReceipts = {} } = loggerState;

  const integrity = tamperedCount === 0;
  const otsEntries = Object.entries(otsReceipts);
  const latestOts  = otsEntries.length ? otsEntries[otsEntries.length - 1] : null;
  const otsStatus  = latestOts ? latestOts[1]?.status : null;

  return (
    <div>
      <div className="cs-panel-hd">Merkle Hierarchy</div>

      {/* Integrity badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div className={`cs-dot cs-dot-${integrity ? 'ok' : 'crit'}`} />
        <span style={{ fontFamily: P.fontTactical, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: integrity ? P.ok : P.crit }}>
          {integrity ? 'Integrity OK' : `${tamperedCount} Tampered`}
        </span>
      </div>

      {/* Global root */}
      <div className="cs-card" style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: P.fontTactical, fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: P.muted, marginBottom: 4 }}>
          Global Root
        </div>
        <div className="cs-tt-host" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: P.fontMono, fontSize: 11, color: P.yellow }}>
            {truncate(globalRoot, 16)}
          </span>
          {globalRoot && <div className="cs-tt">{globalRoot}</div>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          {otsStatus === 'confirmed' ? (
            <span className="cs-badge"
              style={{ color: P.ok, background: P.okBg, borderColor: P.okBd }}>
              ✓ OTS Confirmed
            </span>
          ) : otsStatus === 'pending' ? (
            <span className="cs-badge"
              style={{ color: P.warn, background: P.warnBg, borderColor: P.warnBd }}>
              ⟳ OTS Pending
            </span>
          ) : (
            <span className="cs-badge"
              style={{ color: P.muted, background: P.surf2, borderColor: P.border }}>
              No OTS stamp
            </span>
          )}
          <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted }}>
            {eventCount} events
          </span>
        </div>
      </div>

      {/* Tree */}
      <div style={{ fontSize: 10 }}>
        <RootRow label="INDOPACOM"  hash={regionRoots[0]}   depth={0} />
        <RootRow label="JBPHH"      hash={baseRoots[0]}     depth={1} />
        <RootRow label="NIPR-WS-001" hash={endpointRoots[0]} depth={2} />
      </div>
    </div>
  );
}
