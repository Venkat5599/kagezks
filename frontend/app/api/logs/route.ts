// Per-request metering log. The fabric POSTs one row per proxied API call (paid or
// not); the dashboard GETs them with a period filter. Real call history — the
// dashboard request-log feed.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Optional shared secret so only the fabric can write logs. If KAGE_LOG_TOKEN is
// unset (local dev), writes are accepted openly.
const LOG_TOKEN = process.env.KAGE_LOG_TOKEN;

const WINDOWS: Record<string, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period") ?? "7d";
  try {
    const rows =
      period === "all"
        ? await sql`SELECT * FROM request_logs ORDER BY created_at DESC LIMIT 100`
        : await sql`SELECT * FROM request_logs WHERE created_at > now() - (${WINDOWS[period] ?? "7 days"})::interval ORDER BY created_at DESC LIMIT 100`;
    const agg = await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ok)::int AS ok,
             COUNT(*) FILTER (WHERE paid)::int AS paid,
             COALESCE(SUM(price) FILTER (WHERE paid), 0)::float AS revenue
      FROM request_logs
      ${period === "all" ? sql`` : sql`WHERE created_at > now() - (${WINDOWS[period] ?? "7 days"})::interval`}`;
    return Response.json({ ok: true, logs: rows, stats: (agg as unknown[])[0] });
  } catch (e) {
    return Response.json({ ok: false, logs: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (LOG_TOKEN && req.headers.get("x-log-token") !== LOG_TOKEN) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const b = await req.json();
    await sql`
      INSERT INTO request_logs (api_slug, api_name, kind, status, ok, paid, price)
      VALUES (${b.api_slug ?? null}, ${b.api_name ?? null}, ${b.kind ?? "api"},
        ${b.status ?? null}, ${Boolean(b.ok)}, ${Boolean(b.paid)}, ${Number(b.price ?? 0)})`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
