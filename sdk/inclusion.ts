// Customer Merkle-inclusion proof against the published liabilities_root.
//
//   bun run sdk/inclusion.ts <customerId>
//
// Defeats the FTX "omit some liabilities to look solvent" fraud: every
// customer can independently confirm their exact balance was inside the
// total that was proven solvent — without trusting the issuer. If the issuer
// had dropped a leaf, the recomputed root would not match the on-chain root.
//
// Reconstructs the same Poseidon Merkle-SUM tree as circuits/merkle_sum.circom
// (parent = Poseidon(L, R, sumL + sumR)) from the seeded ledger, derives the
// authentication path for one leaf, and verifies it rebuilds the root.
import { buildPoseidon } from "circomlibjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUILD = join(import.meta.dir, "..", "circuits", "build");

export type PathNode = { siblingHash: string; siblingSum: string; currentIsLeft: boolean };
export type InclusionProof = {
  id: string;
  balance: string;
  salt: string;
  leafHash: string;
  path: PathNode[];
  root: string;
};

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toBig = (x: any): bigint => F.toObject(x);
const H = (a: bigint, b: bigint, c: bigint): bigint => toBig(poseidon([a, b, c]));

type Ledger = {
  levels: number;
  leaves: { id: string; balance: string; salt: string; leafHash: string }[];
  liabilities_root: string;
};

function buildTree(led: Ledger) {
  const N = led.leaves.length;
  const TOT = 2 * N - 1;
  const h: bigint[] = new Array(TOT).fill(0n);
  const s: bigint[] = new Array(TOT).fill(0n);
  for (let i = 0; i < N; i++) {
    const l = led.leaves[i];
    h[N - 1 + i] = H(BigInt(l.id), BigInt(l.balance), BigInt(l.salt));
    s[N - 1 + i] = BigInt(l.balance);
  }
  for (let i = N - 2; i >= 0; i--) {
    s[i] = s[2 * i + 1] + s[2 * i + 2];
    h[i] = H(h[2 * i + 1], h[2 * i + 2], s[i]);
  }
  return { h, s, N };
}

export function proveInclusion(led: Ledger, customerId: string): InclusionProof {
  const idx = led.leaves.findIndex((l) => l.id === customerId);
  if (idx < 0) throw new Error(`customer ${customerId} not in ledger`);
  const { h, s, N } = buildTree(led);

  let node = N - 1 + idx;
  const path: PathNode[] = [];
  while (node > 0) {
    const currentIsLeft = node % 2 === 1; // left children are odd in this heap
    const sibling = currentIsLeft ? node + 1 : node - 1;
    path.push({
      siblingHash: h[sibling].toString(),
      siblingSum: s[sibling].toString(),
      currentIsLeft,
    });
    node = (node - 1) >> 1;
  }

  const leaf = led.leaves[idx];
  return {
    id: leaf.id,
    balance: leaf.balance,
    salt: leaf.salt,
    leafHash: h[N - 1 + idx].toString(),
    path,
    root: h[0].toString(),
  };
}

// Pure verifier a customer can run with only (leaf, path, publishedRoot).
export function verifyInclusion(p: InclusionProof, publishedRoot: string): boolean {
  let curHash = H(BigInt(p.id), BigInt(p.balance), BigInt(p.salt));
  let curSum = BigInt(p.balance);
  for (const step of p.path) {
    const sibHash = BigInt(step.siblingHash);
    const sibSum = BigInt(step.siblingSum);
    if (step.currentIsLeft) {
      curHash = H(curHash, sibHash, curSum + sibSum);
    } else {
      curHash = H(sibHash, curHash, sibSum + curSum);
    }
    curSum = curSum + sibSum;
  }
  return curHash.toString() === publishedRoot;
}

if (import.meta.main) {
  const customerId = process.argv[2] ?? "1004";
  const led: Ledger = JSON.parse(readFileSync(join(BUILD, "ledger.json"), "utf8"));
  const proof = proveInclusion(led, customerId);
  const ok = verifyInclusion(proof, led.liabilities_root);
  console.log(`customer ${proof.id}: balance = ${proof.balance}`);
  console.log(`  leafHash = ${proof.leafHash}`);
  console.log(`  path length = ${proof.path.length} (= tree depth)`);
  console.log(`  recomputed root matches published root: ${ok ? "YES ✅" : "NO ❌"}`);
  console.log(`  published liabilities_root = ${led.liabilities_root}`);
}
