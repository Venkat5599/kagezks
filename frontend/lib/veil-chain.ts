// Veil chain layer (browser): read pool state, rebuild the Merkle tree from
// deposit events, generate Groth16 proofs with snarkjs, and build + submit
// signed deposit / withdraw transactions through a connected wallet.
import {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  MerkleTree,
  recognizeNote,
  nullifierHash,
  recipientField,
  stealthSeed,
  proofToHex,
  bigToHex,
  type ProofHex,
  type Note,
} from "./veil-browser";

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const CONTRACT = "CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD";
export const USDC_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
// Known genesis leaf (the proven e2e deposit) — used to seed the tree if the
// original deposit events have aged out of RPC's retention window.
const GENESIS_LEAF = "1d21a2d1a8a2898f5caa255f5d879bdf310a8a415e57495cf411e429b9f56d52";

const server = () => new rpc.Server(RPC_URL);
const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex.padStart(64, "0"), "hex"));
const proofScVal = (p: ProofHex) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: xdr.ScVal.scvBytes(Buffer.from(p.a, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: xdr.ScVal.scvBytes(Buffer.from(p.b, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: xdr.ScVal.scvBytes(Buffer.from(p.c, "hex")) }),
  ]);

async function simRead(method: string, ...args: xdr.ScVal[]) {
  const s = server();
  // a throwaway-but-real source for read-only simulation
  const src = await s.getAccount("GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y");
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(CONTRACT).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}

export async function poolState(): Promise<{ root: string; leafCount: number }> {
  const root = await simRead("current_root");
  const leafCount = await simRead("leaf_count");
  const toHex = (b: unknown) => (b instanceof Uint8Array ? Buffer.from(b).toString("hex") : "");
  return { root: toHex(root), leafCount: Number(leafCount ?? 0) };
}

// Rebuild the incremental tree from deposit events; seed with the known genesis
// leaf if events have aged out but the pool already has notes.
export async function rebuildTree(leafCount: number): Promise<MerkleTree> {
  const tree = new MerkleTree();
  const found: { idx: number; commitment: bigint }[] = [];
  try {
    const s = server();
    const latest = await s.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - 17000);
    const res = await s.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [CONTRACT] }],
      limit: 1000,
    });
    for (const ev of res.events ?? []) {
      try {
        const v = scValToNative(ev.value) as unknown[];
        if (Array.isArray(v) && v.length >= 4) {
          const commitment = v[0] instanceof Uint8Array ? BigInt("0x" + Buffer.from(v[0]).toString("hex")) : null;
          const idx = Number(v[3]);
          if (commitment !== null && Number.isFinite(idx)) found.push({ idx, commitment });
        }
      } catch {}
    }
  } catch {}

  if (found.length > 0) {
    found.sort((a, b) => a.idx - b.idx).forEach((f) => tree.insert(f.commitment));
  } else if (leafCount > 0) {
    tree.insert(BigInt("0x" + GENESIS_LEAF)); // demo fallback: leaf 0
  }
  return tree;
}

export type SignFn = (xdrB64: string) => Promise<string>;

