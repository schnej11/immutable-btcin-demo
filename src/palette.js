// Shared design tokens for all dashboard components.
// These mirror src/vx.css custom properties so they're available for
// inline styles and SVG fills without getComputedStyle overhead.

export const P = {
  // Surfaces
  bg:       '#1E1E1E',
  surf:     '#282828',
  surf2:    '#141414',
  surf3:    '#2A2A2A',
  border:   '#2A2A2A',
  borderHi: '#434343',
  // Text
  text:     '#F5F5F5',
  dim:      '#BEBEBE',
  muted:    '#757575',
  // Accent
  yellow:   '#FFCB03',
  yellowBg: '#1C1600',
  yellowBd: '#4A3A00',
  // Status — desaturated, operator-grade
  ok:       '#4d9966', okBg:   '#0a180e', okBd:   '#183d22',
  warn:     '#a88630', warnBg: '#1a1200', warnBd: '#3d2800',
  crit:     '#a63030', critBg: '#1c0808', critBd: '#3d1010',
  // Categorical event-type hues (fixed order, distinct from status)
  evTool:    '#4a7fa5', evToolBg:    '#080f17', evToolBd:    '#142840',
  evFlagged: '#c97c30', evFlaggedBg: '#1e1000', evFlaggedBd: '#4a2800',
  evPaid:    '#5a9a6a', evPaidBg:    '#0a180e', evPaidBd:    '#183d22',
  evFlagAct: '#8a6ab8', evFlagActBg: '#100820', evFlagActBd: '#2d1a54',
  evSim:     '#5a5a5a', evSimBg:     '#141414', evSimBd:     '#2a2a2a',
  // Typography
  fontBody:      "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
  fontTactical:  "'Chakra Petch', 'Inter Tight', sans-serif",
  fontCondensed: "'IBM Plex Sans Condensed', 'Inter Tight', sans-serif",
  fontMono:      "'Chakra Petch', ui-monospace, monospace",
};

export const EVT_PALETTE = {
  TOOL_CALL:         { fg: P.evTool,    bg: P.evToolBg,    bd: P.evToolBd,    label: 'TOOL' },
  FLAGGED_TOOL_CALL: { fg: P.evFlagged, bg: P.evFlaggedBg, bd: P.evFlaggedBd, label: 'FLAGGED' },
  TOOL_CALL_PAID:    { fg: P.evPaid,    bg: P.evPaidBg,    bd: P.evPaidBd,    label: 'PAID' },
  FLAG_ACTION:       { fg: P.evFlagAct, bg: P.evFlagActBg, bd: P.evFlagActBd, label: 'FLAG ACT' },
  DEMO_SIM:          { fg: P.evSim,     bg: P.evSimBg,     bd: P.evSimBd,     label: 'SIM' },
};

export function evtStyle(type) {
  return EVT_PALETTE[type] || EVT_PALETTE.DEMO_SIM;
}

export function statusStyle(level) {
  if (level === 'LOW')      return { fg: P.ok,   bg: P.okBg,   bd: P.okBd };
  if (level === 'HIGH')     return { fg: P.warn,  bg: P.warnBg, bd: P.warnBd };
  if (level === 'CRITICAL') return { fg: P.crit,  bg: P.critBg, bd: P.critBd };
  return { fg: P.muted, bg: P.surf2, bd: P.border };
}
