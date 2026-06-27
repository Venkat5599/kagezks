// Live on-chain read of the deployed Veil pool contract. Simulates the
// current_root() and leaf_count() calls against Stellar testnet RPC — a
// real-time read of the chain, not a snapshot.
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
const CONTRACT = "CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD";
const SOURCE = "GC7T5BU4A52IFL4EY4WJWG2ZFU2XWMOXRPVOE46D5WJZV7XKE66BT3UW";

const toHex = (b: unknown): string => {
  if (b instanceof Uint8Array) return Buffer.from(b).toString("hex");
  if (Buffer.isBuffer(b)) return b.toString("hex");
  return String(b ?? "");
};

async function read(server: rpc.Server, account: Awaited<ReturnType<rpc.Server["getAccount"]>>, fn: string) {
  const contract = new Contract(CONTRACT);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(fn))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}

export async function GET() {
  try {
    const server = new rpc.Server(RPC_URL);
    const account = await server.getAccount(SOURCE);

    const root = await read(server, account, "current_root");
    const count = await read(server, account, "leaf_count");

    return Response.json({
      live: true,
      contract: CONTRACT,
      current_root: toHex(root),
      leaf_count: Number(count ?? 0),
    });
  } catch (e) {
    return Response.json({ live: false, error: String(e) });
  }
}
