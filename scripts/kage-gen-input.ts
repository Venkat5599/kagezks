// Generates a valid withdraw witness for circuits/veil_withdraw.circom:
// one note placed at leaf 0 of an otherwise-empty depth-10 incremental Merkle
// tree (empty leaves = 0, zero-subtree roots precomputed). Writes the circuit
// input + the public values.
//
//   bun run scripts/veil-gen-input.ts
import { buildPoseidon } from "circomlibjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DEPTH = 10;
const BUILD = join(import.meta.dir, "..", "circuits", "build");

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toBig = (x: unknown): bigint => F.toObject(x as Uint8Array);
const H = (xs: bigint[]): bigint => toBig(poseidon(xs));

// Note secrets (in production: derived from ECDH shared secret — see SDK).
const amount = 1_000_000n; // fixed-denomination demo note (1.0 with 6 decimals)
const secret = 11111111111111111111n;
const nullifier = 22222222222222222222n;

const commitment = H([amount, secret, nullifier]);
const nullifierHash = H([nullifier]);

// Zero-subtree roots: Z[0] = 0 (empty leaf), Z[i] = Poseidon(Z[i-1], Z[i-1]).
const Z: bigint[] = [0n];
for (let i = 1; i <= DEPTH; i++) Z.push(H([Z[i - 1], Z[i - 1]]));

// Leaf 0 occupied, all siblings are empty zero-subtrees, current always left.
const pathElements = Z.slice(0, DEPTH);
const pathIndices = new Array(DEPTH).fill(0);

// Root: hash the commitment up against the zero-subtree siblings.
let cur = commitment;
for (let i = 0; i < DEPTH; i++) cur = H([cur, pathElements[i]]);
const root = cur;

// Recipient: a payout field element (SDK reduces a Stellar address mod p).
const recipient = 123456789n;

const input = {
  root: String(root),
  nullifierHash: String(nullifierHash),
  recipient: String(recipient),
  amount: String(amount),
  secret: String(secret),
  nullifier: String(nullifier),
  pathElements: pathElements.map(String),
  pathIndices: pathIndices.map(String),
};
writeFileSync(join(BUILD, "input_veil.json"), JSON.stringify(input, null, 2));

console.log("veil withdraw input written");
console.log(`  commitment    = ${commitment}`);
console.log(`  nullifierHash = ${nullifierHash}`);
console.log(`  root          = ${root}`);
console.log(`  -> ${join(BUILD, "input_veil.json")}`);
