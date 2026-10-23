// The browser refuses to sign any setup plan that isn't exactly what the user asked for.
import { describe, it, expect } from "vitest";
import { Address, Keypair, Networks, StrKey, hash, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { checkPlan, signPlan, PlanRejected, type ProvisionPlan, type Expected } from "@/lib/session-sign";
import { NETWORKS } from "@/lib/networks";

const net = NETWORKS.testnet;
const owner = Keypair.random();
const agent = Keypair.random();
const SESSION = StrKey.encodeContract(Buffer.alloc(32, 7));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
const CAP = 50_000_000n;
const FUND = 10_000_000n;
const LEDGER = 1_000_720;
const EXPIRY = Math.floor(Date.now() / 1000) + 30 * 86400;

const entry = (who: string, contract: string, fn: string, args: xdr.ScVal[], o: { ledger?: number; sub?: boolean } = {}) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({ address: Address.fromString(who).toScAddress(), nonce: xdr.Int64.fromString("12345"), signatureExpirationLedger: o.ledger ?? LEDGER, signature: xdr.ScVal.scvVoid() }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: Address.fromString(contract).toScAddress(), functionName: fn, args })),
      subInvocations: o.sub
        ? [new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: Address.fromString(net.xlmSac).toScAddress(), functionName: "transfer", args: [] })), subInvocations: [] })]
        : [],
    }),
  }).toXDR("base64");

type Over = Partial<{ initOwner: string; agentKey: string; pool: string; token: string; cap: bigint; expiry: number; initContract: string; initFn: string; from: string; to: string; amount: bigint; transferContract: string; signer: string; ledger: number; sub: boolean }>;
const plan = (o: Over = {}, top: Partial<ProvisionPlan> = {}): ProvisionPlan => {
  const initArgs = [
    new Address(o.initOwner ?? owner.publicKey()).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(StrKey.decodeEd25519PublicKey(o.agentKey ?? agent.publicKey()))),
    new Address(o.pool ?? net.pool).toScVal(),
    new Address(o.token ?? net.xlmSac).toScVal(),
    nativeToScVal(o.cap ?? CAP, { type: "i128" }),
    nativeToScVal(o.expiry ?? EXPIRY, { type: "u64" }),
  ];
  const transferArgs = [new Address(o.from ?? owner.publicKey()).toScVal(), new Address(o.to ?? SESSION).toScVal(), nativeToScVal(o.amount ?? FUND, { type: "i128" })];
  const signer = o.signer ?? owner.publicKey();
  return {
    id: "abc",
    network: "testnet",
    owner: owner.publicKey(),
    sessionId: SESSION,
    agent: agent.publicKey(),
    pool: net.pool,
    token: net.xlmSac,
    cap: CAP.toString(),
    fund: FUND.toString(),
    expiry: EXPIRY,
    validUntilLedger: LEDGER,
    approvals: [
      { purpose: "init", xdr: entry(signer, o.initContract ?? SESSION, o.initFn ?? "init", initArgs, { ...(o.ledger ? { ledger: o.ledger } : {}), ...(o.sub ? { sub: true } : {}) }) },
      { purpose: "fund", xdr: entry(signer, o.transferContract ?? net.xlmSac, "transfer", transferArgs) },
    ],
    ...top,
  };
};
const want: Expected = { owner: owner.publicKey(), pool: net.pool, token: net.xlmSac, cap: CAP, fund: FUND, network: "testnet" };

