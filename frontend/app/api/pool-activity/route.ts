// Full deposit / withdrawal history of the Kage pool, from Stellar Expert's indexed
// contract events (Soroban RPC only keeps about a week of events). Counts every event
// since the pool was deployed and returns the latest few, decoded.
import { xdr, scValToNative } from "@stellar/stellar-sdk";
import { networkFromRequest } from "@/lib/networks";

export const revalidate = 60;

type ExpertEvent = { id: string; ts: number; topics: string[]; bodyXdr: string };

const hex = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString("hex") : "");

export async function GET(req: Request) {
  const net = networkFromRequest(req);
  const base = `https://api.stellar.expert/explorer/${net.name === "mainnet" ? "public" : "testnet"}/contract/${net.pool}/events`;
  try {
    const events: ExpertEvent[] = [];
    let url: string | null = `${base}?order=desc&limit=200`;
    for (let page = 0; url && page < 20; page++) {
      const r: Response = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`stellar.expert ${r.status}`);
      const d = (await r.json()) as { _embedded?: { records?: ExpertEvent[] }; _links?: { next?: { href?: string } } };
      const recs = d._embedded?.records ?? [];
      events.push(...recs);
      url = recs.length === 200 && d._links?.next?.href ? `https://api.stellar.expert${d._links.next.href}` : null;
    }
    const kind = (e: ExpertEvent) => (e.topics.includes("deposit") ? "deposit" : e.topics.includes("withdraw") ? "withdraw" : null);
    const deposits = events.filter((e) => kind(e) === "deposit").length;
    const withdrawals = events.filter((e) => kind(e) === "withdraw").length;
    const recent = events
      .filter((e) => kind(e))
      .slice(0, 5)
      .map((e) => {
        let ref = "";
        try {
          const v = scValToNative(xdr.ScVal.fromXDR(e.bodyXdr, "base64")) as unknown[];
          ref = hex(v[0]); // deposit: commitment · withdraw: nullifier hash
        } catch {
          /* leave empty */
        }
        const op = e.id.split("-")[0];
        return { type: kind(e), at: new Date(e.ts * 1000).toISOString(), ref, link: `${net.explorer}/op/${op}` };
      });
    return Response.json({ ok: true, network: net.name, pool: net.pool, deposits, withdrawals, recent });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
