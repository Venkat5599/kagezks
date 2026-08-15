// Kage — Fee Sponsorship demo (Black Belt advanced feature).
// Demonstrates "gasless transactions using fee bump": a user signs a deposit
// with base fee 0, and the admin (sponsor) wraps it in a fee-bump transaction
// that pays the Soroban resource fee. The user pays nothing.
//
//   VEIL_ADMIN_SECRET=S... VEIL_CONTRACT=C... bun run scripts/fee-sponsor-demo.ts
import {
  Keypair,
  rpc,
  Contract,
  Operation,
  TransactionBuilder,
  FeeBumpTransaction,
  Networks,
  Address,
  nativeToScVal,
  xdr,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { Horizon } from "@stellar/stellar-sdk";
import { $ } from "bun";
import { readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  MerkleTree,
  generateMetaAddress,
  deriveNoteForRecipient,
  bigToHex,
} from "../sdk/kage.ts";

const RPC_URL = "https://mainnet.sorobanrpc.com";
const HORIZON_URL = "https://horizon.stellar.org";
const NET = Networks.PUBLIC;
const EXPLORER = "https://stellar.expert/explorer/public/tx/";
const AMOUNT = 10_000_000n; // 1 XLM

const ADMIN_SECRET = process.env.VEIL_ADMIN_SECRET;
const VEIL = process.env.VEIL_CONTRACT;
if (!ADMIN_SECRET || !VEIL) { console.error("set VEIL_ADMIN_SECRET and VEIL_CONTRACT"); process.exit(1); }

const ROOT = join(import.meta.dir, "..");
const INSERT_WASM = join(ROOT, "frontend", "public", "zk", "veil_insert.wasm");
const INSERT_ZKEY = join(ROOT, "frontend", "public", "zk", "insert_final.zkey");
const SNARKJS_CLI = join(ROOT, "node_modules", "snarkjs", "build", "cli.cjs");
const LEAVES_FILE = join(ROOT, "scripts", "pool-leaves.json");

const admin = Keypair.fromSecret(ADMIN_SECRET);
const s = new rpc.Server(RPC_URL);
const hz = new Horizon.Server(HORIZON_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const toBE32 = (dec: string) => BigInt(dec).toString(16).padStart(64, "0");
const g1 = (p: string[]) => toBE32(p[0]!) + toBE32(p[1]!);
const g2 = (p: string[][]) => {
  const [xc0, xc1] = [toBE32(p[0]![0]!), toBE32(p[0]![1]!)];
  const [yc0, yc1] = [toBE32(p[1]![0]!), toBE32(p[1]![1]!)];
  return xc1 + xc0 + yc1 + yc0;
};
const proofToHex = (p: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }) => ({ a: g1(p.pi_a), b: g2(p.pi_b), c: g1(p.pi_c) });
const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex.padStart(64, "0"), "hex"));
const proofScVal = (p: { a: string; b: string; c: string }) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: xdr.ScVal.scvBytes(Buffer.from(p.a, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: xdr.ScVal.scvBytes(Buffer.from(p.b, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: xdr.ScVal.scvBytes(Buffer.from(p.c, "hex")) }),
  ]);

async function snarkProve(input: Record<string, unknown>, wasm: string, zkey: string) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inPath = `/tmp/kage_fb_${stamp}_input.json`;
  const proofPath = `/tmp/kage_fb_${stamp}_proof.json`;
  const publicPath = `/tmp/kage_fb_${stamp}_public.json`;
  writeFileSync(inPath, JSON.stringify(input));
  await $`node ${SNARKJS_CLI} groth16 fullprove ${inPath} ${wasm} ${zkey} ${proofPath} ${publicPath}`.quiet();
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  for (const p of [inPath, proofPath, publicPath]) try { rmSync(p); } catch {}
  return proof;
}

