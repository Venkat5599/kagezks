// In-app feedback capture. The fields mirror the Google Form one-for-one, so
// in-app responses and form responses merge into a single spreadsheet without
// remapping columns.
//
// GET returns the aggregate (average rating + count) for the public /metrics
// page. It deliberately does not return raw responses — free-text answers can
// carry an email, and those belong in the private export, not a public endpoint.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isStellarAddress = (s: unknown): s is string =>
  typeof s === "string" && /^G[A-Z2-7]{55}$/.test(s);

// Free-text answers are capped rather than rejected: a long answer is still a
// useful answer, and truncating beats dropping it on the floor.
const text = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ ok: false, error: "rating must be an integer 1-5" }, { status: 400 });
  }

  const address = isStellarAddress(body.address) ? body.address : null;

  try {
    await sql`
      INSERT INTO feedback (address, rating, most_useful, friction, wanted, email)
      VALUES (
        ${address},
        ${rating},
        ${text(body.mostUseful)},
        ${text(body.friction)},
        ${text(body.wanted)},
        ${text(body.email, 320)}
      )
    `;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS average
      FROM feedback
    `) as Array<{ count: number; average: number }>;
    return Response.json({
      ok: true,
      count: rows[0]?.count ?? 0,
      average: Math.round((rows[0]?.average ?? 0) * 10) / 10,
    });
  } catch (e) {
    return Response.json({ ok: false, count: 0, average: 0, error: String(e) }, { status: 500 });
  }
}
