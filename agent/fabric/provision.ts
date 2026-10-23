// Provision a per-user scoped SessionAccount without the owner's secret key ever
// leaving their browser.
//
//   1. prepare(owner, cap, fund)  — the server picks a fresh agent key and a contract
//      address, and returns the two owner approvals the chain will ask for, unsigned:
//        · init(owner, agent, pool, token, cap, expiry) on the new SessionAccount
//        · transfer(owner → session, fund) on the XLM token contract
//   2. The browser checks each approval says exactly that, signs it with the owner key,
//      and sends back only the signatures.
//   3. finish(id, signed)         — the server checks every signature against the owner
//      address and the approval it prepared, then deploys, initialises and funds the
//      session (the relayer pays the network fees) and registers a bearer token.
//
// The server never sees the owner's secret, so it can't move the owner's funds: each
// signature authorises one exact call and expires after about an hour of ledgers.
import {
  rpc, Contract, Operation, TransactionBuilder, Address, Keypair, StrKey, xdr, nativeToScVal, hash,
} from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { reloadAgentKeys } from "./auth.ts";
import { RPC_URL, HORIZON_URL, NETWORK, PASSPHRASE as PASS, deployment as netDeployment } from "../../sdk/network.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SESSION_WASM = join(ROOT, "contracts", "solvency", "target", "wasm32v1-none", "release", "session_account.wasm");
const KEYFILE = join(ROOT, "sdk", "build", "agent_keys.json");

const server = () => new rpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Approvals stay valid for this many ledgers (~5 s each): about an hour to sign and finish. */
export const APPROVAL_LEDGERS = 720;
const PENDING_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING = 200;

export class ProvisionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---- pure helpers (shared with tests) ------------------------------------------------

/** An unsigned owner approval for exactly one contract call with no nested calls. */
export function ownerApproval(owner: string, contract: string, fn: string, args: xdr.ScVal[], nonce: bigint, validUntilLedger: number): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(owner).toScAddress(),
        nonce: xdr.Int64.fromString(nonce.toString()),
        signatureExpirationLedger: validUntilLedger,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({ contractAddress: Address.fromString(contract).toScAddress(), functionName: fn, args }),
      ),
      subInvocations: [],
    }),
  });
}

/** The 32 bytes the owner signs for an approval (Soroban's authorization preimage). */
export function approvalPayload(entry: xdr.SorobanAuthorizationEntry, passphrase: string): Buffer {
  const c = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(passphrase)),
      nonce: c.nonce(),
      signatureExpirationLedger: c.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    }),
  );
  return hash(preimage.toXDR());
}

/**
 * Accept a signed approval only if it is the approval we prepared (same call, nonce and
 * expiry) and carries a valid signature from the owner's key.
 */
export function verifyApproval(signed: xdr.SorobanAuthorizationEntry, expected: xdr.SorobanAuthorizationEntry, owner: string, passphrase: string): void {
  const sc = signed.credentials();
  if (sc.switch().name !== "sorobanCredentialsAddress") throw new ProvisionError(400, "approval is not signed by an address");
  const s = sc.address();
  const e = expected.credentials().address();
  if (Address.fromScAddress(s.address()).toString() !== owner) throw new ProvisionError(400, "approval is for a different wallet");
  if (s.nonce().toString() !== e.nonce().toString() || s.signatureExpirationLedger() !== e.signatureExpirationLedger()) throw new ProvisionError(400, "approval does not match what was prepared");
  if (!signed.rootInvocation().toXDR().equals(expected.rootInvocation().toXDR())) throw new ProvisionError(400, "approval is for a different call than the one prepared");
  const sig = s.signature();
  const items = sig.switch().name === "scvVec" ? (sig.vec() ?? []) : [];
  if (items.length !== 1) throw new ProvisionError(400, "approval needs exactly one signature");
  const fields = new Map((items[0]!.map() ?? []).map((m) => [m.key().sym().toString(), m.val()]));
  const pub = fields.get("public_key")?.bytes();
  const signature = fields.get("signature")?.bytes();
  if (!pub || !signature) throw new ProvisionError(400, "approval signature is malformed");
  if (StrKey.encodeEd25519PublicKey(Buffer.from(pub)) !== owner) throw new ProvisionError(400, "approval is signed by a different key");
  if (!Keypair.fromPublicKey(owner).verify(approvalPayload(expected, passphrase), Buffer.from(signature))) throw new ProvisionError(400, "approval signature is not valid");
}

