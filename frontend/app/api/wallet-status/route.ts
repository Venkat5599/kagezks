// Per-wallet on-chain status for the connected address — real, distinct per user (unlike
// the shared demo SessionAccount). Reads the address's native XLM balance from Horizon;
// unfunded accounts return funded:false. Used by the x402 Payments panel.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HORIZON = "https://horizon-testnet.stellar.org";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return Response.json({ ok: false, error: "address required" }, { status: 400 });
  try {
    const r = await fetch(`${HORIZON}/accounts/${address}`, { cache: "no-store" });
    if (r.status === 404) return Response.json({ ok: true, funded: false, xlm: "0" });
    if (!r.ok) return Response.json({ ok: false, error: `horizon ${r.status}` }, { status: 502 });
    const acct = (await r.json()) as { balances?: { asset_type: string; balance: string }[] };
    const native = (acct.balances ?? []).find((b) => b.asset_type === "native");
    return Response.json({ ok: true, funded: true, xlm: native?.balance ?? "0" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
