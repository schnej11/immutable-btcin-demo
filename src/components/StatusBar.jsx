import { P } from '../palette.js';

function ServiceBadge({ label, ok, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div className={`cs-dot cs-dot-${ok ? 'ok' : 'off'}`} />
      <span style={{ fontFamily: P.fontTactical, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: ok ? P.text : P.muted }}>
        {label}
      </span>
      {detail && (
        <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
          background: P.surf2, border: `1px solid ${P.border}`, borderRadius: 3,
          padding: '1px 5px' }}>
          {detail}
        </span>
      )}
    </div>
  );
}

export default function StatusBar({ health, loggerState, sessions, mcpTools }) {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const mode = loggerState?.mode || '—';
  const evCount = loggerState?.eventCount ?? 0;

  return (
    <div style={{
      height: 48, background: P.surf2, borderBottom: `1px solid ${P.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', flexShrink: 0,
    }}>
      {/* Left: logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: P.fontTactical, fontSize: 13, fontWeight: 700,
          color: P.yellow, letterSpacing: '0.12em' }}>
          CYBERSEAL
        </span>
        <span style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
          letterSpacing: '0.06em' }}>
          PHASE 1
        </span>
      </div>

      {/* Center: service badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <ServiceBadge label="Logger" ok={health.logger}
          detail={health.logger ? `${mode} · ${evCount} events` : 'offline'} />
        <div style={{ width: 1, height: 16, background: P.border }} />
        <ServiceBadge label="Gateway" ok={health.gateway}
          detail={health.gateway ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : 'offline'} />
        <div style={{ width: 1, height: 16, background: P.border }} />
        <ServiceBadge label="MCP" ok={health.mcp}
          detail={health.mcp ? `${mcpTools.length} tools` : 'offline'} />
      </div>

      {/* Right: clock */}
      <span style={{ fontFamily: P.fontMono, fontSize: 11, color: P.muted }}>
        {now} UTC
      </span>
    </div>
  );
}
