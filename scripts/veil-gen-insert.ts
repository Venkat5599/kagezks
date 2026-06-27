// Builds a withdraw-circuit-compatible INSERT witness: appending a commitment
// at the next free leaf, proving oldRoot -> newRoot with the shared sibling path.
//
//   bun run scripts/veil-gen-insert.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MerkleTree } from "../sdk/veil.ts";

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const commitment = 8990025958240201958778914193159572679469865160483104709610487380426058316601n;

const tree = await MerkleTree.create();
tree.insert(111n); // existing deposits
tree.insert(222n);

const oldRoot = tree.root();
const leafIndex = tree.insert(commitment); // append at next free index
const newRoot = tree.root();
const { pathElements } = tree.proof(leafIndex);

const input = {
  oldRoot: String(oldRoot),
  newRoot: String(newRoot),
  commitment: String(commitment),
  leafIndex: String(leafIndex),
  pathElements: pathElements.map(String),
};
writeFileSync(join(BUILD, "input_insert.json"), JSON.stringify(input, null, 2));
console.log(`insert witness: leaf ${leafIndex}`);
console.log(`  oldRoot = ${oldRoot}`);
console.log(`  newRoot = ${newRoot}`);
console.log(`  -> ${join(BUILD, "input_insert.json")}`);
