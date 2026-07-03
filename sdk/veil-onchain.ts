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
import { $ } from "bun";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
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

// Manifest genesis commitment (leaf 0 of a freshly-deployed pool). Used to seed the
// tree when RPC event retention has dropped the original deposit event.
const GENESIS_LEAF = "057206e8b530c5dae19f754d6072f1ef375df2501bfd9144e294e7262b8466a7";

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
// The RPC returns events in pages (a single call can miss recent leaves), so we
// paginate to collect EVERY deposit. Reconstructing the exact prior leaf set is
// required: the insert proof's oldRoot must equal the pool's current root and the
// leaf index must equal the pool's leaf_count, or the deposit reverts (StaleRoot /
// BadLeafIndex). We verify the rebuilt tree against `leafCount` before returning.
async function rebuildTree(veil: string, leafCount: number): Promise<MerkleTree> {
  const tree = await MerkleTree.create();
  const byIdx = new Map<number, bigint>();
  const s = server();
  const latest = await s.getLatestLedger();
  let cursor: string | undefined;
  let startLedger: number | undefined = Math.max(1, latest.sequence - 16000);
  for (let page = 0; page < 20; page++) {
    const res = await s.getEvents(
      cursor
        ? { filters: [{ type: "contract", contractIds: [veil] }], limit: 200, cursor }
        : { startLedger: startLedger!, filters: [{ type: "contract", contractIds: [veil] }], limit: 200 },
    );
    for (const ev of res.events ?? []) {
      const topics = (ev.topic ?? []).map((t) => {
        try {
          return String(scValToNative(t));
        } catch {
          return "";
        }
      });
      if (!topics.includes("deposit")) continue;
      try {
        const v = scValToNative(ev.value) as unknown[];
        if (Array.isArray(v) && v[0] instanceof Uint8Array && Number.isFinite(Number(v[3]))) {
          byIdx.set(Number(v[3]), BigInt("0x" + Buffer.from(v[0]).toString("hex")));
        }
      } catch {}
    }
    cursor = res.cursor;
    startLedger = undefined;
    if (!res.events || res.events.length === 0) break;
  }
  // The freshly-deployed pool's leaf 0 is the manifest genesis commitment (the e2e
  // deposit veil-deploy.ts makes). Public testnet RPC event retention can drop that
  // event out of the query window, so seed leaf 0 from the known constant when the
  // scan missed it — this reconstructs the REAL tree (its root equals the pool's
  // current_root), it does not fabricate state. Matches frontend/lib/veil-chain.ts.
  if (byIdx.get(0) === undefined && leafCount >= 1) {
    byIdx.set(0, BigInt("0x" + GENESIS_LEAF));
  }

  // Insert leaves in index order (0..leafCount-1).
  for (let i = 0; i < leafCount; i++) {
    const c = byIdx.get(i);
    if (c === undefined) {
      throw new Error(`could not rebuild pool tree: missing deposit event for leaf ${i} (found ${byIdx.size}/${leafCount})`);
    }
    tree.insert(c);
  }
  return tree;
}

