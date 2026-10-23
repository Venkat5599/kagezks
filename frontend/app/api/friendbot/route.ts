// Testnet only: ask Stellar's friendbot to fund an address with free test XLM.
import { StrKey } from "@stellar/stellar-sdk";
import { NETWORKS } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !StrKey.isValidEd25519PublicKey(address)) {
    return Response.json({ ok: false, error: "a valid G... address is required" }, { status: 400 });
  }
  const r = await fetch(`${NETWORKS.testnet.friendbot}/?addr=${address}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = (await r.json().catch(() => ({}))) as { hash?: string; detail?: string };
  if (r.ok) return Response.json({ ok: true, hash: body.hash ?? null });
  // Friendbot answers 400 "already funded" for an existing account — not an error for the user.
  if (r.status === 400 && /already/i.test(body.detail ?? "")) return Response.json({ ok: true, alreadyFunded: true });
  return Response.json({ ok: false, error: body.detail ?? `friendbot ${r.status}` }, { status: 502 });
}
