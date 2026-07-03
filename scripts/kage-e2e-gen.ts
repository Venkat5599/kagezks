// Generates a CONSISTENT on-chain e2e scenario: deposit one stealth note into
// the empty pool (leaf 0), then withdraw it. Emits both circuit witnesses and a
// manifest of contract call-args so the deploy script can invoke deposit then
// withdraw against the same note.
//
//   bun run scripts/veil-e2e-gen.ts
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
  bigToHex,
  MerkleTree,
} from "../sdk/veil.ts";

const BUILD = join(import.meta.dir, "..", "circuits", "build");
const OUT = join(import.meta.dir, "..", "sdk", "build");
const AMOUNT = 10_000_000n; // 1 XLM (7 decimals) standing in for USDC in the demo

// Recipient meta-address + sender-derived note.
const meta = generateMetaAddress();
const note = await deriveNoteForRecipient(meta.scanPub, AMOUNT);

// Empty pool -> deposit the note at leaf 0.
const tree = await MerkleTree.create();
const emptyRoot = tree.root();
const leafIndex = tree.insert(note.commitment);
const newRoot = tree.root();
const { pathElements, pathIndices } = tree.proof(leafIndex);

// Recipient recognises + derives a one-time stealth Stellar payout address.
const found = await recognizeNote(meta.scanPriv, note.ephemeralPub, AMOUNT, note.commitment);
if (!found) throw new Error("recipient failed to recognise note");
const stealthKp = Keypair.fromRawEd25519Seed(Buffer.from(stealthSeed(meta.scanPriv, note.ephemeralPub)));
const recipient = recipientField(stealthKp.publicKey());
const nh = await nullifierHash(found.nullifier);

// INSERT witness: emptyRoot -> newRoot appends the commitment at leaf 0, and
// binds `amount` to the commitment (commitment == Poseidon(amount, secret, nullifier)).
writeFileSync(
  join(BUILD, "input_e2e_insert.json"),
  JSON.stringify({
    oldRoot: String(emptyRoot),
    newRoot: String(newRoot),
    commitment: String(note.commitment),
    leafIndex: String(leafIndex),
    amount: String(AMOUNT),
    secret: String(note.secret),
    nullifier: String(note.nullifier),
    pathElements: pathElements.map(String),
  }),
);

// WITHDRAW witness: membership of the note under newRoot, paying `recipient`.
writeFileSync(
  join(BUILD, "input_e2e_withdraw.json"),
  JSON.stringify({
    root: String(newRoot),
    nullifierHash: String(nh),
    recipient: String(recipient),
    amount: String(AMOUNT),
    secret: String(found.secret),
    nullifier: String(found.nullifier),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  }),
);

// Manifest: hex-encoded BytesN args + the stealth payout details.
const manifest = {
  amount: AMOUNT.toString(),
  leafIndex,
  emptyRoot: bigToHex(emptyRoot),
  newRoot: bigToHex(newRoot),
  commitment: bigToHex(note.commitment),
  ephemeralPub: note.ephemeralPub, // already 32-byte hex
  nullifierHash: bigToHex(nh),
  recipientField: bigToHex(recipient),
  stealthAddress: stealthKp.publicKey(),
  stealthSecret: stealthKp.secret(),
  scanPriv: meta.scanPriv,
  scanPub: meta.scanPub,
};
writeFileSync(join(OUT, "veil_manifest.json"), JSON.stringify(manifest, null, 2));

console.log("e2e scenario generated");
console.log(`  emptyRoot     = ${manifest.emptyRoot}`);
console.log(`  newRoot       = ${manifest.newRoot}`);
console.log(`  commitment    = ${manifest.commitment}`);
console.log(`  nullifierHash = ${manifest.nullifierHash}`);
console.log(`  stealthAddr   = ${manifest.stealthAddress}`);
console.log(`  -> ${join(OUT, "veil_manifest.json")}`);
