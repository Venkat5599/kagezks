// Live on-chain read of the deployed Ledgerproof contract's status().
// Simulates the contract call against Stellar testnet RPC and decodes the
// Attestation — this is a real-time read of the chain, not a snapshot.
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
const CONTRACT = "CA3G57DWPMJLVNXH3KVX55RMU3WEJGRLZJKDT6NGQMRZDSHEFBDB6ZDO";
const SOURCE = "GC7T5BU4A52IFL4EY4WJWG2ZFU2XWMOXRPVOE46D5WJZV7XKE66BT3UW";

const toHex = (b: unknown): string => {
  if (b instanceof Uint8Array) return Buffer.from(b).toString("hex");
  if (Buffer.isBuffer(b)) return b.toString("hex");
  return String(b ?? "");
};

export async function GET() {
  try {
    const server = new rpc.Server(RPC_URL);
    const account = await server.getAccount(SOURCE);
    const contract = new Contract(CONTRACT);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call("status"))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      return Response.json({ live: false, reason: "no result" });
    }
    const a = scValToNative(sim.result.retval) as
      | {
          liabilities_root?: unknown;
          reserves?: bigint;
          ledger_seq?: number;
          solvent?: boolean;
          ts?: bigint;
        }
      | null
      | undefined;

    if (!a) return Response.json({ live: true, attestation: null });

    return Response.json({
      live: true,
      contract: CONTRACT,
      attestation: {
        solvent: Boolean(a.solvent),
        reserves: a.reserves?.toString() ?? "0",
        ledger_seq: Number(a.ledger_seq ?? 0),
        liabilities_root: toHex(a.liabilities_root),
        ts: a.ts?.toString() ?? "0",
      },
    });
  } catch (e) {
    return Response.json({ live: false, error: String(e) });
  }
}