export function deriveContractId(deployerPub: string, salt: Buffer, passphrase = PASS): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(passphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({ address: Address.fromString(deployerPub).toScAddress(), salt }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

const randomNonce = () => BigInt("0x" + randomBytes(8).toString("hex")) & ((1n << 63n) - 1n);
const parseAmount = (raw: string | undefined, fallback: bigint, label: string) => {
  if (raw == null || raw === "") return fallback;
  if (!/^\d{1,19}$/.test(raw)) throw new ProvisionError(400, `${label} must be a whole number of stroops`);
  return BigInt(raw);
};

// ---- chain helpers -------------------------------------------------------------------

async function waitTx(s: rpc.Server, txHash: string): Promise<"SUCCESS" | "FAILED" | "UNKNOWN"> {
  let parseHiccups = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    try {
      const g = await s.getTransaction(txHash);
      if (g.status === "SUCCESS") return "SUCCESS";
      if (g.status === "FAILED") return "FAILED";
    } catch {
      // js-xdr can fail to parse result meta under Bun even when the tx landed.
      if (++parseHiccups >= 3) return "UNKNOWN";
    }
  }
  return "UNKNOWN";
}

/** Simulate, assemble, sign with the relayer and submit one host-function operation. */
async function submitOp(op: xdr.Operation, relayer: Keypair, label: string): Promise<string> {
  const s = server();
  const src = await s.getAccount(relayer.publicKey());
  const tx = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASS }).addOperation(op).setTimeout(120).build();
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new ProvisionError(502, `${label} was refused in simulation: ${JSON.stringify((sim as { error?: unknown }).error ?? "unknown")}`);
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(relayer);
  const sent = await s.sendTransaction(assembled);
  if (sent.status === "ERROR") throw new ProvisionError(502, `${label} submit failed: ${JSON.stringify(sent.errorResult)}`);
  if ((await waitTx(s, sent.hash)) === "FAILED") throw new ProvisionError(502, `${label} failed on chain: ${sent.hash}`);
  return sent.hash;
}

const invokeWith = (contract: string, fn: string, args: xdr.ScVal[], auth: xdr.SorobanAuthorizationEntry[]) => {
  const call = new Contract(contract).call(fn, ...args).body().invokeHostFunctionOp().hostFunction();
  return Operation.invokeHostFunction({ func: call, auth });
};

async function xlmBalance(address: string): Promise<number | null> {
  const r = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new ProvisionError(502, `horizon ${r.status}`);
  const a = (await r.json()) as { balances: { asset_type: string; balance: string }[] };
  return Number(a.balances.find((b) => b.asset_type === "native")?.balance ?? 0);
}

// ---- the two steps -------------------------------------------------------------------

type Pending = {
  owner: string;
  salt: Buffer;
  sessionId: string;
  agentSecret: string;
  cap: bigint;
  fund: bigint;
  expiry: number;
  init: { args: xdr.ScVal[]; approval: xdr.SorobanAuthorizationEntry };
  transfer: { args: xdr.ScVal[]; approval: xdr.SorobanAuthorizationEntry };
  createdAt: number;
};
const pending = new Map<string, Pending>();

const sweep = () => {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
};

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

