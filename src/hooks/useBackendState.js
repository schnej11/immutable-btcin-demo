import { useState, useEffect } from 'react';

export const LOGGER  = 'http://localhost:3002';
export const GATEWAY = 'http://localhost:3003';
export const MCP     = 'http://localhost:3004';

async function safeFetch(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export function useBackendState() {
  const [loggerState, setLoggerState]   = useState(null);
  const [sessions, setSessions]         = useState([]);
  const [flaggedTools, setFlaggedTools] = useState([]);
  const [mcpTools, setMcpTools]         = useState([]);
  const [health, setHealth]             = useState({ logger: false, gateway: false, mcp: false });

  useEffect(() => {
    let alive = true;

    async function pollLogger() {
      const data = await safeFetch(`${LOGGER}/state`);
      const hok  = await safeFetch(`${LOGGER}/health`);
      if (!alive) return;
      if (data) setLoggerState(data);
      setHealth(h => ({ ...h, logger: !!hok }));
    }

    async function pollGateway() {
      const [s, f, hok] = await Promise.all([
        safeFetch(`${GATEWAY}/sessions`),
        safeFetch(`${GATEWAY}/flagged-tools`),
        safeFetch(`${GATEWAY}/health`),
      ]);
      if (!alive) return;
      if (s) setSessions(s);
      if (f) setFlaggedTools(f.flagged || []);
      setHealth(h => ({ ...h, gateway: !!hok }));
    }

    async function pollMcp() {
      const tools = await safeFetch(`${MCP}/tools`);
      if (!alive) return;
      if (tools) setMcpTools(tools);
      setHealth(h => ({ ...h, mcp: !!tools }));
    }

    pollLogger();
    pollGateway();
    pollMcp();

    const li = setInterval(pollLogger,  1000);
    const gi = setInterval(pollGateway, 2000);
    const mi = setInterval(pollMcp,    30000);
    return () => { alive = false; clearInterval(li); clearInterval(gi); clearInterval(mi); };
  }, []);

  async function refetchGateway() {
    const [s, f] = await Promise.all([
      safeFetch(`${GATEWAY}/sessions`),
      safeFetch(`${GATEWAY}/flagged-tools`),
    ]);
    if (s) setSessions(s);
    if (f) setFlaggedTools(f.flagged || []);
  }

  async function refetchMcp() {
    const tools = await safeFetch(`${MCP}/tools`);
    if (tools) setMcpTools(tools);
  }

  return { loggerState, sessions, flaggedTools, mcpTools, health, refetchGateway, refetchMcp };
}
