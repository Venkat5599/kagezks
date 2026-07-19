// Public growth page. Server-rendered per request so the numbers are current
// whenever anyone loads it — including a reviewer checking whether the counts
// in the README match what the database actually holds.
//
// Recent transactions link straight out to stellar.expert, so the claim
// "real wallets, real activity" is checkable without trusting this page.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Metrics — Kage",
  description: "Wallets onboarded, on-chain activity, and feedback for Kage on Stellar testnet.",
};

type UserAgg = { total: number; freighter: number; generated: number; with_tx: number };
type TxRow = { action: string; tx_hash: string; created_at: string };
type FbAgg = { count: number; average: number };

const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

async function load() {
  try {
    const [usersRows, txRows, recentRows, fbRows] = await Promise.all([
      sql`
        SELECT COUNT(*)::int                                          AS total,
               COUNT(*) FILTER (WHERE wallet_kind = 'freighter')::int AS freighter,
               COUNT(*) FILTER (WHERE wallet_kind = 'generated')::int AS generated,
               COUNT(*) FILTER (WHERE tx_count > 0)::int              AS with_tx
        FROM users
      `,
      sql`SELECT COUNT(*)::int AS c FROM user_txs`,
      sql`
        SELECT action, tx_hash, created_at FROM user_txs
        WHERE tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT 10
      `,
      sql`SELECT COUNT(*)::int AS count, COALESCE(AVG(rating),0)::float AS average FROM feedback`,
    ]);
    return {
      ok: true as const,
      users: (usersRows as UserAgg[])[0] ?? { total: 0, freighter: 0, generated: 0, with_tx: 0 },
      txTotal: (txRows as Array<{ c: number }>)[0]?.c ?? 0,
      recent: recentRows as TxRow[],
      feedback: (fbRows as FbAgg[])[0] ?? { count: 0, average: 0 },
    };
  } catch {
    // A database that is unreachable is reported as such rather than rendered
    // as a page full of zeroes, which would read as "no users".
    return { ok: false as const };
  }
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="border-t border-border pt-4">
      <div className="font-mono text-4xl tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function MetricsPage() {
  const data = await load();

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Metrics</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Every number is a count over rows written by real usage on Stellar testnet. Nothing here is
        seeded — an empty database reports zero.
      </p>

      {!data.ok ? (
        <p className="mt-12 border-t border-border pt-6 text-muted-foreground">
          Metrics are unavailable right now — the database could not be reached.
        </p>
      ) : (
        <>
          <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
            <Stat value={data.users.total} label="Wallets onboarded" />
            <Stat value={data.users.with_tx} label="Wallets that transacted" />
            <Stat value={data.txTotal} label="On-chain actions" />
            <Stat
              value={data.feedback.count > 0 ? `${data.feedback.average}/5` : "—"}
              label={`Rating (${data.feedback.count} responses)`}
            />
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            {data.users.freighter} connected an existing Freighter wallet; {data.users.generated}{" "}
            generated one in the browser.
          </p>

          <section className="mt-16">
            <h2 className="text-lg font-semibold text-foreground">Recent on-chain activity</h2>
            {data.recent.length === 0 ? (
              <p className="mt-4 text-muted-foreground">No transactions recorded yet.</p>
            ) : (
              <ul className="mt-4">
                {data.recent.map((tx) => (
                  <li
                    key={tx.tx_hash}
                    className="flex items-baseline justify-between gap-4 border-t border-border py-3"
                  >
                    <span className="text-sm text-foreground">{tx.action}</span>
                    <a
                      href={`${EXPLORER}/${tx.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-mono text-sm text-accent underline underline-offset-4"
                    >
                      {tx.tx_hash.slice(0, 10)}…{tx.tx_hash.slice(-6)}
                    </a>
                    <time
                      dateTime={tx.created_at}
                      className="shrink-0 text-sm text-muted-foreground"
                    >
                      {new Date(tx.created_at).toISOString().slice(0, 10)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
