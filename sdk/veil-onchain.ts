// Veil on-chain engine (node/bun) — the shared keystone the MCP server, workflow
// engine and demo agent all call. No browser / Freighter dependency.
//
// payThroughSession() is the agent's one action: derive a stealth note, prove the
// Merkle insert (Groth16), and deposit it into the Veil ZK pool with `from` set to
// the agent's SessionAccount — authorising the deposit by signing the Soroban auth
// entry with the AGENT session key (never the owner's key). SessionAccount.__check_auth
// gates it: only Veil.deposit + USDC transfer→pool, within cap, before expiry.
//
// This is the previously-untested hop (see memory veil-agent-fabric): a custom-account
// (BytesN<64>) signature, built manually so the signature ScVal matches the contract.
import {
  rpc,
  Contract,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  Keypair,
  hash,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MerkleTree,
  deriveNoteForRecipient,
  nullifierHash,
  recipientField,
  bigToHex,
  type Note,
} from "./veil.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SDKB = join(ROOT, "sdk", "build");
const CIRCB = join(ROOT, "circuits", "build");

export const RPC_URL = process.env.VEIL_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const PASSPHRASE = Networks.TESTNET;

const INSERT_WASM = join(CIRCB, "veil_insert_js", "veil_insert.wasm");
const INSERT_ZKEY = join(CIRCB, "insert_final.zkey");

// ---- config (deployment + provisioned session) ------------------------------
type Deployment = { contract_id: string; usdc_sac: string };
type AgentFabric = { session: string; agent: string; agentSecret: string; pool: string; cap: number; expiry: number };

function readJson<T>(p: string): T | null {
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}

export function config() {
  const dep = readJson<Deployment>(join(SDKB, "veil_deployment.json"));
  const af = readJson<AgentFabric>(join(SDKB, "agent_fabric.json"));
  const VEIL = process.env.VEIL_CONTRACT ?? dep?.contract_id;
  const USDC = process.env.VEIL_USDC ?? dep?.usdc_sac;
  if (!VEIL || !USDC) throw new Error("missing Veil deployment (sdk/build/veil_deployment.json)");
  return { VEIL, USDC, session: af?.session, agentSecret: af?.agentSecret, cap: af?.cap, expiry: af?.expiry };
}

// ---- snarkjs Groth16 → Soroban BN254 byte layout (port of veil-browser) ------
type ProofHex = { a: string; b: string; c: string };
const toBE32 = (dec: string): string => {
  const h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error(`field element too large: ${dec}`);
  return h.padStart(64, "0");
};
const g1 = (p: string[]): string => toBE32(p[0]!) + toBE32(p[1]!);
const g2 = (p: string[][]): string => {
  const [xc0, xc1] = [toBE32(p[0]![0]!), toBE32(p[0]![1]!)];
  const [yc0, yc1] = [toBE32(p[1]![0]!), toBE32(p[1]![1]!)];
  return xc1 + xc0 + yc1 + yc0; // G2_IMAG_FIRST (matches the Soroban verifier)
};
const proofToHex = (p: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }): ProofHex => ({
  a: g1(p.pi_a),
  b: g2(p.pi_b),
  c: g1(p.pi_c),
});

const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex.padStart(64, "0"), "hex"));
const proofScVal = (p: ProofHex) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: xdr.ScVal.scvBytes(Buffer.from(p.a, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: xdr.ScVal.scvBytes(Buffer.from(p.b, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: xdr.ScVal.scvBytes(Buffer.from(p.c, "hex")) }),
  ]);

const server = () => new rpc.Server(RPC_URL);
const toHex = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString("hex") : "");

// ---- read-only pool / session views -----------------------------------------
async function simRead(contractId: string, method: string, ...args: xdr.ScVal[]) {
  const s = server();
  // a real-but-throwaway source for read-only simulation (the proven e2e payout addr)
  const src = await s.getAccount("GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y");
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}

export async function poolStatus(): Promise<{ contract: string; root: string; leafCount: number; usdcPooled: string | null }> {
  const { VEIL, USDC } = config();
  const [root, leafCount, bal] = await Promise.all([
    simRead(VEIL, "current_root"),
    simRead(VEIL, "leaf_count"),
    simRead(USDC, "balance", new Address(VEIL).toScVal()),
  ]);
  return { contract: VEIL, root: toHex(root), leafCount: Number(leafCount ?? 0), usdcPooled: bal != null ? String(bal) : null };
}

export async function remainingBudget(sessionId?: string): Promise<bigint> {
  const { session } = config();
  const sid = sessionId ?? session;
  if (!sid) throw new Error("no SessionAccount provisioned (run `bun run agent:fabric`)");
  const r = await simRead(sid, "remaining");
  return BigInt(r ?? 0);
}

// ---- rebuild the incremental tree from on-chain deposit events ----------------
const GENESIS_LEAF = "1d21a2d1a8a2898f5caa255f5d879bdf310a8a415e57495cf411e429b9f56d52";

async function rebuildTree(veil: string, leafCount: number): Promise<MerkleTree> {
  const tree = await MerkleTree.create();
  const found: { idx: number; commitment: bigint }[] = [];
  try {
    const s = server();
    const latest = await s.getLatestLedger();
    const res = await s.getEvents({
      startLedger: Math.max(1, latest.sequence - 17000),
      filters: [{ type: "contract", contractIds: [veil] }],
      limit: 1000,
    });
    for (const ev of res.events ?? []) {
      try {
        const v = scValToNative(ev.value) as unknown[];
        if (Array.isArray(v) && v.length >= 4 && v[0] instanceof Uint8Array) {
          const commitment = BigInt("0x" + Buffer.from(v[0]).toString("hex"));
          const idx = Number(v[3]);
          if (Number.isFinite(idx)) found.push({ idx, commitment });
        }
      } catch {}
    }
  } catch {}
  if (found.length > 0) found.sort((a, b) => a.idx - b.idx).forEach((f) => tree.insert(f.commitment));
  else if (leafCount > 0) tree.insert(BigInt("0x" + GENESIS_LEAF));
  return tree;
}

