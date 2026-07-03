// Builds an INSERT witness: appending a real stealth-note commitment at the next
// free leaf, proving oldRoot -> newRoot with the shared sibling path AND binding
// the deposited amount to the commitment (commitment == Poseidon(amount, secret,
// nullifier)). Uses a real ECDH-derived note so the amount-binding constraint holds.
//
//   bun run scripts/veil-gen-insert.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MerkleTree, generateMetaAddress, deriveNoteForRecipient } from "../sdk/veil.ts";

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const AMOUNT = 10_000_000n; // 1 unit (7 decimals)

// A real recipient + sender-derived note (so secret/nullifier open the commitment).
const meta = generateMetaAddress();
const note = await deriveNoteForRecipient(meta.scanPub, AMOUNT);

const tree = await MerkleTree.create();
tree.insert(111n); // existing deposits
tree.insert(222n);

const oldRoot = tree.root();
const leafIndex = tree.insert(note.commitment); // append at next free index
const newRoot = tree.root();
const { pathElements } = tree.proof(leafIndex);

const input = {
  oldRoot: String(oldRoot),
  newRoot: String(newRoot),
  commitment: String(note.commitment),
  leafIndex: String(leafIndex),
  amount: String(AMOUNT),
  secret: String(note.secret),
  nullifier: String(note.nullifier),
  pathElements: pathElements.map(String),
};
writeFileSync(join(BUILD, "input_insert.json"), JSON.stringify(input, null, 2));
console.log(`insert witness: leaf ${leafIndex}`);
console.log(`  oldRoot = ${oldRoot}`);
console.log(`  newRoot = ${newRoot}`);
console.log(`  -> ${join(BUILD, "input_insert.json")}`);
