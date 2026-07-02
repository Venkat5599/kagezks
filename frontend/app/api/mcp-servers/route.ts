// MCP servers — list + create, persisted in Neon.
import { sql, type McpServerRow } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rows = (await sql`SELECT * FROM mcp_servers ORDER BY created_at DESC`) as McpServerRow[];
    return Response.json({ ok: true, servers: rows });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.display_name) return Response.json({ ok: false, error: "display_name is required" }, { status: 400 });
    const slug = String(b.slug || b.display_name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
