// Update an MCP server's exposed tools / workflows (post-create management, like
// the Available Tools + Workflow Tools sections on the detail page).
import { sql, type McpServerRow } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const rows = (await sql`SELECT * FROM mcp_servers WHERE slug = ${slug} LIMIT 1`) as McpServerRow[];
    if (!rows[0]) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true, server: rows[0] });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const b = (await req.json()) as { tools?: unknown[]; workflows?: unknown[]; display_name?: string; description?: string; is_public?: boolean };
    // COALESCE: only overwrite fields that were actually sent (slug is immutable).
    const toolsJson = b.tools !== undefined ? JSON.stringify(b.tools) : null;
    const wfJson = b.workflows !== undefined ? JSON.stringify(b.workflows) : null;
    const rows = (await sql`
      UPDATE mcp_servers
      SET tools = COALESCE(${toolsJson}::jsonb, tools),
          workflows = COALESCE(${wfJson}::jsonb, workflows),
          display_name = COALESCE(${b.display_name ?? null}, display_name),
          description = COALESCE(${b.description ?? null}, description),
          is_public = COALESCE(${b.is_public ?? null}, is_public)
      WHERE slug = ${slug}
      RETURNING *`) as McpServerRow[];
    if (!rows[0]) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true, server: rows[0] });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
