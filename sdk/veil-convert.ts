// Converts the Veil snarkjs Groth16 artifacts (both circuits) into the raw
// BN254 byte layout the Soroban verifier expects, emitting JSON arg files for
// `stellar contract invoke --<arg>-file-path`.
//
//   bun run sdk/veil-convert.ts
//
// Byte layout (EIP-197 / Stellar BN254):
//   Fr 32B big-endian; G1 = x||y (64B); G2 = x_c1||x_c0||y_c1||y_c0 (128B).
// snarkjs stores G2 as [[x_c0,x_c1],[y_c0,y_c1]] so each pair is swapped.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

const vkBytes = (vk: any) => ({
  alpha: g1(vk.vk_alpha_1),
  beta: g2(vk.vk_beta_2),
  gamma: g2(vk.vk_gamma_2),
  delta: g2(vk.vk_delta_2),
  ic: (vk.IC as string[][]).map(g1),
});
const proofBytes = (p: any) => ({ a: g1(p.pi_a), b: g2(p.pi_b), c: g1(p.pi_c) });

const read = (f: string) => JSON.parse(readFileSync(join(BUILD, f), "utf8"));
const write = (f: string, o: unknown) => writeFileSync(join(OUT, f), JSON.stringify(o, null, 2));

// Verification keys (always present after setup).
const insertVk = vkBytes(read("insert_vk.json"));
const withdrawVk = vkBytes(read("veil_vk.json"));
write("insert_vk.json", insertVk);
write("withdraw_vk.json", withdrawVk);
console.log(`insert vk   ic length = ${insertVk.ic.length} (expect 6)`);
console.log(`withdraw vk ic length = ${withdrawVk.ic.length} (expect 5)`);

// e2e proofs (present after the prove step).
if (existsSync(join(BUILD, "e2e_insert_proof.json"))) {
  write("e2e_insert_proof.json", proofBytes(read("e2e_insert_proof.json")));
  console.log("converted e2e insert proof");
}
if (existsSync(join(BUILD, "e2e_withdraw_proof.json"))) {
  write("e2e_withdraw_proof.json", proofBytes(read("e2e_withdraw_proof.json")));
  console.log("converted e2e withdraw proof");
}
console.log(`  -> ${OUT}`);
