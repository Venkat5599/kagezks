// Recent fabric activity for the dashboard — the newest published APIs, workflows,
// and MCP servers, unioned and sorted by creation time. Real rows from Neon (no
// synthetic data); the dashboard renders them as an activity feed.
import { sql } from "@/lib/db";
import { rateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Activity = { kind: "api" | "workflow" | "mcp"; name: string; slug: string | null; created_at: string };

export async function GET(req: Request) {
  const limitResult = rateLimit(req, RATE_LIMITS.api, "activity");
  if (!limitResult.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...rateLimitHeaders(limitResult) },
    });
  }
  try {
    const rows = (await sql`
      SELECT 'api' AS kind, name, slug, created_at FROM apis
      UNION ALL SELECT 'workflow' AS kind, name, slug, created_at FROM workflows
      UNION ALL SELECT 'mcp' AS kind, display_name AS name, slug, created_at FROM mcp_servers
      ORDER BY created_at DESC
      LIMIT 12
    `) as Activity[];
    return Response.json({ ok: true, activity: rows }, { headers: rateLimitHeaders(limitResult) });
  } catch (e) {
    return Response.json({ ok: false, activity: [], error: String(e) }, { status: 500 });
  }
}