// ---- custom-account (SessionAccount) auth: sign the Soroban auth entry with the
//      agent ed25519 key. Signature ScVal = scvBytes(64) to match `Signature = BytesN<64>`.
function signSessionEntry(
  entry: xdr.SorobanAuthorizationEntry,
  agent: Keypair,
  validUntil: number,
): xdr.SorobanAuthorizationEntry {
  const creds = entry.credentials();
  // Source-account credentials are covered by the tx envelope signature — skip.
  if (creds.switch().name !== "sorobanCredentialsAddress") return entry;
  const addr = creds.address();
  addr.signatureExpirationLedger(validUntil);
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(PASSPHRASE)),
      nonce: addr.nonce(),
      signatureExpirationLedger: validUntil,
      invocation: entry.rootInvocation(),
    }),
  );
  const sig = agent.sign(hash(preimage.toXDR())); // raw 64-byte ed25519
  addr.signature(xdr.ScVal.scvBytes(sig));
  return entry;
}

// ---- the agent's action: a scoped, ZK-private payment through the SessionAccount
export type PayResult = {
  hash: string;
  commitment: string;
  ephemeralPub: string;
  leafIndex: number;
  newRoot: string;
  note: Note;
};

export async function payThroughSession(args: {
  recipientScanKey: string; // hex x25519 scan pubkey of the payee
  amount: bigint; // USDC, 7 decimals
  feeSourceSecret: string; // a funded G-account that pays the tx fee + submits (owner/relayer)
  sessionId?: string;
  agentSecret?: string; // the delegated session key (S...)
  onStep?: (s: string) => void;
}): Promise<PayResult> {
  const { VEIL, session: cfgSession, agentSecret: cfgAgent } = config();
  const sessionId = args.sessionId ?? cfgSession;
  const agentSecret = args.agentSecret ?? cfgAgent;
  if (!sessionId || !agentSecret) throw new Error("no SessionAccount provisioned (run `bun run agent:fabric`)");
  const { onStep } = args;
  const s = server();
  const agent = Keypair.fromSecret(agentSecret);
  const feeSource = Keypair.fromSecret(args.feeSourceSecret);

  onStep?.("reading pool state");
  const { leafCount } = await poolStatus();
  const tree = await rebuildTree(VEIL, leafCount);

  onStep?.("deriving stealth note");
  const note = await deriveNoteForRecipient(args.recipientScanKey, args.amount);
  const oldRoot = tree.root(); // root BEFORE inserting our leaf
  const leafIndex = tree.insert(note.commitment);
  const newRoot = tree.root();
  const { pathElements } = tree.proof(leafIndex);

  onStep?.("proving insert (Groth16)");
  const snarkjs: any = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(
    {
      oldRoot: String(oldRoot),
      newRoot: String(newRoot),
      commitment: String(note.commitment),
      leafIndex: String(leafIndex),
      amount: String(args.amount),
      secret: String(note.secret),
      nullifier: String(note.nullifier),
      pathElements: pathElements.map(String),
    },
    INSERT_WASM,
    INSERT_ZKEY,
  );
  const ph = proofToHex(proof);

  onStep?.("building deposit (from = SessionAccount)");
  const depositOp = new Contract(VEIL).call(
    "deposit",
    new Address(sessionId).toScVal(), // from = the SessionAccount contract
    bytes32(bigToHex(note.commitment)),
    bytes32(note.ephemeralPub),
    nativeToScVal(args.amount, { type: "i128" }),
    bytes32(bigToHex(newRoot)),
    nativeToScVal(leafIndex, { type: "u32" }),
    proofScVal(ph),
  );

  const src = await s.getAccount(feeSource.publicKey());
  const tx = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASSPHRASE })
    .addOperation(depositOp)
    .setTimeout(120)
    .build();

  onStep?.("simulating + signing session auth");
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`sim failed: ${JSON.stringify((sim as any).error ?? sim)}`);
  const latest = await s.getLatestLedger();
  const validUntil = latest.sequence + 1000;
  const entries = (sim.result?.auth ?? []).map((e) => signSessionEntry(e, agent, validUntil));

  // rebuild the op with our signed auth, then attach sim resources via assembleTransaction
  const hostFn = depositOp.body().invokeHostFunctionOp().hostFunction();
  const signedOp = Operation.invokeHostFunction({ func: hostFn, auth: entries });
  const txSigned = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASSPHRASE })
    .addOperation(signedOp)
    .setTimeout(120)
    .build();
  const prepared = rpc.assembleTransaction(txSigned, sim).build();

  onStep?.("submitting");
  prepared.sign(feeSource);
  const sent = await s.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  let got = await s.getTransaction(sent.hash);
  for (let i = 0; i < 40 && got.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    got = await s.getTransaction(sent.hash);
  }
  if (got.status !== "SUCCESS") throw new Error(`tx ${got.status}: ${sent.hash}`);

  return {
    hash: sent.hash,
    commitment: bigToHex(note.commitment),
    ephemeralPub: note.ephemeralPub,
    leafIndex,
    newRoot: bigToHex(newRoot),
    note,
  };
}

export { recipientField, nullifierHash };
