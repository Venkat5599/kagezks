// Live MCP endpoint for any created server: https://kageai.me/mcp/<slug>
//
// This is the URL you get after creating an MCP server — and it EXECUTES, not just
// describes. Any MCP-capable agent (Claude Code, Claude Desktop, Codex) connects over
// Streamable HTTP with a Bearer token; read tools return live on-chain state, and the
// settle tools (kage_pay, wf__*, api__*) proxy to the Kage fabric, which builds the
// real Groth16 proof and settles ZK-private through the scoped SessionAccount. The
// bearer is forwarded to the fabric so the call runs as that agent's session — no
// token means read-only (it can't move funds), matching the scoped-key model.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { sql, type McpServerRow } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ORIGIN = process.env.KAGE_ORIGIN || "http://localhost:3000";
const FABRIC = (process.env.KAGE_FABRIC_URL || "http://localhost:8403").replace(/\/$/, "");
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

type WfRow = { slug: string | null; name: string; description: string | null; input_variables?: { name: string; required?: boolean; description?: string }[] };

async function loadServer(slug: string): Promise<McpServerRow | null> {
  try {
    const rows = (await sql`SELECT * FROM mcp_servers WHERE slug = ${slug} LIMIT 1`) as McpServerRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function loadWorkflows(): Promise<WfRow[]> {
  try {
    const rows = (await sql`SELECT slug, name, description, input_variables FROM workflows`) as WfRow[];
    return rows;
  } catch {
    return [];
  }
}

// Build the MCP server for a row. `auth` is the caller's Authorization header, forwarded
// to the fabric so settle tools run under that agent's scoped session.
function buildServer(row: McpServerRow, auth: string | null, workflows: WfRow[]): McpServer {
  const server = new McpServer({ name: row.slug ?? "kage", version: "0.2.0" });
  const tools = (row.tools ?? []).map(String);
  const wfSlugs = (row.workflows ?? []).map(String);

  // Server → fabric execution (real ZK). Forwards the bearer for scoped settlement.
  const runFabric = async (path: string, body: unknown) => {
    const r = await fetch(`${FABRIC}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const KNOWN: Record<string, () => void> = {
    kage_pool_status: () =>
      server.registerTool("kage_pool_status", { title: "Pool status", description: "Live Kage shielded-pool state (root, leaf count, USDC pooled).", inputSchema: {} },
        async () => json(await (await fetch(`${ORIGIN}/api/veil`, { cache: "no-store" })).json())),
    kage_budget: () =>
      server.registerTool("kage_budget", { title: "Agent budget", description: "Remaining scoped spend cap on the agent's SessionAccount.", inputSchema: {} },
        async () => { const s = await (await fetch(`${ORIGIN}/api/agent/status`, { cache: "no-store" })).json(); return json({ remaining: s.remaining, cap: s.cap, spent: s.spent, expiry: s.expiry }); }),
    kage_quote: () =>
      server.registerTool("kage_quote", { title: "Quote a private payment", description: "x402 price + readiness for a kage_pay call.", inputSchema: { amount: z.string() } },
        async ({ amount }) => json({ callPrice: { amount: "100000", scheme: "stellar-native" }, payAmount: amount, note: "then call kage_pay" })),
    kage_pay: () =>
      server.registerTool("kage_pay",
        { title: "Pay privately (ZK, scoped key)", description: "Make a ZK-private USDC payment through the SessionAccount. Real on-chain settlement — requires a Bearer token for the scoped session.", inputSchema: { recipientScanKey: z.string(), amount: z.string() } },
        async ({ recipientScanKey, amount }) => json(await runFabric("/run/workflow", { slug: "pay-if-budget-demo", input: { recipientScanKey, amount } }))),
    workflow_list: () =>
      server.registerTool("workflow_list", { title: "List workflows", description: "Reusable Kage workflows.", inputSchema: {} },
        async () => json(workflows.map((w) => ({ name: w.slug, title: w.name, description: w.description })))),
    workflow_run: () =>
      server.registerTool("workflow_run",
        { title: "Run a workflow", description: "Run a named workflow — executes on the fabric (ends in a ZK settle).", inputSchema: { name: z.string(), recipientScanKey: z.string().optional(), amount: z.string().optional() } },
        async ({ name, recipientScanKey, amount }) => json(await runFabric("/run/workflow", { slug: name, input: { recipientScanKey, amount } }))),
  };

  let registered = 0;
  for (const t of tools) {
    if (KNOWN[t]) { KNOWN[t](); registered++; continue; }
    // Declared api__<slug> → executable proxy tool via the fabric.
    if (t.startsWith("api__")) {
      const apiSlug = t.slice("api__".length);
      server.registerTool(t, { title: t, description: `Call the ${apiSlug} API (x402-metered, proxied through the fabric).`, inputSchema: { args: z.record(z.string(), z.any()).optional() } },
        async ({ args }) => json(await runFabric("/run/api", { slug: apiSlug, args: args ?? {} })));
      registered++; continue;
    }
    // Unknown/custom tool — descriptor only.
    server.registerTool(t, { title: t, description: `Declared tool "${t}" on ${row.display_name}.`, inputSchema: {} },
      async () => json({ tool: t, status: "declared" }));
    registered++;
  }

  // Declared workflows → executable wf__<slug> tools (typed from input_variables).
  for (const ws of wfSlugs) {
    const wf = workflows.find((w) => w.slug === ws);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const v of wf?.input_variables ?? []) shape[v.name] = v.required ? z.string() : z.string().optional();
    if (Object.keys(shape).length === 0) {
      shape.recipientScanKey = z.string().optional();
      shape.amount = z.string().optional();
    }
    server.registerTool(`wf__${ws}`, { title: wf?.name ?? ws, description: `${wf?.description ?? ws} — executes on the fabric (ZK settle).`, inputSchema: shape },
      async (input: Record<string, unknown>) => json(await runFabric("/run/workflow", { slug: ws, input })));
    registered++;
  }

  if (registered === 0) {
    server.registerTool("server_info", { title: "Server info", description: `${row.display_name} — ${row.description ?? ""}`, inputSchema: {} },
      async () => json({ name: row.display_name, slug: row.slug, tools: [], workflows: row.workflows }));
  }
  return server;
}

async function handle(req: Request, slug: string): Promise<Response> {
  const row = await loadServer(slug);
  if (!row) return new Response(JSON.stringify({ error: `no MCP server '${slug}'` }), { status: 404, headers: { "content-type": "application/json" } });
  const workflows = await loadWorkflows();
  const auth = req.headers.get("authorization");
  const server = buildServer(row, auth, workflows);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, slug);
}
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, slug);
}
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, slug);
}