describe("checkPlan", () => {
  it("accepts the exact plan and describes it in plain words", () => {
    expect(checkPlan(plan(), want)).toEqual([
      `Set up session ${SESSION.slice(0, 6)}…${SESSION.slice(-4)}: its agent can only pay into the Kage pool, at most 5 XLM in total, for 30 days.`,
      "Send 1 XLM from your wallet to that session.",
    ]);
  });
  const stranger = Keypair.random().publicKey();
  it.each<[string, ProvisionPlan, RegExp]>([
    ["a session that may pay somewhere other than the pool", plan({ pool: OTHER_CONTRACT }), /other than the Kage pool/],
    ["a bigger spending limit", plan({ cap: CAP * 10n }), /different spend cap/],
    ["a different agent key than announced", plan({ agentKey: stranger }), /different agent key/],
    ["a session owned by someone else", plan({ initOwner: stranger }), /different owner/],
    ["a different token in the policy", plan({ token: OTHER_CONTRACT }), /different token/],
    ["an expiry far in the future", plan({ expiry: EXPIRY + 365 * 86400 }), /unexpected expiry/],
    ["an expiry in the past", plan({ expiry: Math.floor(Date.now() / 1000) - 10 }), /unexpected expiry/],
    ["setup on a different contract", plan({ initContract: OTHER_CONTRACT }), /isn't the session setup/],
    ["a different method instead of init", plan({ initFn: "extend" }), /isn't the session setup/],
    ["a transfer to someone else", plan({ to: stranger }), /doesn't go from your wallet/],
    ["a transfer from another wallet", plan({ from: stranger }), /doesn't go from your wallet/],
    ["a bigger transfer", plan({ amount: FUND * 1000n }), /amount is different/],
    ["a transfer of another token", plan({ transferContract: OTHER_CONTRACT }), /isn't an XLM transfer/],
    ["approvals tied to another wallet", plan({ signer: stranger }), /different wallet/],
    ["an approval that also authorises other calls", plan({ sub: true }), /also authorise other calls/],
    ["an approval expiry that differs from the plan", plan({ ledger: LEDGER + 5 }), /expiry doesn't match/],
    ["a plan for another network", plan({}, { network: "mainnet" }), /server is on mainnet/],
    ["a plan for another wallet", plan({}, { owner: stranger }), /different wallet/],
    ["a session address that isn't a contract", plan({}, { sessionId: stranger }), /isn't a contract/],
    ["approvals in the wrong order", (() => { const p = plan(); return { ...p, approvals: [p.approvals[1]!, p.approvals[0]!] }; })(), /exactly two approvals/],
    ["a third approval", (() => { const p = plan(); return { ...p, approvals: [...p.approvals, p.approvals[1]!] }; })(), /exactly two approvals/],
    ["garbage instead of an approval", (() => { const p = plan(); return { ...p, approvals: [{ purpose: "init" as const, xdr: "bm9wZQ==" }, p.approvals[1]!] }; })(), /isn't a Stellar approval/],
  ])("refuses %s", (_name, p, msg) => {
    expect(() => checkPlan(p, want)).toThrow(PlanRejected);
    expect(() => checkPlan(p, want)).toThrow(msg);
  });
  it("refuses when the user typed a different amount than the server prepared", () => {
    expect(() => checkPlan(plan(), { ...want, fund: FUND + 1n })).toThrow(/amount is different/);
  });
});

describe("signPlan", () => {
  it("signs both approvals with the owner key over Soroban's authorization payload", async () => {
    const p = plan();
    const signed = await signPlan(p, owner.secret(), Networks.TESTNET);
    expect(signed).toHaveLength(2);
    for (const s of signed) {
      const e = xdr.SorobanAuthorizationEntry.fromXDR(s, "base64");
      const c = e.credentials().address();
      expect(c.signatureExpirationLedger()).toBe(LEDGER);
      const payload = hash(
        xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
          new xdr.HashIdPreimageSorobanAuthorization({ networkId: hash(Buffer.from(Networks.TESTNET)), nonce: c.nonce(), signatureExpirationLedger: LEDGER, invocation: e.rootInvocation() }),
        ).toXDR(),
      );
      const fields = new Map((c.signature().vec()![0]!.map() ?? []).map((m) => [m.key().sym().toString(), m.val().bytes()]));
      expect(StrKey.encodeEd25519PublicKey(Buffer.from(fields.get("public_key")!))).toBe(owner.publicKey());
      expect(owner.verify(payload, Buffer.from(fields.get("signature")!))).toBe(true);
    }
  });
  it("the signed approvals never contain the secret key", async () => {
    const signed = await signPlan(plan(), owner.secret(), Networks.TESTNET);
    expect(signed.join("")).not.toContain(owner.secret());
    expect(Buffer.from(signed.join(""), "base64").toString("latin1")).not.toContain(owner.secret());
  });
  it("refuses to sign with a key that isn't the plan's owner", async () => {
    await expect(signPlan(plan(), Keypair.random().secret(), Networks.TESTNET)).rejects.toThrow(/doesn't belong/);
  });
});
