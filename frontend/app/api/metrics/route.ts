// Public growth metrics: distinct wallets onboarded, on-chain actions they took,
// and the feedback aggregate. This is the endpoint behind /metrics.
//
// Every number here is a COUNT over rows written by real usage — there is no
// seeded or synthetic data path. If the tables are empty the page shows zeroes,
// which is the honest answer.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserAgg = { total: number; freighter: number; generated: number; with_tx: number };
type TxRow = { action: string; tx_hash: string | null; created_at: string };

export async function GET() {
  try {
    // Neon's tagged template returns a loosely-typed row array, so each result is
    // cast after the await — the same shape the other routes in this app use.
    const [usersRows, txTotalRows, recentRows, fbRows] = await Promise.all([
      sql`
        SELECT COUNT(*)::int                                          AS total,
               COUNT(*) FILTER (WHERE wallet_kind = 'freighter')::int AS freighter,
               COUNT(*) FILTER (WHERE wallet_kind = 'generated')::int AS generated,
               COUNT(*) FILTER (WHERE tx_count > 0)::int              AS with_tx
        FROM users
      `,
      sql`SELECT COUNT(*)::int AS c FROM user_txs`,
      sql`
        SELECT action, tx_hash, created_at
        FROM user_txs
        WHERE tx_hash IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
      `,
      sql`
        SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS average
        FROM feedback
      `,
    ]);

    const users = usersRows as UserAgg[];
    const txTotal = txTotalRows as Array<{ c: number }>;
    const recent = recentRows as TxRow[];
    const fb = fbRows as Array<{ count: number; average: number }>;

    const u = users[0] ?? { total: 0, freighter: 0, generated: 0, with_tx: 0 };

    return Response.json({
      ok: true,
      users: {
        total: u.total,
        freighter: u.freighter,
        generated: u.generated,
        withTx: u.with_tx,
      },
      txs: { total: txTotal[0]?.c ?? 0, recent },
      feedback: {
        count: fb[0]?.count ?? 0,
        average: Math.round((fb[0]?.average ?? 0) * 10) / 10,
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
