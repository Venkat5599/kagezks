// pm2 process config for the Veil VPS deployment.
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup   # survive reboots
//
// Three long-lived processes:
//   veil-web     — the Next app (landing + /agent + /dashboard), port 3000
//   veil-mcp     — single-agent demo MCP server (Streamable HTTP), port 8402
//   kage-fabric  — multi-tenant fabric MCP (DB-driven api__*/wf__* tools), port 8403
//
// Secrets come from the environment / .env files, NEVER hardcoded here:
//   frontend/.env.local  -> DATABASE_URL   (Neon)
//   deploy/.env          -> VEIL_FEE_SECRET, VEIL_OPERATOR, ANTHROPIC_API_KEY, ...
// Load deploy/.env into your shell before `pm2 start` (e.g. `set -a; . deploy/.env; set +a`).
const path = require("node:path");
const ROOT = path.join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "veil-web",
      cwd: path.join(ROOT, "frontend"),
      // Build once (npm run build) before starting; this runs the production server.
      script: "npm",
      args: "start",
      // KAGE_FABRIC_URL lets the dashboard's /api/fabric/run proxy reach the Bun
      // fabric server (which does the real ZK execution) on the loopback.
      env: { NODE_ENV: "production", PORT: "3000", KAGE_FABRIC_URL: process.env.KAGE_FABRIC_URL || "http://localhost:8403" },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
    {
      name: "veil-mcp",
      cwd: ROOT,
      // Bun runs the MCP server. Requires VEIL_FEE_SECRET in the environment.
      script: "bun",
      args: "run agent/mcp-server.ts",
      env: {
        VEIL_MCP_PORT: process.env.VEIL_MCP_PORT || "8402",
        VEIL_FEE_SECRET: process.env.VEIL_FEE_SECRET || "",
        VEIL_OPERATOR: process.env.VEIL_OPERATOR || "",
        VEIL_RPC_URL: process.env.VEIL_RPC_URL || "https://soroban-testnet.stellar.org",
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
    {
      name: "kage-fabric",
      cwd: ROOT,
      // Bun runs the multi-tenant fabric MCP. Needs snarkjs subprocess for ZK proofs,
      // so it MUST run under bun on the VPS — the Next /mcp/[slug] route can't.
      script: "bun",
      args: "run agent/fabric-server.ts",
      env: {
        KAGE_FABRIC_PORT: process.env.KAGE_FABRIC_PORT || "8403",
        // Catalog source: the local web app (so published APIs/workflows appear as tools).
        KAGE_ORIGIN: process.env.KAGE_ORIGIN || "http://localhost:3000",
        VEIL_FEE_SECRET: process.env.VEIL_FEE_SECRET || "",
        VEIL_OPERATOR: process.env.VEIL_OPERATOR || "",
        VEIL_RPC_URL: process.env.VEIL_RPC_URL || "https://soroban-testnet.stellar.org",
        // Optional inline token->session map; otherwise sdk/build/agent_keys.json is read.
        KAGE_AGENT_KEYS: process.env.KAGE_AGENT_KEYS || "",
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