export async function prepareProvision(ownerAddress: string, amountRaw?: string, capRaw?: string, latestLedger?: number): Promise<ProvisionPlan> {
  if (!process.env.VEIL_FEE_SECRET) throw new ProvisionError(503, "relayer (VEIL_FEE_SECRET) not configured");
  if (!StrKey.isValidEd25519PublicKey(ownerAddress)) throw new ProvisionError(400, "ownerAddress must be a Stellar wallet address (G…)");
  sweep();
  if (pending.size >= MAX_PENDING) throw new ProvisionError(429, "too many setups in progress, try again in a few minutes");
  const relayer = Keypair.fromSecret(process.env.VEIL_FEE_SECRET);
  const { contract_id: POOL, usdc_sac: TOKEN } = netDeployment();
  const cap = parseAmount(capRaw, 50_000_000n, "cap");
  const fund = parseAmount(amountRaw, 10_000_000n, "amount");
  if (fund > cap) throw new ProvisionError(400, "the starting balance can't be more than the spend cap");
  const agent = Keypair.random();
  const salt = randomBytes(32);
  const sessionId = deriveContractId(relayer.publicKey(), salt);
  const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const validUntilLedger = (latestLedger ?? (await server().getLatestLedger()).sequence) + APPROVAL_LEDGERS;

  const initArgs = [
    new Address(ownerAddress).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(StrKey.decodeEd25519PublicKey(agent.publicKey()))),
    new Address(POOL).toScVal(),
    new Address(TOKEN).toScVal(),
    nativeToScVal(cap, { type: "i128" }),
    nativeToScVal(expiry, { type: "u64" }),
  ];
  const transferArgs = [new Address(ownerAddress).toScVal(), new Address(sessionId).toScVal(), nativeToScVal(fund, { type: "i128" })];
  const init = { args: initArgs, approval: ownerApproval(ownerAddress, sessionId, "init", initArgs, randomNonce(), validUntilLedger) };
  const transfer = { args: transferArgs, approval: ownerApproval(ownerAddress, TOKEN, "transfer", transferArgs, randomNonce(), validUntilLedger) };

  const id = randomBytes(16).toString("hex");
  pending.set(id, { owner: ownerAddress, salt, sessionId, agentSecret: agent.secret(), cap, fund, expiry, init, transfer, createdAt: Date.now() });
  return {
    id,
    network: NETWORK,
    owner: ownerAddress,
    sessionId,
    agent: agent.publicKey(),
    pool: POOL,
    token: TOKEN,
    cap: cap.toString(),
    fund: fund.toString(),
    expiry,
    validUntilLedger,
    approvals: [
      { purpose: "init", xdr: init.approval.toXDR("base64") },
      { purpose: "fund", xdr: transfer.approval.toXDR("base64") },
    ],
  };
}

export type ProvisionResult = { sessionId: string; token: string; agent: string; cap: string; expiry: number; fundTx: string };

export async function finishProvision(id: string, signedB64: string[]): Promise<ProvisionResult> {
  sweep();
  const p = pending.get(id);
  if (!p) throw new ProvisionError(404, "this setup expired or was already finished, start again");
  if (!Array.isArray(signedB64) || signedB64.length !== 2) throw new ProvisionError(400, "expected two signed approvals");
  let signedInit: xdr.SorobanAuthorizationEntry, signedTransfer: xdr.SorobanAuthorizationEntry;
  try {
    signedInit = xdr.SorobanAuthorizationEntry.fromXDR(signedB64[0]!, "base64");
    signedTransfer = xdr.SorobanAuthorizationEntry.fromXDR(signedB64[1]!, "base64");
  } catch {
    throw new ProvisionError(400, "approvals are not valid Stellar data");
  }
  // Check everything before spending any relayer fees.
  verifyApproval(signedInit, p.init.approval, p.owner, PASS);
  verifyApproval(signedTransfer, p.transfer.approval, p.owner, PASS);
  const bal = await xlmBalance(p.owner);
  if (bal == null) throw new ProvisionError(400, "this wallet isn't funded yet");
  if (bal * 1e7 < Number(p.fund) + 1e7) throw new ProvisionError(400, "this wallet doesn't hold enough XLM for the starting balance plus its 1 XLM minimum");
  if (!existsSync(SESSION_WASM)) throw new ProvisionError(503, "session_account.wasm not found on host");
  pending.delete(id); // one attempt per prepared setup

  const relayer = Keypair.fromSecret(process.env.VEIL_FEE_SECRET!);
  const wasm = readFileSync(SESSION_WASM);
  await submitOp(Operation.uploadContractWasm({ wasm }), relayer, "upload").catch(() => {}); // already uploaded is fine
  await submitOp(Operation.createCustomContract({ address: Address.fromString(relayer.publicKey()), wasmHash: hash(wasm), salt: p.salt }), relayer, "deploy");
  await submitOp(invokeWith(p.sessionId, "init", p.init.args, [signedInit]), relayer, "init");
  const { usdc_sac: TOKEN } = netDeployment();
  const fundTx = await submitOp(invokeWith(TOKEN, "transfer", p.transfer.args, [signedTransfer]), relayer, "fund");

  const token = `kage_sk_${randomBytes(12).toString("hex")}`;
  const dir = dirname(KEYFILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const map = existsSync(KEYFILE) ? JSON.parse(readFileSync(KEYFILE, "utf8")) : {};
  map[token] = { label: `user-${p.owner.slice(0, 6)}`, sessionId: p.sessionId, agentSecret: p.agentSecret };
  writeFileSync(KEYFILE, JSON.stringify(map, null, 2), { mode: 0o600 });
  reloadAgentKeys(); // the new token works right away, not after a restart

  return { sessionId: p.sessionId, token, agent: Keypair.fromSecret(p.agentSecret).publicKey(), cap: p.cap.toString(), expiry: p.expiry, fundTx };
}
