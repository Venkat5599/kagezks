// Live state of one agent account (a SessionAccount contract): its policy, what is left
// to spend, the XLM it holds and whether it can still pay. Read-only simulation.
//   GET /api/session-account?id=C…&network=testnet
import { Address, StrKey } from "@stellar/stellar-sdk";
import { networkFromRequest } from "@/lib/networks";
import { readContract } from "@/lib/chain-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Policy = { owner: string; pool: string; token: string; cap: bigint; spent: bigint; expiry: bigint };

export async function GET(req: Request) {
  const net = networkFromRequest(req);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!StrKey.isValidContract(id)) return Response.json({ ok: false, error: "id must be a contract address (C…)" }, { status: 400 });
  try {
    const [policy, balance] = await Promise.all([
      readContract(net, id, "policy") as Promise<Policy | null>,
      readContract(net, net.xlmSac, "balance", new Address(id).toScVal()) as Promise<bigint | null>,
    ]);
    if (!policy) return Response.json({ ok: false, error: `no agent account at this address on ${net.name}` }, { status: 404 });
    const now = Math.floor(Date.now() / 1000);
    const cap = BigInt(policy.cap);
    const spent = BigInt(policy.spent);
    const expiry = Number(policy.expiry);
    return Response.json({
      ok: true,
      network: net.name,
      id,
      owner: policy.owner,
      paysOnlyInto: policy.pool,
      isKagePool: policy.pool === net.pool,
      cap: cap.toString(),
      spent: spent.toString(),
      remaining: (cap > spent ? cap - spent : 0n).toString(),
      balance: balance != null ? BigInt(balance).toString() : null,
      expiry,
      daysLeft: Math.max(0, Math.round((expiry - now) / 86400)),
      active: expiry > now,
      explorer: `${net.explorer}/contract/${id}`,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