// Keep the scoped session alive. Session policies carry an `expiry`; once past it,
// __check_auth returns Expired and the agent's deposit traps. If the fee/submit source
// IS the session owner (the common demo case), auto-extend before paying so a lapsed
// policy never blocks a run. If it isn't the owner, we leave it (only the owner may extend).
export async function ensureSessionLive(sessionId: string, ownerSecret: string): Promise<{ extended: boolean; expiry: number }> {
  const p = (await simRead(sessionId, "policy")) as { owner?: string; cap?: bigint | number; expiry?: bigint | number } | null;
  if (!p || p.expiry == null) return { extended: false, expiry: 0 };
  const expiry = Number(p.expiry);
  const now = Math.floor(Date.now() / 1000);
  if (expiry > now + 300) return { extended: false, expiry }; // still live (5-min buffer)

  const owner = Keypair.fromSecret(ownerSecret);
  if (String(p.owner) !== owner.publicKey()) return { extended: false, expiry }; // not the owner — can't extend

  const newExpiry = now + 30 * 24 * 3600;
  const s = server();
  const src = await s.getAccount(owner.publicKey());
  const op = new Contract(sessionId).call(
    "extend",
    nativeToScVal(BigInt(p.cap ?? 0), { type: "i128" }),
    nativeToScVal(newExpiry, { type: "u64" }),
  );
  const tx = new TransactionBuilder(src, { fee: "1000000", networkPassphrase: PASSPHRASE }).addOperation(op).setTimeout(60).build();
  const prepared = await s.prepareTransaction(tx);
  prepared.sign(owner);
  const sent = await s.sendTransaction(prepared);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const g = await s.getTransaction(sent.hash);
      if (g.status !== "NOT_FOUND") break;
    } catch {}
  }
  return { extended: true, expiry: newExpiry };
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
  // Read the values BACK off the entry so the signed preimage matches byte-for-byte
  // what the host reconstructs from the submitted entry (a mismatch => __check_auth
  // ed25519_verify halts => invokeHostFunctionTrapped).
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(PASSPHRASE)),
      nonce: addr.nonce(),
      signatureExpirationLedger: addr.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    }),
  );
  const sig = agent.sign(hash(preimage.toXDR())); // raw 64-byte ed25519 over the payload
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

  onStep?.("checking session policy");
  const live = await ensureSessionLive(sessionId, args.feeSourceSecret);
  if (live.extended) onStep?.("session had lapsed — auto-extended 30d");

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
  // snarkjs' web-worker crashes when imported in-process under Bun on Windows, so
  // run the proof in the node-based snarkjs CLI (a subprocess) instead.
  const stamp = Date.now();
  const inPath = join(CIRCB, `agent_insert_input_${stamp}.json`);
  const proofPath = join(CIRCB, `agent_insert_proof_${stamp}.json`);
  const publicPath = join(CIRCB, `agent_insert_public_${stamp}.json`);
  writeFileSync(
    inPath,
    JSON.stringify({
      oldRoot: String(oldRoot),
      newRoot: String(newRoot),
      commitment: String(note.commitment),
      leafIndex: String(leafIndex),
      amount: String(args.amount),
      secret: String(note.secret),
      nullifier: String(note.nullifier),
      pathElements: pathElements.map(String),
    }),
  );
  const snarkjsCli = join(ROOT, "node_modules", "snarkjs", "build", "cli.cjs");
  await $`node ${snarkjsCli} groth16 fullprove ${inPath} ${INSERT_WASM} ${INSERT_ZKEY} ${proofPath} ${publicPath}`.quiet();
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  for (const p of [inPath, proofPath, publicPath]) try { rmSync(p); } catch {}
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

  // Re-simulate WITH the signed auth so the footprint includes everything
  // __check_auth reads (the SessionAccount's own contract instance/policy). A
  // footprint from the unsigned first simulation omits those keys and the deposit
  // traps at execution with scecExceededLimit ("outside of the footprint").
  const hostFn = depositOp.body().invokeHostFunctionOp().hostFunction();
  const signedOp = Operation.invokeHostFunction({ func: hostFn, auth: entries });
  const srcSim = await s.getAccount(feeSource.publicKey());
  const txAuthed = new TransactionBuilder(srcSim, { fee: "2000000", networkPassphrase: PASSPHRASE })
    .addOperation(signedOp)
    .setTimeout(120)
    .build();
  const sim2 = await s.simulateTransaction(txAuthed);
  if (!rpc.Api.isSimulationSuccess(sim2)) throw new Error(`sim2 failed: ${JSON.stringify((sim2 as any).error ?? sim2)}`);

  // Build the FINAL tx from the signed op + the (complete) footprint from sim2. Don't
  // route it through assembleTransaction — that re-applies unsigned auth. Fresh account
  // so the submitted tx has the correct next sequence.
  const prepared = rpc.assembleTransaction(txAuthed, sim2).build();
  const sorobanData = prepared.toEnvelope().v1().tx().ext().sorobanData();
  const src2 = await s.getAccount(feeSource.publicKey());
  const finalTx = new TransactionBuilder(src2, { fee: prepared.fee, networkPassphrase: PASSPHRASE })
    .addOperation(signedOp)
    .setSorobanData(sorobanData)
    .setTimeout(120)
    .build();

  onStep?.("submitting");
  finalTx.sign(feeSource);
  const sent = await s.sendTransaction(finalTx);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  // Poll defensively: @stellar/js-xdr can throw parsing result meta under Bun on
  // Windows even when the tx itself succeeded, so tolerate parse errors and retry.
  let finalStatus = "PENDING";
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const got = await s.getTransaction(sent.hash);
      if (got.status !== "NOT_FOUND") { finalStatus = got.status; break; }
    } catch { /* xdr parse hiccup — keep polling */ }
  }
  if (finalStatus === "FAILED") throw new Error(`tx FAILED: ${sent.hash}`);

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
