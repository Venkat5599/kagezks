// Converts snarkjs Groth16 artifacts for the Veil withdraw circuit into the
// raw BN254 byte layout the Soroban verifier expects.
//
//   bun run sdk/veil-convert.ts
//
// Byte layout (mirrors EIP-197 / Stellar BN254):
//   Fr 32B big-endian; G1 = x||y (64B); G2 = x_c1||x_c0||y_c1||y_c0 (128B).
// snarkjs stores G2 as [[x_c0,x_c1],[y_c0,y_c1]] so each pair is swapped.
//
// The Veil circuit has 4 public inputs (root, nullifierHash, recipient, amount),
// so vk.IC has length 5. Unlike Ledgerproof, ALL four public inputs are passed
// to `withdraw` at call time (the contract supplies `root` from its own tree and
// the caller supplies the rest), so this only emits vk + proof bytes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const G2_IMAG_FIRST = true; // flip if the on-chain pairing_check returns false

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const OUT = join(import.meta.dir, "build");
mkdirSync(OUT, { recursive: true });

const toBE32 = (dec: string): string => {
  const h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error(`field element too large: ${dec}`);
  return h.padStart(64, "0");
};
const g1 = (p: string[]): string => toBE32(p[0]) + toBE32(p[1]);
const g2 = (p: string[][]): string => {
  const [xc0, xc1] = [toBE32(p[0][0]), toBE32(p[0][1])];
  const [yc0, yc1] = [toBE32(p[1][0]), toBE32(p[1][1])];
  return G2_IMAG_FIRST ? xc1 + xc0 + yc1 + yc0 : xc0 + xc1 + yc0 + yc1;
};

const vk = JSON.parse(readFileSync(join(BUILD, "veil_vk.json"), "utf8"));
const proof = JSON.parse(readFileSync(join(BUILD, "veil_proof.json"), "utf8"));

const vkBytes = {
  alpha: g1(vk.vk_alpha_1),
  beta: g2(vk.vk_beta_2),
  gamma: g2(vk.vk_gamma_2),
  delta: g2(vk.vk_delta_2),
  ic: (vk.IC as string[][]).map(g1),
};
const proofBytes = { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) };

writeFileSync(join(OUT, "veil_vk.json"), JSON.stringify(vkBytes, null, 2));
writeFileSync(join(OUT, "veil_proof.json"), JSON.stringify(proofBytes, null, 2));

console.log("converted veil snarkjs -> Soroban BN254 bytes");
console.log(`  G2_IMAG_FIRST = ${G2_IMAG_FIRST}`);
console.log(`  ic length     = ${vkBytes.ic.length} (expect public_inputs + 1 = 5)`);
console.log(`  -> ${join(OUT, "veil_vk.json")}`);
console.log(`  -> ${join(OUT, "veil_proof.json")}`);
