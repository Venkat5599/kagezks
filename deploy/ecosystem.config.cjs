// pm2 process config for the Veil VPS deployment.
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup   # survive reboots
//
// Two long-lived processes:
//   veil-web  — the Next app (landing + /agent + /dashboard), port 3000
//   veil-mcp  — the MCP server agents connect to (Streamable HTTP), port 8402
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
      env: { NODE_ENV: "production", PORT: "3000" },
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
  ],
};
