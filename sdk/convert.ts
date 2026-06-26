// Converts snarkjs Groth16 artifacts (BN254) into the raw byte layout the
// Soroban verifier expects, emitting JSON arg files for `stellar contract invoke`.
//
//   bun run sdk/convert.ts
//
// Byte layout (Soroban BN254, mirrors the Ethereum alt_bn128 precompiles):
//   Fr  : 32 bytes big-endian
//   G1  : x(32) || y(32)                       = 64 bytes
//   G2  : x_c1(32) || x_c0(32) || y_c1(32) || y_c0(32) = 128 bytes
//         (imaginary component first — the EIP-197 ordering Stellar mirrors)
//
// snarkjs stores G2 as [[x_c0, x_c1], [y_c0, y_c1]], so we swap each pair.
// If the on-chain pairing_check returns false, flip G2_IMAG_FIRST and retry —
// this is the single most common Groth16-on-chain wiring bug.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const G2_IMAG_FIRST = true; // EIP-197 ordering; flip if pairing fails

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const OUT = join(import.meta.dir, "build");
mkdirSync(OUT, { recursive: true });

const toBE32 = (dec: string): string => {
  let h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error(`field element too large: ${dec}`);
  return h.padStart(64, "0");
};

const g1 = (p: string[]): string => toBE32(p[0]) + toBE32(p[1]);

const g2 = (p: string[][]): string => {
  const [xc0, xc1] = [toBE32(p[0][0]), toBE32(p[0][1])];
  const [yc0, yc1] = [toBE32(p[1][0]), toBE32(p[1][1])];
  return G2_IMAG_FIRST ? xc1 + xc0 + yc1 + yc0 : xc0 + xc1 + yc0 + yc1;
};

const vk = JSON.parse(readFileSync(join(BUILD, "verification_key.json"), "utf8"));
const proof = JSON.parse(readFileSync(join(BUILD, "proof.json"), "utf8"));
const pub = JSON.parse(readFileSync(join(BUILD, "public.json"), "utf8"));

const vkBytes = {
  alpha: g1(vk.vk_alpha_1),
  beta: g2(vk.vk_beta_2),
  gamma: g2(vk.vk_gamma_2),
  delta: g2(vk.vk_delta_2),
  ic: (vk.IC as string[][]).map(g1),
};

const proofBytes = {
  a: g1(proof.pi_a),
  b: g2(proof.pi_b),
  c: g1(proof.pi_c),
};

// public.json = [liabilities_root, total_reserves]; the contract derives
// total_reserves from chain, so we only forward liabilities_root.
const liabilities_root = toBE32(pub[0]);

writeFileSync(join(OUT, "vk.json"), JSON.stringify(vkBytes, null, 2));
writeFileSync(join(OUT, "proof.json"), JSON.stringify(proofBytes, null, 2));
writeFileSync(join(OUT, "root.txt"), liabilities_root);

console.log("converted snarkjs -> Soroban BN254 bytes");
console.log(`  G2_IMAG_FIRST = ${G2_IMAG_FIRST}`);
console.log(`  ic length     = ${vkBytes.ic.length} (expect public_inputs + 1 = 3)`);
console.log(`  liabilities_root = ${liabilities_root}`);
console.log(`  -> ${join(OUT, "vk.json")}`);
console.log(`  -> ${join(OUT, "proof.json")}`);
console.log(`  -> ${join(OUT, "root.txt")}`);
