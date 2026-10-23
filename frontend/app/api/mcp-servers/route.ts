// MCP servers — list + create, persisted in Neon.
import { sql, type McpServerRow } from "@/lib/db";
import { findBuiltinMcp } from "@/lib/builtin-catalog";
import { builtinMcpRowsFull as builtinMcpRows } from "@/lib/builtin-workflows";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  const scope = url.searchParams.get("scope");
  const builtins = builtinMcpRows(); // visible to every user
  try {
    const rows = (scope === "public"
      ? await sql`SELECT * FROM mcp_servers WHERE is_public = true ORDER BY created_at DESC`
      : owner
        ? await sql`SELECT * FROM mcp_servers WHERE owner_address = ${owner} ORDER BY created_at DESC`
        : await sql`SELECT * FROM mcp_servers ORDER BY created_at DESC`) as McpServerRow[];
    return Response.json({ ok: true, servers: [...builtins, ...rows] });
  } catch (e) {
    return Response.json({ ok: builtins.length > 0, servers: builtins, error: String(e) }, { status: builtins.length > 0 ? 200 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.display_name) return Response.json({ ok: false, error: "display_name is required" }, { status: 400 });
    const slug = String(b.slug || b.display_name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (findBuiltinMcp(slug)) return Response.json({ ok: false, error: "slug is reserved by a built-in server" }, { status: 409 });
    const rows = (await sql`
      INSERT INTO mcp_servers (slug, display_name, description, is_public, tools, workflows, owner_address)
      VALUES (${slug}, ${b.display_name}, ${b.description ?? null}, ${Boolean(b.is_public)},
        ${JSON.stringify(b.tools ?? [])}::jsonb, ${JSON.stringify(b.workflows ?? [])}::jsonb, ${b.owner_address ?? null})
      RETURNING *
    `) as McpServerRow[];
    return Response.json({ ok: true, server: rows[0] });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("duplicate key")) return Response.json({ ok: false, error: "slug already exists" }, { status: 409 });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
