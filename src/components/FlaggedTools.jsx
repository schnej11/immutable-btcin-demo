import { P, statusStyle } from '../palette.js';
import { GATEWAY } from '../hooks/useBackendState.js';

export default function FlaggedTools({ mcpTools, flaggedTools, onRefetch }) {
  async function toggle(toolName, currentlyFlagged) {
    try {
      if (currentlyFlagged) {
        await fetch(`${GATEWAY}/flagged-tools/${toolName}`, { method: 'DELETE' });
      } else {
        await fetch(`${GATEWAY}/flagged-tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: toolName }),
        });
      }
      onRefetch();
    } catch (e) {
      console.warn('[FlaggedTools] toggle failed:', e.message);
    }
  }

  const flaggedSet = new Set(flaggedTools);

  return (
    <div>
      <div className="cs-panel-hd">Flagged Tools</div>

      {mcpTools.length === 0 ? (
        <div style={{ fontFamily: P.fontCondensed, fontSize: 11, color: P.muted,
          padding: '8px 0' }}>
          MCP server offline
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mcpTools.map(tool => {
            const flagged = flaggedSet.has(tool.name);
            const rs = statusStyle(tool.risk);
            return (
              <div key={tool.name} className="cs-card"
                style={{ borderColor: flagged ? P.warnBd : P.border }}>
                <div style={{ display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 2 }}>
                      <span style={{ fontFamily: P.fontMono, fontSize: 11,
                        color: flagged ? P.warn : P.text }}>
                        {tool.name}
                      </span>
                      <span className="cs-badge"
                        style={{ color: rs.fg, background: rs.bg, borderColor: rs.bd }}>
                        {tool.risk || 'UNKNOWN'}
                      </span>
                      {flagged && (
                        <span className="cs-badge"
                          style={{ color: P.warn, background: P.warnBg,
                            borderColor: P.warnBd }}>
                          ⚑ FLAGGED
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: P.fontCondensed, fontSize: 10, color: P.muted,
                      lineHeight: 1.4 }}>
                      {tool.description}
                    </div>
                  </div>
                </div>

                <button
                  className="cs-btn"
                  onClick={() => toggle(tool.name, flagged)}
                  style={{
                    color:       flagged ? P.crit   : P.ok,
                    background:  flagged ? P.critBg : P.okBg,
                    borderColor: flagged ? P.critBd : P.okBd,
                    fontSize: 9,
                  }}
                >
                  {flagged ? '✕ Unflag' : '⚑ Flag'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
