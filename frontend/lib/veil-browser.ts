// Browser port of sdk/veil.ts — stealth notes + Poseidon Merkle tree, plus the
// snarkjs proof → Soroban BN254 byte conversion. Uses poseidon-lite (same
// circomlib Poseidon constants as the circuits) so off-chain commitments match
// in-circuit ones exactly. Everything here runs client-side.
import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Address } from "@stellar/stellar-sdk";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";

export const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DEPTH = 10;

const enc = new TextEncoder();
const hexToBytes = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytesToBig = (b: Uint8Array): bigint => BigInt("0x" + (bytesToHex(b) || "0"));
export const bigToHex = (x: bigint, len = 64): string => x.toString(16).padStart(len, "0");

function deriveField(shared: Uint8Array, tag: string): bigint {
  const h = sha256(new Uint8Array([...enc.encode(tag), ...shared]));
  return bytesToBig(h) % P;
}

export type MetaAddress = { scanPriv: string; scanPub: string };
export function generateMetaAddress(): MetaAddress {
  const scanPriv = x25519.utils.randomSecretKey();
  const scanPub = x25519.getPublicKey(scanPriv);
  return { scanPriv: bytesToHex(scanPriv), scanPub: bytesToHex(scanPub) };
}

export type Note = {
  amount: bigint;
  secret: bigint;
  nullifier: bigint;
  commitment: bigint;
  ephemeralPub: string;
};

export function deriveNoteForRecipient(scanPubHex: string, amount: bigint): Note {
  const ephPriv = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, hexToBytes(scanPubHex));
  const secret = deriveField(shared, "veil-secret");
  const nullifier = deriveField(shared, "veil-nullifier");
  const commitment = poseidon3([amount, secret, nullifier]);
  return { amount, secret, nullifier, commitment, ephemeralPub: bytesToHex(ephPub) };
}

export function recognizeNote(
  scanPrivHex: string,
  ephemeralPubHex: string,
  amount: bigint,
  announcedCommitment: bigint,
): Note | null {
  const shared = x25519.getSharedSecret(hexToBytes(scanPrivHex), hexToBytes(ephemeralPubHex));
  const secret = deriveField(shared, "veil-secret");
  const nullifier = deriveField(shared, "veil-nullifier");
  const commitment = poseidon3([amount, secret, nullifier]);
  if (commitment !== announcedCommitment) return null;
  return { amount, secret, nullifier, commitment, ephemeralPub: ephemeralPubHex };
}

export const nullifierHash = (nullifier: bigint): bigint => poseidon1([nullifier]);

export function stealthSeed(scanPrivHex: string, ephemeralPubHex: string): Uint8Array {
  const shared = x25519.getSharedSecret(hexToBytes(scanPrivHex), hexToBytes(ephemeralPubHex));
  return sha256(new Uint8Array([...enc.encode("veil-stealth"), ...shared]));
}

// recipient public input = keccak256(ScVal::Address XDR) top byte zeroed.
// MUST byte-for-byte match the contract's address_field.
export function recipientField(strkey: string): bigint {
  const xdr = new Uint8Array(Address.fromString(strkey).toScVal().toXDR());
  const h = keccak_256(xdr);
  h[0] = 0;
  return bytesToBig(h);
}

// ---- Incremental Poseidon Merkle tree (matches the circuit's zero-subtree) ---
export class MerkleTree {
  readonly depth: number;
  private zeros: bigint[] = [];
  leaves: bigint[] = [];

  constructor(depth = DEPTH) {
    this.depth = depth;
    this.zeros = [BigInt(0)];
    for (let i = 1; i <= depth; i++) this.zeros.push(poseidon2([this.zeros[i - 1]!, this.zeros[i - 1]!]));
  }

  insert(leaf: bigint): number {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  private levels(): bigint[][] {
    const out: bigint[][] = [this.leaves.slice()];
    for (let d = 0; d < this.depth; d++) {
      const cur = out[d]!;
      const next: bigint[] = [];
      for (let i = 0; i < Math.max(1, Math.ceil(cur.length / 2)) * 2; i += 2) {
        const l = cur[i] ?? this.zeros[d]!;
        const r = cur[i + 1] ?? this.zeros[d]!;
        if (cur[i] === undefined && cur[i + 1] === undefined && next.length >= Math.ceil(cur.length / 2)) break;
        next.push(poseidon2([l, r]));
      }
      out.push(next.length ? next : [this.zeros[d + 1]!]);
    }
    return out;
  }

  root(): bigint {
    if (this.leaves.length === 0) return this.zeros[this.depth]!;
    return this.levels()[this.depth]![0]!;
  }

  proof(index: number): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
    const levels = this.levels();
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let d = 0; d < this.depth; d++) {
      const isRight = idx % 2;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      pathElements.push(levels[d]![sibIdx] ?? this.zeros[d]!);
      pathIndices.push(isRight);
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices, root: this.root() };
  }
}

// ---- snarkjs Groth16 → Soroban BN254 byte layout (port of sdk/veil-convert) --
const toBE32 = (dec: string): string => {
  const h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error(`field element too large: ${dec}`);
  return h.padStart(64, "0");
};
const g1 = (p: string[]): string => toBE32(p[0]!) + toBE32(p[1]!);
const g2 = (p: string[][]): string => {
  const [xc0, xc1] = [toBE32(p[0]![0]!), toBE32(p[0]![1]!)];
  const [yc0, yc1] = [toBE32(p[1]![0]!), toBE32(p[1]![1]!)];
  return xc1 + xc0 + yc1 + yc0; // G2_IMAG_FIRST
};
export type ProofHex = { a: string; b: string; c: string };
export const proofToHex = (p: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }): ProofHex => ({
  a: g1(p.pi_a),
  b: g2(p.pi_b),
  c: g1(p.pi_c),
});

export { hexToBytes, bytesToHex };
