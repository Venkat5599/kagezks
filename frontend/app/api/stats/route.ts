// Dashboard stats: DB aggregates (APIs / requests / earnings) + live on-chain
// session + pool reads (the scoped-key panel).
import { sql } from "@/lib/db";
import { networkFromRequest } from "@/lib/networks";
import { readContract } from "@/lib/chain-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The demo agent's SessionAccount lives on mainnet only.
const SESSION_MAINNET = process.env.KAGE_SESSION ?? "";

export async function GET(req: Request) {
  // Per-user aggregates when ?owner is provided (the connected wallet); global otherwise.
  const owner = new URL(req.url).searchParams.get("owner");
  const net = networkFromRequest(req);
  const SESSION = net.name === "mainnet" ? SESSION_MAINNET : "";
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
    const call = (cid: string, method: string) => readContract(net, cid, method);
    const [remaining, policy, leafCount] = await Promise.all([
      SESSION ? call(SESSION, "remaining") : Promise.resolve(null),
      SESSION ? call(SESSION, "policy") : Promise.resolve(null),
      call(net.pool, "leaf_count"),
    ]);
    const p = (policy ?? {}) as Record<string, unknown>;
    session = {
      cap: p.cap != null ? String(p.cap) : null,
      spent: p.spent != null ? String(p.spent) : null,
      remaining: remaining != null ? String(remaining) : null,
      expiry: p.expiry != null ? Number(p.expiry) : null,
      poolLeafCount: Number(leafCount ?? 0),
      live: leafCount != null,
    };
  } catch {}

  const successRate = totals.requests > 0 ? Math.round((totals.success / totals.requests) * 100) : 0;
  return Response.json({ network: net.name, totals: { ...totals, successRate }, session });
}
