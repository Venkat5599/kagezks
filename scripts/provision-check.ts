// Attack checks for agent-account setup, against a running fabric on testnet.
//
//   VEIL_NETWORK=testnet bun run agent/fabric-server.ts        # with a funded VEIL_FEE_SECRET
//   FABRIC=http://localhost:8403 bun run scripts/provision-check.ts
//
// Every case must be refused before the relayer spends anything; the last case is the
// honest path and must produce a live, correctly scoped session.
import { Keypair, Networks, xdr, Address, nativeToScVal, authorizeEntry } from "@stellar/stellar-sdk";
import { checkPlan, signPlan, PlanRejected, type ProvisionPlan } from "../frontend/lib/session-sign.ts";

const FABRIC = (process.env.FABRIC ?? "http://localhost:8403").replace(/\/$/, "");
const PASS = Networks.TESTNET;
const POOL = "CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC";
const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const post = async (path: string, body: unknown) => {
  const r = await fetch(`${FABRIC}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as { ok: boolean; error?: string; plan?: ProvisionPlan; sessionId?: string } };
};
const funded = async () => {
  const k = Keypair.random();
  const r = await fetch(`https://friendbot.stellar.org/?addr=${k.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
  return k;
};
const prepare = async (owner: string, cap = "50000000", amount = "10000000") => {
  const r = await post("/provision/prepare", { ownerAddress: owner, cap, amount });
  if (!r.body.ok) throw new Error(r.body.error);
  return r.body.plan!;
};

let failures = 0;
const expectRefused = async (name: string, run: () => Promise<{ status: number; body: { ok: boolean; error?: string } }>, match: RegExp) => {
  const r = await run();
  const ok = !r.body.ok && match.test(r.body.error ?? "");
  if (!ok) failures++;
  console.log(`${ok ? "refused" : "NOT REFUSED"}  ${name}  -> ${r.status} ${r.body.error ?? JSON.stringify(r.body)}`);
};

const owner = await funded();

await expectRefused("a secret key in the request", () => post("/provision/prepare", { ownerAddress: owner.publicKey(), ownerSecret: owner.secret() }), /never accepted/);
await expectRefused("a secret key hidden in another field", () => post("/provision/prepare", { ownerAddress: owner.publicKey(), note: owner.secret() }), /never accepted/);
await expectRefused("a starting balance above the limit", () => post("/provision/prepare", { ownerAddress: owner.publicKey(), cap: "10000000", amount: "20000000" }), /more than the spend cap/);
await expectRefused("a non-numeric limit", () => post("/provision/prepare", { ownerAddress: owner.publicKey(), cap: "5 XLM" }), /whole number/);

{
  const plan = await prepare(owner.publicKey());
  const stranger = Keypair.random();
  const signed = await Promise.all(plan.approvals.map(async (a) => (await authorizeEntry(xdr.SorobanAuthorizationEntry.fromXDR(a.xdr, "base64"), stranger, plan.validUntilLedger, PASS)).toXDR("base64")));
  await expectRefused("approvals signed by someone else's key", () => post("/provision/finish", { id: plan.id, signed }), /different key|different wallet/);
}
{
  const plan = await prepare(owner.publicKey());
  // The owner signs a transfer of 1000 XLM instead of the prepared 1 XLM.
  const e = xdr.SorobanAuthorizationEntry.fromXDR(plan.approvals[1]!.xdr, "base64");
  const args = [new Address(owner.publicKey()).toScVal(), new Address(plan.sessionId).toScVal(), nativeToScVal(10_000_000_000n, { type: "i128" })];
  e.rootInvocation().function().contractFn().args(args);
  const tampered = { ...plan, approvals: [plan.approvals[0]!, { purpose: "fund" as const, xdr: e.toXDR("base64") }] };
  const signed = await signPlan(tampered, owner.secret(), PASS);
  await expectRefused("a signed approval for a bigger amount than prepared", () => post("/provision/finish", { id: plan.id, signed }), /different call/);
  let refused = false;
  try {
    checkPlan(tampered, { owner: owner.publicKey(), pool: POOL, token: XLM, cap: 50_000_000n, fund: 10_000_000n, network: "testnet" });
  } catch (err) {
    refused = err instanceof PlanRejected;
  }
  if (!refused) failures++;
  console.log(`${refused ? "refused" : "NOT REFUSED"}  the browser check, shown the same tampered plan`);
}
{
  const plan = await prepare(owner.publicKey());
  const signed = await signPlan(plan, owner.secret(), PASS);
  await expectRefused("approvals in the wrong order", () => post("/provision/finish", { id: plan.id, signed: [signed[1], signed[0]] }), /different call|does not match/);
}
{
  const unfunded = Keypair.random();
  const plan = await prepare(unfunded.publicKey());
  const signed = await signPlan(plan, unfunded.secret(), PASS);
  await expectRefused("a wallet that was never funded", () => post("/provision/finish", { id: plan.id, signed }), /isn't funded/);
}
await expectRefused("an unknown setup id", () => post("/provision/finish", { id: "0".repeat(32), signed: ["a", "b"] }), /expired|already finished/);

// The honest path, then a replay of the same signed request.
const plan = await prepare(owner.publicKey());
checkPlan(plan, { owner: owner.publicKey(), pool: POOL, token: XLM, cap: 50_000_000n, fund: 10_000_000n, network: "testnet" });
const signed = await signPlan(plan, owner.secret(), PASS);
const done = await post("/provision/finish", { id: plan.id, signed });
if (!done.body.ok) failures++;
console.log(`${done.body.ok ? "created" : "FAILED"}  honest setup -> ${done.body.ok ? done.body.sessionId : done.body.error}`);
await expectRefused("replaying the same signed request", () => post("/provision/finish", { id: plan.id, signed }), /expired|already finished/);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
