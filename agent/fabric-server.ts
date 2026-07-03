// Kage Fabric MCP server — the multi-tenant, DB-driven endpoint.
//
//   bun run agent/fabric-server.ts         # http://localhost:8403/mcp (Streamable HTTP)
//
// Difference from agent/mcp-server.ts (the single-agent demo): this one builds its
// tool surface from the live catalog (published APIs + workflows) and scopes every
// call to the bearer token's SessionAccount. It's the four pieces wired together:
//
//   1. proxy-tool factory  → each published API becomes an x402-metered `api__*` tool
//   2. workflow engine      → each published flow becomes a `wf__*` tool
//   3. on-chain ZK step     → workflows settle privately through the scoped SessionAccount
//   4. auth                 → Bearer <token> selects which agent/session the call runs as
//
// The chain still enforces spend (SessionAccount.__check_auth); auth here only routes.
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildFabricServer, registerCatalog } from "./fabric/register.ts";
import { resolveScope, withScope } from "./fabric/auth.ts";
import { findWorkflow, findApi } from "./fabric/catalog.ts";
import { runWorkflow } from "./fabric/engine.ts";
import { proxyCall } from "./fabric/proxy-tool.ts";
import { provisionSession } from "./fabric/provision.ts";
import { config } from "../sdk/kage-onchain.ts";

// Dedicated port env — must NOT reuse VEIL_MCP_PORT (that's the single-agent demo's
// port; sharing the name collides with veil-mcp when both read the same .env).
const PORT = Number(process.env.KAGE_FABRIC_PORT ?? 8403);

// One persistent server + transport for the process (stateless Streamable HTTP).
const { server, registered } = await buildFabricServer(McpServer);
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await server.connect(transport);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  let cfg: ReturnType<typeof config> | null = null;
  try {
    cfg = config();
  } catch {}
  res.json({ ok: true, pool: cfg?.VEIL ?? null, tools: registered });
});

// Rebuild the tool surface from the catalog after an owner publishes something new.
app.post("/reload", async (_req, res) => {
  const r = await registerCatalog(server);
  res.json({ ok: true, reloaded: r });
});

// REST run surface — lets the dashboard (and any plain HTTP caller) execute a
// workflow or test an API without speaking MCP. Same scope routing as /mcp: the
// bearer token selects which SessionAccount the on-chain step signs through.
app.post("/run/workflow", async (req, res) => {
  const scope = resolveScope(req.header("authorization"));
  const { slug, input } = (req.body ?? {}) as { slug?: string; input?: Record<string, unknown> };
  if (!slug) return res.status(400).json({ ok: false, error: "slug required" });
  const wf = await findWorkflow(slug);
  if (!wf) return res.status(404).json({ ok: false, error: `no workflow '${slug}'` });
  try {
    const run = await withScope(scope, () => runWorkflow(wf, input ?? {}));
    res.json({ ok: true, run });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// Provision a per-user scoped SessionAccount for a generated wallet. Deploys + inits +
// funds a real SessionAccount and returns a personal bearer token to settle through it.
app.post("/provision", async (req, res) => {
  const { ownerAddress, ownerSecret, amount, cap } = (req.body ?? {}) as { ownerAddress?: string; ownerSecret?: string; amount?: string; cap?: string };
  if (!ownerAddress || !ownerSecret) return res.status(400).json({ ok: false, error: "ownerAddress and ownerSecret required" });
  try {
    const r = await provisionSession(ownerAddress, ownerSecret, amount, cap);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.post("/run/api", async (req, res) => {
  const { slug, args } = (req.body ?? {}) as { slug?: string; args?: Record<string, unknown> };
  if (!slug) return res.status(400).json({ ok: false, error: "slug required" });
  const api = await findApi(slug);
  if (!api) return res.status(404).json({ ok: false, error: `no api '${slug}'` });
  try {
    const out = await proxyCall(api, args ?? {});
    res.json({ ok: true, status: out.status, body: out.body });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// Every MCP call runs inside the resolved agent scope so the on-chain step signs
// with that agent's session key. No token → the process default session.
app.post("/mcp", async (req, res) => {
  const scope = resolveScope(req.header("authorization"));
  await withScope(scope, () => transport.handleRequest(req, res, req.body));
});

// stdio transport for local/agent-subprocess use (mirrors mcp-server.ts).
if (process.argv.includes("--stdio")) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const stdioServer = (await buildFabricServer(McpServer)).server;
  await stdioServer.connect(new StdioServerTransport());
  console.error(`Kage fabric MCP (stdio) ready · ${registered.apis.length} APIs · ${registered.workflows.length} workflows`);
} else {
  app.listen(PORT, () => {
    console.error(`Kage fabric MCP on http://localhost:${PORT}/mcp  (health: /health, reload: POST /reload)`);
    console.error(`  tools: ${registered.apis.length} api__*, ${registered.workflows.length} wf__* + builtins`);
    try {
      const c = config();
      console.error(`  pool ${c.VEIL}  default session ${c.session ?? "(none — provision one in the dashboard)"}`);
    } catch {
      console.error("  no deployment yet — run scripts/kage-deploy.ts + provision a session");
    }
  });
}
