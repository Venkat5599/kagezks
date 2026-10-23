// Fake upstreams for the catalog: every outbound fetch is matched against a route
// table, recorded, and answered with a canned Horizon / Stellar Expert body.
import { vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

export type Route = { match: (u: URL) => boolean; status: number; body: unknown | ((u: URL) => unknown) };

export const on = (path: string | RegExp, body: Route["body"], status = 200): Route => ({
  match: (u) => (typeof path === "string" ? u.pathname === path : path.test(u.pathname + u.search)),
  status,
  body,
});

export function upstream(...routes: Route[]) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url);
    const r = routes.find((x) => x.match(url));
    if (!r) return new Response(JSON.stringify({ status: 404, title: "Resource Missing" }), { status: 404 });
    const body = typeof r.body === "function" ? (r.body as (u: URL) => unknown)(url) : r.body;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: r.status });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn, hosts: () => calls.map((c) => c.host) };
}

export const failingFetch = (err: Error) => vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));

export const addr = () => Keypair.random().publicKey();
export const ADMIN = "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6";
export const USDC_MAIN = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USDC_TEST = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const EURC_MAIN = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
export const HASH = "5f3235cc72dd7091d72fc652ecc7bbcfe4599db0663d75a2105e53da19461793";

// ---- Horizon bodies ----
export const account = (xlm: string, opts: { subentries?: number; tokens?: { code: string; issuer: string; balance: string }[] } = {}) => ({
  balances: [
    ...(opts.tokens ?? []).map((t) => ({ asset_type: t.code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12", asset_code: t.code, asset_issuer: t.issuer, balance: t.balance })),
    { asset_type: "native", balance: xlm },
  ],
  subentry_count: opts.subentries ?? 0,
});

export const page = <T,>(records: T[]) => ({ _embedded: { records } });

export const feeStats = (usage = "0.2", p50 = "100", p90 = "200", base = "100") => ({
  last_ledger_base_fee: base,
  ledger_capacity_usage: usage,
  fee_charged: { p50, p90 },
});

export const ledger = (secondsAgo = 5, extra: Record<string, unknown> = {}) =>
  page([{ sequence: 60_000_000, closed_at: new Date(Date.now() - secondsAgo * 1000).toISOString(), successful_transaction_count: 120, failed_transaction_count: 3, operation_count: 400, protocol_version: 23, total_coins: "105443902087.3472865", base_reserve_in_stroops: 5_000_000, ...extra }]);

export const book = (bid: string | null, ask: string | null) => ({ bids: bid ? [{ price: bid }] : [], asks: ask ? [{ price: ask }] : [] });

export const paths = (...amounts: [string, string[]][]) =>
  page(amounts.map(([destination_amount, via]) => ({ destination_amount, path: via.map((c) => (c === "XLM" ? { asset_type: "native" } : { asset_type: "credit_alphanum4", asset_code: c })) })));

export const tx = (o: Partial<{ successful: boolean; fee_charged: string; memo_type: string; memo: string; source_account: string }> = {}) => ({
  successful: true,
  created_at: "2026-08-25T10:00:00Z",
  fee_charged: "100",
  operation_count: 1,
  memo_type: "none",
  source_account: ADMIN,
  ...o,
});

export const op = (o: Record<string, unknown>) => ({ created_at: "2026-08-25T10:00:00Z", transaction_successful: true, transaction_hash: HASH, ...o });
