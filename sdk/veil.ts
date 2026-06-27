// Veil SDK — stealth notes (X25519 ECDH) + Poseidon Merkle tree.
//
// A sender derives a note's secrets from an ECDH shared secret with the
// recipient's scan key, so only the recipient (holding the scan private key)
// can recognise and later spend the note. The same Poseidon as the circuit is
// used so off-chain commitments match in-circuit ones exactly.
import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Address } from "@stellar/stellar-sdk";
import { buildPoseidon } from "circomlibjs";

// BN254 scalar field prime (must match circom's bn128 field).
export const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const DEPTH = 10;

// ---- Poseidon (lazy, matches circuits/*.circom) -----------------------------
let _poseidon: any = null;
async function poseidon(): Promise<(xs: bigint[]) => bigint> {
  if (!_poseidon) _poseidon = await buildPoseidon();
  const F = _poseidon.F;
  return (xs: bigint[]) => F.toObject(_poseidon(xs)) as bigint;
}

const enc = new TextEncoder();
const bytesToBig = (b: Uint8Array): bigint =>
  BigInt("0x" + Buffer.from(b).toString("hex"));
const hexToBig = (h: string): bigint => BigInt("0x" + h);
const bigToHex = (x: bigint, len = 64): string => x.toString(16).padStart(len, "0");

// Domain-separated field element from a shared secret.
function deriveField(shared: Uint8Array, tag: string): bigint {
  const h = sha256(new Uint8Array([...enc.encode(tag), ...shared]));
  return bytesToBig(h) % P;
}

// ---- Meta-address (recipient scan keypair) ----------------------------------
export type MetaAddress = { scanPriv: string; scanPub: string }; // hex, 32B each

export function generateMetaAddress(): MetaAddress {
  const scanPriv = x25519.utils.randomSecretKey();
  const scanPub = x25519.getPublicKey(scanPriv);
  return {
    scanPriv: Buffer.from(scanPriv).toString("hex"),
    scanPub: Buffer.from(scanPub).toString("hex"),
  };
}

// ---- Note ------------------------------------------------------------------
export type Note = {
  amount: bigint;
  secret: bigint;
  nullifier: bigint;
  commitment: bigint;
  ephemeralPub: string; // hex, announced on-chain
};

// Sender: derive a note paying `scanPubHex`, plus the ephemeral pubkey to announce.
export async function deriveNoteForRecipient(
  scanPubHex: string,
  amount: bigint,
): Promise<Note> {
  const H = await poseidon();
  const ephPriv = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, Buffer.from(scanPubHex, "hex"));
  const secret = deriveField(shared, "veil-secret");
  const nullifier = deriveField(shared, "veil-nullifier");
  const commitment = H([amount, secret, nullifier]);
  return {
    amount,
    secret,
    nullifier,
    commitment,
    ephemeralPub: Buffer.from(ephPub).toString("hex"),
  };
}

// Recipient: recompute a note's secrets from an announced ephemeral pubkey.
// Returns the note iff the recomputed commitment matches the announced one.
export async function recognizeNote(
  scanPrivHex: string,
  ephemeralPubHex: string,
  amount: bigint,
  announcedCommitment: bigint,
): Promise<Note | null> {
  const H = await poseidon();
  const shared = x25519.getSharedSecret(
    Buffer.from(scanPrivHex, "hex"),
    Buffer.from(ephemeralPubHex, "hex"),
  );
  const secret = deriveField(shared, "veil-secret");
  const nullifier = deriveField(shared, "veil-nullifier");
  const commitment = H([amount, secret, nullifier]);
  if (commitment !== announcedCommitment) return null;
  return { amount, secret, nullifier, commitment, ephemeralPub: ephemeralPubHex };
}

export async function nullifierHash(nullifier: bigint): Promise<bigint> {
  const H = await poseidon();
  return H([nullifier]);
}

// Stealth Stellar payout seed: a one-time ed25519 seed only the recipient can
// derive (single-derived-key model — see VEIL.md §5 for the honest scope).
export function stealthSeed(scanPrivHex: string, ephemeralPubHex: string): Uint8Array {
  const shared = x25519.getSharedSecret(
    Buffer.from(scanPrivHex, "hex"),
    Buffer.from(ephemeralPubHex, "hex"),
  );
  return sha256(new Uint8Array([...enc.encode("veil-stealth"), ...shared]));
}

// ---- Incremental Poseidon Merkle tree (matches circuit's zero-subtree) -------
export class MerkleTree {
  readonly depth: number;
  private H!: (xs: bigint[]) => bigint;
  private zeros: bigint[] = [];
  leaves: bigint[] = [];

  private constructor(depth: number) {
    this.depth = depth;
  }

  static async create(depth = DEPTH): Promise<MerkleTree> {
    const t = new MerkleTree(depth);
    t.H = await poseidon();
    t.zeros = [0n];
    for (let i = 1; i <= depth; i++) t.zeros.push(t.H([t.zeros[i - 1], t.zeros[i - 1]]));
    return t;
  }

  insert(leaf: bigint): number {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  // Level-by-level recompute (fine for demo sizes).
  private levels(): bigint[][] {
    const out: bigint[][] = [this.leaves.slice()];
    for (let d = 0; d < this.depth; d++) {
      const cur = out[d];
      const next: bigint[] = [];
      for (let i = 0; i < Math.max(1, Math.ceil(cur.length / 2)) * 2; i += 2) {
        const l = cur[i] ?? this.zeros[d];
        const r = cur[i + 1] ?? this.zeros[d];
        if (cur[i] === undefined && cur[i + 1] === undefined && next.length >= Math.ceil(cur.length / 2)) break;
        next.push(this.H([l, r]));
      }
      out.push(next.length ? next : [this.zeros[d + 1]]);
    }
    return out;
  }

  root(): bigint {
    if (this.leaves.length === 0) return this.zeros[this.depth];
    return this.levels()[this.depth][0];
  }

  proof(index: number): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
    const levels = this.levels();
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let d = 0; d < this.depth; d++) {
      const isRight = idx % 2;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      pathElements.push(levels[d][sibIdx] ?? this.zeros[d]);
      pathIndices.push(isRight); // 1 => current node is the right child
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices, root: this.root() };
  }
}

// recipient public input = keccak256(ScVal::Address XDR) with the top byte
// zeroed (so the 248-bit result is always a canonical BN254 field element).
// MUST byte-for-byte match the contract's `address_field` so the proof's
// recipient equals what the contract recomputes from the payout `Address`.
export function recipientField(strkey: string): bigint {
  const xdr = new Uint8Array(Address.fromString(strkey).toScVal().toXDR());
  const h = keccak_256(xdr);
  h[0] = 0; // ensure < BN254 prime — mirrors the contract
  return bytesToBig(h);
}

export { hexToBig, bigToHex, bytesToBig };
