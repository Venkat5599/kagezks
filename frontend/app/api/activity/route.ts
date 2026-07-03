// Recent fabric activity for the dashboard — the newest published APIs, workflows,
// and MCP servers, unioned and sorted by creation time. Real rows from Neon (no
// synthetic data); the dashboard renders them as an activity feed.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Activity = { kind: "api" | "workflow" | "mcp"; name: string; slug: string | null; created_at: string };

export async function GET() {
  try {
    const rows = (await sql`
      SELECT 'api' AS kind, name, slug, created_at FROM apis
      UNION ALL SELECT 'workflow' AS kind, name, slug, created_at FROM workflows
      UNION ALL SELECT 'mcp' AS kind, display_name AS name, slug, created_at FROM mcp_servers
      ORDER BY created_at DESC
      LIMIT 12
    `) as Activity[];
    return Response.json({ ok: true, activity: rows });
  } catch (e) {
    return Response.json({ ok: false, activity: [], error: String(e) }, { status: 500 });
  }
}
