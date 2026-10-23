// Browser side of session setup: the owner's secret key stays here. The server sends
// two unsigned approvals; before signing, we decode each one and check it is exactly
// the call the user asked for, so a tampered server can't get a signature for a
// transfer somewhere else or for a bigger amount.
import { Buffer } from "buffer";
import { Address, Keypair, StrKey, authorizeEntry, scValToNative, xdr } from "@stellar/stellar-sdk";

export type ProvisionPlan = {
  id: string;
  network: string;
  owner: string;
  sessionId: string;
  agent: string;
  pool: string;
  token: string;
  cap: string;
  fund: string;
  expiry: number;
  validUntilLedger: number;
  approvals: { purpose: "init" | "fund"; xdr: string }[];
};

export type Expected = { owner: string; pool: string; token: string; cap: bigint; fund: bigint; network: string };

export class PlanRejected extends Error {}

type Call = { contract: string; fn: string; args: unknown[] };

function decodeCall(entryB64: string, owner: string, validUntilLedger: number): Call {
  let entry: xdr.SorobanAuthorizationEntry;
  try {
    entry = xdr.SorobanAuthorizationEntry.fromXDR(entryB64, "base64");
  } catch {
    throw new PlanRejected("the server sent something that isn't a Stellar approval");
  }
  if (entry.credentials().switch().name !== "sorobanCredentialsAddress") throw new PlanRejected("approval isn't tied to your wallet");
  const c = entry.credentials().address();
  if (Address.fromScAddress(c.address()).toString() !== owner) throw new PlanRejected("approval is for a different wallet");
  if (c.signatureExpirationLedger() !== validUntilLedger) throw new PlanRejected("approval expiry doesn't match the plan");
  const inv = entry.rootInvocation();
  if (inv.subInvocations().length !== 0) throw new PlanRejected("approval would also authorise other calls");
  const fn = inv.function();
  if (fn.switch().name !== "sorobanAuthorizedFunctionTypeContractFn") throw new PlanRejected("approval would deploy a contract");
  const a = fn.contractFn();
  return { contract: Address.fromScAddress(a.contractAddress()).toString(), fn: a.functionName().toString(), args: a.args().map((v) => scValToNative(v)) };
}

/**
 * Check a plan against what the user asked for and return a plain description of
 * each approval. Throws PlanRejected on any mismatch.
 */
export function checkPlan(plan: ProvisionPlan, want: Expected): string[] {
  if (plan.network !== want.network) throw new PlanRejected(`the server is on ${plan.network}, you're on ${want.network}`);
  if (plan.owner !== want.owner) throw new PlanRejected("plan is for a different wallet");
  if (!StrKey.isValidContract(plan.sessionId)) throw new PlanRejected("session address isn't a contract");
  if (!StrKey.isValidEd25519PublicKey(plan.agent)) throw new PlanRejected("agent key isn't valid");
  if (plan.approvals.length !== 2 || plan.approvals[0]?.purpose !== "init" || plan.approvals[1]?.purpose !== "fund") throw new PlanRejected("expected exactly two approvals: set up, then fund");

  const init = decodeCall(plan.approvals[0].xdr, want.owner, plan.validUntilLedger);
  const [owner, agent, pool, token, cap, expiry] = init.args as [string, Uint8Array, string, string, bigint, bigint];
  if (init.contract !== plan.sessionId || init.fn !== "init") throw new PlanRejected("first approval isn't the session setup");
  if (init.args.length !== 6 || owner !== want.owner) throw new PlanRejected("session setup names a different owner");
  if (StrKey.encodeEd25519PublicKey(Buffer.from(agent)) !== plan.agent) throw new PlanRejected("session setup names a different agent key");
  if (pool !== want.pool) throw new PlanRejected("session setup would allow paying somewhere other than the Kage pool");
  if (token !== want.token) throw new PlanRejected("session setup names a different token");
  if (BigInt(cap) !== want.cap) throw new PlanRejected("session setup has a different spend cap");
  const days = (Number(expiry) - Date.now() / 1000) / 86400;
  if (days <= 0 || days > 31) throw new PlanRejected("session setup has an unexpected expiry");

  const fund = decodeCall(plan.approvals[1].xdr, want.owner, plan.validUntilLedger);
  const [from, to, amount] = fund.args as [string, string, bigint];
  if (fund.contract !== want.token || fund.fn !== "transfer" || fund.args.length !== 3) throw new PlanRejected("second approval isn't an XLM transfer");
  if (from !== want.owner || to !== plan.sessionId) throw new PlanRejected("transfer doesn't go from your wallet to your new session");
  if (BigInt(amount) !== want.fund) throw new PlanRejected("transfer amount is different from what you entered");

  const xlm = (v: bigint) => `${Number(v) / 1e7} XLM`;
  return [
    `Set up session ${plan.sessionId.slice(0, 6)}…${plan.sessionId.slice(-4)}: its agent can only pay into the Kage pool, at most ${xlm(want.cap)} in total, for ${Math.round(days)} days.`,
    `Send ${xlm(want.fund)} from your wallet to that session.`,
  ];
}

/** Sign both approvals with the owner key. Only the signed approvals leave the browser. */
export async function signPlan(plan: ProvisionPlan, secret: string, passphrase: string): Promise<string[]> {
  const kp = Keypair.fromSecret(secret);
  if (kp.publicKey() !== plan.owner) throw new PlanRejected("this key doesn't belong to the wallet in the plan");
  return Promise.all(
    plan.approvals.map(async (a) => (await authorizeEntry(xdr.SorobanAuthorizationEntry.fromXDR(a.xdr, "base64"), kp, plan.validUntilLedger, passphrase)).toXDR("base64")),
  );
}
