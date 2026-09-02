import { useState } from 'react';
import { useBackendState } from './hooks/useBackendState.js';
import StatusBar      from './components/StatusBar.jsx';
import EventStream    from './components/EventStream.jsx';
import MerkleHierarchy from './components/MerkleHierarchy.jsx';
import AnchorStatus   from './components/AnchorStatus.jsx';
import SessionLedger  from './components/SessionLedger.jsx';
import FlaggedTools   from './components/FlaggedTools.jsx';
import DemoRunner     from './components/DemoRunner.jsx';
import { P } from './palette.js';

export default function App() {
  const { loggerState, sessions, flaggedTools, mcpTools, health,
          refetchGateway } = useBackendState();
  const [, setDemoSession] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh',
      background: P.bg, color: P.text, overflow: 'hidden' }}>

      <StatusBar
        health={health}
        loggerState={loggerState}
        sessions={sessions}
        mcpTools={mcpTools}
      />

      {/* Main 3-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 340px',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Left: Merkle + Anchor */}
        <div className="cs-panel">
          <MerkleHierarchy loggerState={loggerState} />
          <AnchorStatus    loggerState={loggerState} />
        </div>

        {/* Center: Event Stream */}
        <div className="cs-panel" style={{ borderRight: `1px solid ${P.border}` }}>
          <EventStream loggerState={loggerState} />
        </div>

        {/* Right: Session Ledger + Flagged Tools */}
        <div className="cs-panel">
          <SessionLedger sessions={sessions} />
          <div style={{ height: 1, background: P.border, margin: '4px 0' }} />
          <FlaggedTools
            mcpTools={mcpTools}
            flaggedTools={flaggedTools}
            onRefetch={refetchGateway}
          />
        </div>
      </div>

      {/* Bottom: Demo Runner */}
      <div style={{
        borderTop: `1px solid ${P.border}`,
        background: P.surf2,
        padding: '10px 16px',
        overflowY: 'auto',
        maxHeight: '38vh',
        flexShrink: 0,
      }}>
        <DemoRunner onSessionCreated={sid => {
          setDemoSession(sid);
          setTimeout(refetchGateway, 4000);
        }} />
      </div>
    </div>
  );
}
