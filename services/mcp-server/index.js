// CyberSeal — Demo MCP Tool Server (port 3004)
//
// Exposes three "sensitive" tools that the gateway intercepts.
// In a real deployment this would be an actual MCP server wrapping
// real system tools. For the POC, each handler returns plausible
// (but entirely fake) data so the three-act demo is self-contained.

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const express = require("express");
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = {
  // Benign — passes through the gateway without a toll
  list_files: {
    risk: "LOW",
    description: "List files in a directory",
    handler: ({ path = "/ops" }) => ({
      path,
      files: [
        "logistics_manifest_v3.docx",
        "ops_memo_final.docx",
        "intel_brief.pdf",
        "mission_plan_alpha.docx",
        "supply_chain_data.csv",
      ],
    }),
  },

  // HIGH — flagged, requires toll payment before execution
  read_credentials: {
    risk: "HIGH",
    description: "Read credentials from the system credential store",
    handler: ({ target = "default" }) => ({
      target,
      credentials: {
        username:  "svc-nipr-ops",
        token:     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[REDACTED]",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      warning: "These credentials are for authorized use only.",
    }),
  },

  // HIGH — flagged
  write_external: {
    risk: "HIGH",
    description: "Write data to an external endpoint",
    handler: ({ endpoint = "https://sink.example.mil", data = {} }) => ({
      endpoint,
      bytesWritten: JSON.stringify(data).length,
      status:       "accepted",
      requestId:    `req-${Date.now()}`,
    }),
  },

  // CRITICAL — flagged; simulates T1070 (indicator removal)
  delete_log_entry: {
    risk: "CRITICAL",
    description: "Delete a specific audit log entry by ID (T1070 — Indicator Removal)",
    handler: ({ eventId = 0 }) => ({
      eventId,
      deleted: true,
      message: "Log entry removed from local store.",
      // NOTE: the CyberSeal logger is isolated — this tool call is already
      // recorded there and cannot be retracted by this tool's execution.
    }),
  },
};

// GET /tools — tool discovery
app.get("/tools", (req, res) => {
  res.json(
    Object.entries(TOOLS).map(([name, t]) => ({
      name,
      description: t.description,
      risk:        t.risk,
    }))
  );
});

// POST /call — execute a tool
app.post("/call", (req, res) => {
  const { tool, args = {} } = req.body;
  if (!TOOLS[tool]) {
    return res.status(404).json({ error: `Unknown tool: ${tool}` });
  }
  try {
    const result = TOOLS[tool].handler(args);
    console.log(`[MCP] Executed: ${tool} (risk: ${TOOLS[tool].risk})`);
    res.json({ tool, risk: TOOLS[tool].risk, result, executedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.MCP_PORT || 3004;
app.listen(PORT, () => {
  console.log(`[MCP Server] Demo MCP server running on http://localhost:${PORT}`);
  console.log(`[MCP Server] Tools: ${Object.keys(TOOLS).join(", ")}`);
});
