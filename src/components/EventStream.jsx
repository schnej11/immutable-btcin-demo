import { useState } from 'react';
import { P, evtStyle, EVT_PALETTE } from '../palette.js';

const FILTERS = ['ALL', 'TOOL_CALL', 'FLAGGED_TOOL_CALL', 'TOOL_CALL_PAID', 'FLAG_ACTION', 'DEMO_SIM'];

function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventRow({ evt, hash }) {
  const style = evtStyle(evt.type);
  const isFlagged = evt.flagged || evt.type === 'FLAGGED_TOOL_CALL';

  const tooltipContent = [
    `Type:     ${evt.type}`,
    `Endpoint: ${evt.endpoint || '—'}  Base: ${evt.base || '—'}`,
    `Session:  ${evt.user || '—'}`,
    `Source:   ${evt.source || '—'}`,
    hash ? `Hash:     ${hash}` : null,
    evt.payload ? `\nPayload:\n${evt.payload.slice(0, 240)}` : null,
  ].filter(Boolean).join('\n');

  return (
    <div className="cs-tt-host" style={{
      display: 'grid',
      gridTemplateColumns: '68px 1fr auto',
      gap: 6,
      alignItems: 'center',
      padding: '5px 0',
      borderBottom: `1px solid ${P.surf3}`,
      cursor: 'default',
    }}>
      <div className="cs-tt">{tooltipContent}</div>

      {/* Type badge */}
      <span className="cs-badge" style={{
        color: style.fg, background: style.bg, borderColor: style.bd,
        fontSize: 9, padding: '1px 4px',
      }}>
        {style.label}
      </span>

      {/* Label + endpoint */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {evt.label || evt.toolName || evt.type}
          {isFlagged && (
            <span style={{ marginLeft: 4, color: P.warn, fontSize: 9 }}>⚠</span>
          )}
        </div>
        <div style={{ fontFamily: P.fontMono, fontSize: 9, color: P.muted }}>
          {evt.endpoint || ''}{evt.base ? ` · ${evt.base}` : ''}
        </div>
      </div>

      {/* Timestamp */}
      <span style={{ fontFamily: P.fontMono, fontSize: 9, color: P.muted,
        flexShrink: 0 }}>
        {fmtTs(evt.timestamp || evt.ts)}
      </span>
    </div>
  );
}

export default function EventStream({ loggerState }) {
  const [filter, setFilter] = useState('ALL');

  const events     = loggerState?.events ?? [];
  const eventHashes = loggerState?.eventHashes ?? {};

  const visible = (filter === 'ALL' ? events : events.filter(e => e.type === filter))
    .slice().reverse().slice(0, 60);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="cs-panel-hd">Live Event Stream</div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {FILTERS.map(f => {
          const s = evtStyle(f);
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} className="cs-btn" style={{
              color:      active ? (f === 'ALL' ? P.yellow : s.fg) : P.muted,
              background: active ? (f === 'ALL' ? P.yellowBg : s.bg) : 'transparent',
              borderColor: active ? (f === 'ALL' ? P.yellowBd : s.bd) : P.border,
              fontSize: 9, padding: '2px 7px',
            }}>
              {f === 'ALL' ? 'ALL' : evtStyle(f).label}
            </button>
          );
        })}
      </div>

      {/* Events */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {visible.length === 0 ? (
          <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.muted,
            padding: '16px 0' }}>
            {!loggerState ? 'Logger offline' : filter === 'ALL' ? 'No events yet' : 'No events match filter'}
          </div>
        ) : (
          visible.map((e, i) => (
            <EventRow key={e.id ?? i} evt={e} hash={eventHashes[e.id] ?? eventHashes[i]} />
          ))
        )}
      </div>

      {/* Legend */}
      <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 8, marginTop: 8,
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        {Object.entries(EVT_PALETTE).map(([type, s]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.fg,
              display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: P.fontCondensed, fontSize: 9, color: P.muted }}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
