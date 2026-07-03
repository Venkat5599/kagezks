// End-to-end SDK ⇄ circuit integration check (off-chain):
//   sender derives a stealth note -> tree insert (with decoys) ->
//   recipient recognises it -> builds a REAL withdraw input -> proves.
// Confirms the SDK's Poseidon/commitment/Merkle exactly match the circuit.
//
//   bun run scripts/veil-flow.ts
import { Keypair } from "@stellar/stellar-sdk";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateMetaAddress,
  deriveNoteForRecipient,
  recognizeNote,
  nullifierHash,
  stealthSeed,
  recipientField,
  MerkleTree,
} from "../sdk/veil.ts";

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const AMOUNT = 1_000_000n; // fixed-denomination demo note

// 1. Recipient publishes a meta-address (scan keypair).
const meta = generateMetaAddress();

// 2. Sender derives a note paying that recipient.
const note = await deriveNoteForRecipient(meta.scanPub, AMOUNT);
console.log(`sender note commitment = ${note.commitment}`);

// 3. Pool tree: a couple of decoy deposits, then our note (non-trivial path).
const tree = await MerkleTree.create();
tree.insert(111n); // decoy
tree.insert(222n); // decoy
const idx = tree.insert(note.commitment);
tree.insert(333n); // decoy after
console.log(`note inserted at leaf ${idx}, root = ${tree.root()}`);

// 4. Recipient scans the announcement and recognises the note.
const found = await recognizeNote(meta.scanPriv, note.ephemeralPub, AMOUNT, note.commitment);
if (!found) throw new Error("recipient failed to recognise its own note");
console.log("recipient recognised note OK");

// 5. Recipient derives a one-time stealth Stellar payout address.
const seed = stealthSeed(meta.scanPriv, note.ephemeralPub);
const stealthKp = Keypair.fromRawEd25519Seed(Buffer.from(seed));
const recipient = recipientField(stealthKp.publicKey());
console.log(`stealth payout address = ${stealthKp.publicKey()}`);

// 6. Build the withdraw witness from the real tree proof.
const { pathElements, pathIndices, root } = tree.proof(idx);
const nh = await nullifierHash(found.nullifier);
const input = {
  root: String(root),
  nullifierHash: String(nh),
  recipient: String(recipient),
  amount: String(AMOUNT),
  secret: String(found.secret),
  nullifier: String(found.nullifier),
  pathElements: pathElements.map(String),
  pathIndices: pathIndices.map(String),
};
writeFileSync(join(BUILD, "input_veil_flow.json"), JSON.stringify(input, null, 2));
console.log(`  -> ${join(BUILD, "input_veil_flow.json")}`);
console.log("now: snarkjs wtns calculate + groth16 prove/verify on input_veil_flow.json");
