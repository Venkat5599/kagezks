// Read-only Soroban calls (simulation only — nothing is signed or submitted).
// A throwaway source account is enough for simulation, so reads work on either
// network without a funded account.
import { rpc, Contract, TransactionBuilder, BASE_FEE, Account, Keypair, scValToNative, type xdr } from "@stellar/stellar-sdk";
import type { NetworkConfig } from "./networks";

export async function readContract(net: NetworkConfig, contractId: string, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const server = new rpc.Server(net.rpc);
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: net.passphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}

export const toHex = (b: unknown): string =>
  b instanceof Uint8Array ? Buffer.from(b).toString("hex") : Buffer.isBuffer(b) ? b.toString("hex") : "";
