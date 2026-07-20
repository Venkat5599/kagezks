// Dashboard stats: DB aggregates (APIs / requests / earnings) + live on-chain
// session + pool reads (the scoped-key panel).
import { sql } from "@/lib/db";
import { rateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  scValToNative,
  BASE_FEE,
} from "@stellar/stellar-sdk";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC_URL = "https://soroban-testnet.stellar.org";
const POOL = "CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC";
const SESSION = "CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636";
const SOURCE = "GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y";

export async function GET(req: Request) {
  const limitResult = rateLimit(req, RATE_LIMITS.api, "stats");
  if (!limitResult.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...rateLimitHeaders(limitResult) },
    });
  }
  // Per-user aggregates when ?owner is provided (the connected wallet); global otherwise.
  const owner = new URL(req.url).searchParams.get("owner");
  let totals = { apis: 0, requests: 0, success: 0, earnings: 0, mcpServers: 0, workflows: 0 };
  try {
    const a = (owner
      ? await sql`SELECT COUNT(*)::int AS apis, COALESCE(SUM(request_count),0)::int AS requests, COALESCE(SUM(success_count),0)::int AS success, COALESCE(SUM(earnings),0)::float AS earnings FROM apis WHERE owner_address = ${owner}`
      : await sql`SELECT COUNT(*)::int AS apis, COALESCE(SUM(request_count),0)::int AS requests, COALESCE(SUM(success_count),0)::int AS success, COALESCE(SUM(earnings),0)::float AS earnings FROM apis`) as Array<{ apis: number; requests: number; success: number; earnings: number }>;
    const m = (owner
      ? await sql`SELECT COUNT(*)::int AS c FROM mcp_servers WHERE owner_address = ${owner}`
      : await sql`SELECT COUNT(*)::int AS c FROM mcp_servers`) as Array<{ c: number }>;
    const w = (owner
      ? await sql`SELECT COUNT(*)::int AS c FROM workflows WHERE owner_address = ${owner}`
      : await sql`SELECT COUNT(*)::int AS c FROM workflows`) as Array<{ c: number }>;
    totals = { apis: a[0]?.apis ?? 0, requests: a[0]?.requests ?? 0, success: a[0]?.success ?? 0, earnings: a[0]?.earnings ?? 0, mcpServers: m[0]?.c ?? 0, workflows: w[0]?.c ?? 0 };
  } catch {}

  // Live on-chain session + pool
  let session: { cap: string | null; spent: string | null; remaining: string | null; expiry: number | null; poolLeafCount: number; live: boolean } = {
    cap: null, spent: null, remaining: null, expiry: null, poolLeafCount: 0, live: false,
  };
  try {
    const server = new rpc.Server(RPC_URL);
    const account = await server.getAccount(SOURCE);
    const call = async (cid: string, method: string) => {
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(cid).call(method))
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
      return scValToNative(sim.result.retval);
    };
    const [remaining, policy, leafCount] = await Promise.all([
      call(SESSION, "remaining"),
      call(SESSION, "policy"),
      call(POOL, "leaf_count"),
    ]);
    const p = (policy ?? {}) as Record<string, unknown>;
    session = {
      cap: p.cap != null ? String(p.cap) : null,
      spent: p.spent != null ? String(p.spent) : null,
      remaining: remaining != null ? String(remaining) : null,
      expiry: p.expiry != null ? Number(p.expiry) : null,
      poolLeafCount: Number(leafCount ?? 0),
      live: true,
    };
  } catch {}

  const successRate = totals.requests > 0 ? Math.round((totals.success / totals.requests) * 100) : 0;
  return Response.json(
    { totals: { ...totals, successRate }, session },
    { headers: rateLimitHeaders(limitResult) }
  );
}