async function submit(opXdr: xdr.Operation, sourcePub: string, sign: SignFn): Promise<string> {
  const s = server();
  const src = await s.getAccount(sourcePub);
  const built = new TransactionBuilder(src, { fee: "1000000", networkPassphrase: Networks.TESTNET })
    .addOperation(opXdr)
    .setTimeout(120)
    .build();
  const prepared = await s.prepareTransaction(built);
  const signedXdr = await sign(prepared.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const sent = await s.sendTransaction(signedTx);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  let got = await s.getTransaction(sent.hash);
  for (let i = 0; i < 30 && got.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    got = await s.getTransaction(sent.hash);
  }
  if (got.status !== "SUCCESS") throw new Error(`tx ${got.status}: ${sent.hash}`);
  return sent.hash;
}

// ---- DEPOSIT: derive note, prove insert, sign + submit -----------------------
export type DepositResult = { hash: string; note: Note; leafIndex: number; newRoot: string };

export async function deposit(
  sourcePub: string,
  scanPubHex: string,
  amount: bigint,
  sign: SignFn,
  onStep?: (s: string) => void,
): Promise<DepositResult> {
  onStep?.("reading pool state");
  const { leafCount } = await poolState();
  const tree = await rebuildTree(leafCount);
  const oldRoot = tree.root();

  onStep?.("deriving stealth note");
  const { deriveNoteForRecipient } = await import("./veil-browser");
  const note = deriveNoteForRecipient(scanPubHex, amount);
  const leafIndex = tree.insert(note.commitment);
  const newRoot = tree.root();
  const { pathElements } = tree.proof(leafIndex);

  onStep?.("proving insert (Groth16)");
  const input = {
    oldRoot: String(oldRoot),
    newRoot: String(newRoot),
    commitment: String(note.commitment),
    leafIndex: String(leafIndex),
    amount: String(amount),
    secret: String(note.secret),
    nullifier: String(note.nullifier),
    pathElements: pathElements.map(String),
  };
  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(input, "/zk/veil_insert.wasm", "/zk/insert_final.zkey");
  const ph = proofToHex(proof);

  onStep?.("submitting deposit");
  const op = new Contract(CONTRACT).call(
    "deposit",
    new Address(sourcePub).toScVal(),
    bytes32(bigToHex(note.commitment)),
    bytes32(note.ephemeralPub),
    nativeToScVal(amount, { type: "i128" }),
    bytes32(bigToHex(newRoot)),
    nativeToScVal(leafIndex, { type: "u32" }),
    proofScVal(ph),
  );
  const hash = await submit(op, sourcePub, sign);
  return { hash, note, leafIndex, newRoot: bigToHex(newRoot) };
}

// ---- WITHDRAW: recognise note, prove membership, pay stealth addr -------------
export type WithdrawResult = { hash: string; stealthAddress: string; nullifierHash: string };

export async function withdraw(
  sourcePub: string,
  scanPrivHex: string,
  ephemeralPubHex: string,
  amount: bigint,
  toStealthAddress: string,
  sign: SignFn,
  onStep?: (s: string) => void,
): Promise<WithdrawResult> {
  onStep?.("rebuilding pool tree");
  const { leafCount } = await poolState();
  const tree = await rebuildTree(leafCount);

  onStep?.("locating your note");
  let idx = -1;
  let note: Note | null = null;
  for (let i = 0; i < tree.leaves.length; i++) {
    const n = recognizeNote(scanPrivHex, ephemeralPubHex, amount, tree.leaves[i]!);
    if (n) { idx = i; note = n; break; }
  }
  if (!note || idx < 0) throw new Error("note not found in pool (wrong key, amount, or aged-out events)");

  const { pathElements, pathIndices, root } = tree.proof(idx);
  const nh = nullifierHash(note.nullifier);
  const recipient = recipientField(toStealthAddress);

  onStep?.("proving membership (Groth16)");
  const input = {
    root: String(root),
    nullifierHash: String(nh),
    recipient: String(recipient),
    amount: String(amount),
    secret: String(note.secret),
    nullifier: String(note.nullifier),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  };
  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(input, "/zk/veil_withdraw.wasm", "/zk/veil_final.zkey");
  const ph = proofToHex(proof);

  onStep?.("submitting withdraw");
  const op = new Contract(CONTRACT).call(
    "withdraw",
    proofScVal(ph),
    bytes32(bigToHex(root)),
    bytes32(bigToHex(nh)),
    new Address(toStealthAddress).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
  );
  const hash = await submit(op, sourcePub, sign);
  return { hash, stealthAddress: toStealthAddress, nullifierHash: bigToHex(nh) };
}

export { stealthSeed };
