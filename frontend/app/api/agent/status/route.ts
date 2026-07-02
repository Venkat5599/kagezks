// Live read of the agent's scoped SessionAccount + the pool's deposit history, for
// the dashboard's Agent-fabric monitor. All values are read on-chain from testnet.
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
const POOL = "CBRM3RK26Q3KLZC2KYRQ5OZ2HLCN7SV5A7EZMCUC27GL7QXUS32UB76B";
const SESSION = "CBJOY7CX36SI6P6JQJXM3MM4L3J4GTPWBTKUHN23J3HDAGJLHBOKWGR4";
const SOURCE = "GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y";

const toHex = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString("hex") : "");

export async function GET() {
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

    // Recent deposits (paginated) — each is an agent-or-owner ZK payment into the pool.
    const deposits: { leafIndex: number; commitment: string; amount: string }[] = [];
    try {
      const latest = await server.getLatestLedger();
      let cursor: string | undefined;
      for (let p = 0; p < 6; p++) {
        const res = await server.getEvents(
          cursor
            ? { filters: [{ type: "contract", contractIds: [POOL] }], limit: 100, cursor }
            : { startLedger: Math.max(1, latest.sequence - 16000), filters: [{ type: "contract", contractIds: [POOL] }], limit: 100 },
        );
        for (const ev of res.events ?? []) {
          const topics = (ev.topic ?? []).map((t) => {
            try { return String(scValToNative(t)); } catch { return ""; }
          });
          if (!topics.includes("deposit")) continue;
          const v = scValToNative(ev.value) as unknown[];
          if (Array.isArray(v)) deposits.push({ leafIndex: Number(v[3]), commitment: toHex(v[0]), amount: String(v[2] ?? "") });
        }
        cursor = res.cursor;
        if (!res.events || res.events.length === 0) break;
      }
    } catch {}
    deposits.sort((a, b) => a.leafIndex - b.leafIndex);

    const p = (policy ?? {}) as Record<string, unknown>;
    return Response.json({
      live: true,
      session: SESSION,
      pool: POOL,
      agentKey: p.agent instanceof Uint8Array ? toHex(p.agent) : String(p.agent ?? ""),
      cap: p.cap != null ? String(p.cap) : null,
      spent: p.spent != null ? String(p.spent) : null,
      remaining: remaining != null ? String(remaining) : null,
      expiry: p.expiry != null ? Number(p.expiry) : null,
      poolLeafCount: Number(leafCount ?? 0),
      deposits,
    });
  } catch (e) {
    return Response.json({ live: false, error: String(e) });
  }
}
