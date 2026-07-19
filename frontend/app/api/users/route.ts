// User onboarding tracking. POST records a wallet the moment it connects to the
// app; repeat connects bump `visits` and `last_seen` rather than duplicating a
// row, so the user count is distinct wallets and nothing else.
//
// Also accepts an on-chain action (`action` + `txHash`) so a real testnet
// transaction taken in-app is attributable to the wallet that made it — that
// pairing is what makes the onboarding numbers verifiable on stellar.expert.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Stellar public keys are 56 chars, base32, leading G. Reject anything else so a
// bad client can't pollute the user table.
const isStellarAddress = (s: unknown): s is string =>
  typeof s === "string" && /^G[A-Z2-7]{55}$/.test(s);

const ACTIONS = new Set(["deposit", "withdraw", "provision", "agent_run"]);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { address, walletKind, referrer, action, txHash } = body;

  if (!isStellarAddress(address)) {
    return Response.json({ ok: false, error: "invalid Stellar address" }, { status: 400 });
  }
  const kind = walletKind === "freighter" ? "freighter" : "generated";
  const ref = typeof referrer === "string" ? referrer.slice(0, 500) : null;

  try {
    await sql`
      INSERT INTO users (address, wallet_kind, referrer)
      VALUES (${address}, ${kind}, ${ref})
      ON CONFLICT (address) DO UPDATE
        SET last_seen = now(),
            visits    = users.visits + 1,
            -- a generated identity that later connects Freighter is upgraded, never downgraded
            wallet_kind = CASE WHEN EXCLUDED.wallet_kind = 'freighter'
                               THEN 'freighter' ELSE users.wallet_kind END
    `;

    // Optional: attach an on-chain action to this wallet.
    if (typeof action === "string" && ACTIONS.has(action)) {
      const hash = typeof txHash === "string" && /^[0-9a-f]{64}$/i.test(txHash) ? txHash : null;
      await sql`INSERT INTO user_txs (address, action, tx_hash) VALUES (${address}, ${action}, ${hash})`;
      await sql`UPDATE users SET tx_count = tx_count + 1 WHERE address = ${address}`;
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