async function main() {
  // 1. Rebuild the tree from the local leaf store.
  const tree = await MerkleTree.create();
  const leaves = JSON.parse(readFileSync(LEAVES_FILE, "utf8")) as Record<string, string>;
  for (const [idx, hex] of Object.entries(leaves)) tree.insert(BigInt("0x" + hex));
  const leafCount = tree.leaves.length;
  console.log(`pool tree: ${leafCount} leaves, root ${tree.root().toString(16).slice(0, 16)}…`);

  // 2. A sponsored user (min balance only — it cannot afford fees on its own).
  const user = Keypair.random();
  const usrc = await hz.loadAccount(admin.publicKey());
  const createTx = new TransactionBuilder(usrc, { fee: BASE_FEE, networkPassphrase: NET })
    .addOperation(Operation.createAccount({ destination: user.publicKey(), startingBalance: "1.5" }))
    .setTimeout(30).build();
  createTx.sign(admin);
  const createRes = await hz.submitTransaction(createTx);
  console.log(`funded sponsored user ${user.publicKey()} (1.5 XLM, min balance)`);

  // 3. Derive a note + insert proof.
  const meta = generateMetaAddress();
  const note = await deriveNoteForRecipient(meta.scanPub, AMOUNT);
  const oldRoot = tree.root();
  const leafIndex = tree.insert(note.commitment);
  const newRoot = tree.root();
  const { pathElements } = tree.proof(leafIndex);
  const input = {
    oldRoot: String(oldRoot), newRoot: String(newRoot), commitment: String(note.commitment),
    leafIndex: String(leafIndex), amount: String(AMOUNT), secret: String(note.secret),
    nullifier: String(note.nullifier), pathElements: pathElements.map(String),
  };
  const proof = await snarkProve(input, INSERT_WASM, INSERT_ZKEY);
  const ph = proofToHex(proof);

  // 4. Build the deposit with base fee 0 (gasless for the user), assemble, sign.
  const op = new Contract(VEIL).call(
    "deposit",
    new Address(user.publicKey()).toScVal(),
    bytes32(bigToHex(note.commitment)),
    bytes32(note.ephemeralPub),
    nativeToScVal(AMOUNT, { type: "i128" }),
    bytes32(bigToHex(newRoot)),
    nativeToScVal(leafIndex, { type: "u32" }),
    proofScVal(ph),
  );
  const usrc2 = await s.getAccount(user.publicKey());
  const innerBase = new TransactionBuilder(usrc2, { fee: "0", networkPassphrase: NET })
    .addOperation(op).setTimeout(120).build();
  const sim = await s.simulateTransaction(innerBase);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`sim failed: ${JSON.stringify((sim as any).error)}`);
  const assembled = rpc.assembleTransaction(innerBase, sim).build();
  const sorobanData = assembled.toEnvelope().v1().tx().ext().sorobanData();
  const inner = new TransactionBuilder(usrc2, { fee: "0", networkPassphrase: NET })
    .addOperation(op).setSorobanData(sorobanData).setTimeout(120).build();
  inner.sign(user);

  // 5. Wrap in a fee-bump; the admin (sponsor) pays the fee.
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    admin, "1000000", inner, NET,
  );
  feeBump.sign(admin);

  // 6. Submit the fee-bump envelope.
  const sent = await s.sendTransaction(feeBump.toEnvelope().toXDR("base64") as any);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const r = await fetch(`${HORIZON_URL}/transactions/${sent.hash}`);
    if (r.status === 200) {
      const j = (await r.json()) as { successful?: boolean };
      if (j.successful === true) {
        console.log(`\nFEE-SPONSORED DEPOSIT SUCCEEDED (gasless for user):`);
        console.log(`  user    ${user.publicKey()}`);
        console.log(`  deposit ${EXPLORER}${sent.hash}`);
        console.log(`  leaf    ${leafIndex}`);
        appendFileSync(join(ROOT, "scripts", "fee-sponsor-proof.txt"),
          `Fee-sponsored deposit (gasless via fee bump):\n  user: ${user.publicKey()}\n  tx: ${EXPLORER}${sent.hash}\n\n`);
        return;
      }
      throw new Error(`FAILED: ${sent.hash}`);
    }
  }
  throw new Error("timed out");
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
