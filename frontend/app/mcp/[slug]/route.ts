// Live MCP endpoint for any created server: https://kageai.me/mcp/<slug>
//
// This makes every MCP server in the marketplace a REAL endpoint that any
// MCP-capable agent (Claude Code, Claude Desktop, Codex, custom) can connect to
// over Streamable HTTP. The server row (from Neon) declares its tools; we expose
// them and back the built-in Kage tools with live on-chain reads + the agent-pay
// path. Unknown/custom tools return their declared shape so discovery still works.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { sql, type McpServerRow } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ORIGIN = process.env.KAGE_ORIGIN || "http://localhost:3000";
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

async function loadServer(slug: string): Promise<McpServerRow | null> {
  try {
    const rows = (await sql`SELECT * FROM mcp_servers WHERE slug = ${slug} LIMIT 1`) as McpServerRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Build the MCP server for a given catalog row. Built-in Kage tools are wired to
// live behavior; any other declared tool name is registered as a descriptor tool
// so agents can still discover it.
function buildServer(row: McpServerRow): McpServer {
  const server = new McpServer({ name: row.slug ?? "kage", version: "0.1.0" });
  const tools = (row.tools ?? []).map(String);

  const KNOWN: Record<string, () => void> = {
    veil_pool_status: () =>
      server.registerTool(
        "veil_pool_status",
        { title: "Pool status", description: "Live Kage shielded-pool state (root, leaf count, USDC pooled).", inputSchema: {} },
        async () => json(await (await fetch(`${ORIGIN}/api/veil`, { cache: "no-store" })).json()),
      ),
    veil_budget: () =>
      server.registerTool(
        "veil_budget",
        { title: "Agent budget", description: "Remaining scoped spend cap on the agent's SessionAccount.", inputSchema: {} },
        async () => {
          const s = await (await fetch(`${ORIGIN}/api/agent/status`, { cache: "no-store" })).json();
          return json({ remaining: s.remaining, cap: s.cap, spent: s.spent, expiry: s.expiry });
        },
      ),
    veil_quote: () =>
      server.registerTool(
        "veil_quote",
        { title: "Quote a private payment", description: "x402 price + readiness for a veil_pay call.", inputSchema: { amount: z.string() } },
        async ({ amount }) => json({ callPrice: { amount: "100000", scheme: "stellar-native" }, payAmount: amount, note: "pay the x402 fee, then call veil_pay" }),
      ),
    veil_pay: () =>
      server.registerTool(
        "veil_pay",
        {
          title: "Pay privately (ZK, scoped key)",
          description: "Make a ZK-private USDC payment through the SessionAccount. Runs the pay-if-budget flow.",
          inputSchema: { recipientScanKey: z.string(), amount: z.string() },
        },
        async ({ amount }) => {
          const r = await fetch(`${ORIGIN}/api/agent/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          });
          return json(await r.json());
        },
      ),
    workflow_list: () =>
      server.registerTool(
        "workflow_list",
        { title: "List workflows", description: "Reusable Kage workflows.", inputSchema: {} },
        async () => {
          const d = await (await fetch(`${ORIGIN}/api/workflows`, { cache: "no-store" })).json();
          return json((d.workflows ?? []).map((w: { name: string; slug: string; description: string }) => ({ name: w.slug, title: w.name, description: w.description })));
        },
      ),
    workflow_run: () =>
      server.registerTool(
        "workflow_run",
        { title: "Run a workflow", description: "Run a named workflow (flagship: pay-if-budget).", inputSchema: { name: z.string(), amount: z.string().optional() } },
        async ({ amount }) => {
          const r = await fetch(`${ORIGIN}/api/agent/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: amount ?? "5000000" }) });
          return json(await r.json());
        },
      ),
  };

  let registered = 0;
  for (const t of tools) {
    if (KNOWN[t]) {
      KNOWN[t]();
      registered++;
    } else {
      // Custom/declared tool — expose a descriptor so agents can discover it.
      server.registerTool(
        t,
        { title: t, description: `Declared tool "${t}" on ${row.display_name}. Configure a handler to make it executable.`, inputSchema: {} },
        async () => json({ tool: t, status: "declared", note: "This tool is listed but has no server-side handler yet." }),
      );
      registered++;
    }
  }

  // Always give agents at least a status tool so an empty server is still usable.
  if (registered === 0) {
    server.registerTool("server_info", { title: "Server info", description: `${row.display_name} — ${row.description ?? ""}`, inputSchema: {} }, async () =>
      json({ name: row.display_name, slug: row.slug, tools: [], workflows: row.workflows }),
    );
  }
  return server;
}

async function handle(req: Request, slug: string): Promise<Response> {
  const row = await loadServer(slug);
  if (!row) return new Response(JSON.stringify({ error: `no MCP server '${slug}'` }), { status: 404, headers: { "content-type": "application/json" } });
  const server = buildServer(row);
  // Stateless: omit sessionIdGenerator entirely (exactOptionalPropertyTypes).
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
