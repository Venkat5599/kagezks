# Veil — private payments for autonomous agents on Stellar (scoped session key + ZK shielded pool)

> Real-world problem: **give an AI agent a key on a public ledger and its every
> payment is a leak** — every counterparty, every amount, a map of everything
> your treasury touches — and a raw key means the agent (or an attacker) can
> **drain you**. Veil ports
> [`nschwermann/agent_fabric`](https://github.com/nschwermann/agent_fabric)'s
> thesis ("autonomy without custody") to Stellar and makes settlement
> **ZK-private**: the agent pays under a scoped key it can't drain, and no
> observer learns who it paid or how much. ZK is load-bearing: remove it and the
> agent→payee link is public, killing the privacy.

Reuses the crypto stack of an earlier build: Circom + snarkjs Groth16, Poseidon,
Soroban BN254 verifier.

---

## 1. The idea

An **owner** delegates a scoped session key to an **agent**; the agent is the
depositor that pays into the pool, and each **payee** is a recipient who later
withdraws. The session contract (`__check_auth`) bounds the agent so it can never
drain or redirect funds (see §7). On top of that scope, two privacy layers stack:

1. **Stealth notes (Umbra layer).** The recipient publishes a *meta-address*
   (a scan public key `V`). A sender, paying that recipient, picks a random
   ephemeral key `r`, does an ECDH (`shared = r·V`), and derives the note
   secrets from `shared`. Only the recipient — who holds the scan private key
   `v` — can recompute `shared = v·R` (from the announced ephemeral pubkey `R`)
   and recognise the payment. The chain sees a commitment and a random `R`,
   nothing else.

2. **ZK shielded pool (Tornado/Privacy-Pools layer).** Deposits insert a
   Poseidon commitment into an on-chain Merkle tree. A withdrawal proves, in
   zero knowledge, *"I know the secrets behind some leaf in the tree and its
   nullifier is unused"* — without revealing **which** leaf. This breaks the
   deposit↔withdrawal link that the stealth layer alone can't hide.

```
  SENDER                                    RECIPIENT (meta-addr: scan key V)
  ├─ ephemeral r, R = r·G
  ├─ shared = r·V            ───(ECDH)───   shared = v·R   (only V's holder)
  ├─ secret    = KDF(shared,0)              secret    = KDF(shared,0)
  ├─ nullifier = KDF(shared,1)              nullifier = KDF(shared,1)
  ├─ C = Poseidon(amount, secret, nullifier)
  │
  ▼ deposit(C, R, amount)                   scan announcements:
  ┌──────────────────────────────┐         for each R: recompute C', is C' in tree?
  │  SOROBAN VEIL POOL           │         └─ match ⇒ this payment is mine
  │  - pulls USDC (SAC)          │
  │  - inserts C into Merkle tree │         withdraw:
  │  - stores root, emits {C,R}   │         ├─ Groth16 proof: leaf∈tree ∧ nullifierHash
  └──────────────┬───────────────┘         │   ∧ recipient bound, secrets hidden
                 │                          ▼ withdraw(proof, root, nullifierHash, payout)
                 └────────────────────────► pool verifies (BN254), checks nullifier
                                            unused, pays USDC to a one-time STEALTH
                                            address the recipient controls.
  CHAIN SEES: commitments, random R values, a Merkle root, nullifier hashes.
  NEVER: who paid whom, amounts tied to identities, deposit↔withdrawal link.
```

## 2. Why ZK is load-bearing

| Remove | Consequence |
|--------|-------------|
| ZK pool proof | Withdrawal must name its deposit ⇒ deposit↔withdraw link public ⇒ no privacy. |
| Nullifier | Same note spent twice ⇒ pool drained. The nullifier (proven in-circuit) is the double-spend guard. |
| Stealth/ECDH notes | Recipient identity leaks at deposit time; sender must hand secrets out-of-band. |
| Recipient binding in-circuit | A relayer/observer front-runs the withdrawal, redirecting the payout. |

## 3. The withdraw circuit (`circuits/veil_withdraw.circom`)

**Public:** `root`, `nullifierHash`, `recipient`, `amount`.
**Private:** `secret`, `nullifier`, `pathElements[DEPTH]`, `pathIndices[DEPTH]`.

Constraints:
1. `amount ∈ [0, 2^64)` (range).
2. `commitment = Poseidon(amount, secret, nullifier)`.
3. `nullifierHash === Poseidon(nullifier)` (binds the public nullifier to the secret one).
4. Merkle membership: hashing `commitment` up `pathElements/pathIndices` with `Poseidon(2)` yields `root`.
5. `recipient` forced into the constraint system (anti-malleability) so the payout address can't be swapped after proving.

DEPTH = 10 (1024 notes) for the demo; fits the existing `pot14` ptau. The
construction is identical at depth 20.

## 4. Soroban pool contract (`contracts/veil/`)

- `init(admin, usdc_token)` — config.
- `deposit(from, commitment, ephemeral_pubkey, amount, new_root, leaf_index, proof)` —
  verify the Groth16 **insert** proof `[old_root, new_root, commitment, leaf_index, amount]`
  (BN254), which both appends `commitment` to the on-chain **incremental Merkle
  tree** (Poseidon) at the current root AND binds `commitment ==
  Poseidon(amount, secret, nullifier)` so the pulled USDC equals the note's
  committed value; then pull `amount` USDC from `from` (SAC `transfer`), advance
  the known-roots set, emit `Announce{commitment, ephemeral_pubkey, amount, leaf_index}`.
- `withdraw(proof, root, nullifier_hash, recipient, amount)` —
  1. assert `root` ∈ known-roots.
  2. assert `nullifier_hash` unused.
  3. `groth16_verify(vk, proof, [root, nullifier_hash, recipient, amount])` (BN254).
  4. mark `nullifier_hash` spent; `transfer` `amount` USDC to `recipient`.
- `set_vk(vk)` — admin.

## 5. Stealth ed25519 — honest scope

Classic Umbra (`P = S + H(shared)·G`, sign with `s + H(shared)`) does **not**
port cleanly to ed25519: libsodium clamps seeds and refuses to sign with an
arbitrary scalar. So v1 uses a **single-derived-key** stealth model —
`stealth_seed = KDF(shared)` → a standard Stellar keypair the recipient signs
with normally. This gives unlinkable one-time addresses with zero custom
crypto. True **view/spend key separation** (scan without being able to spend)
needs custom EdDSA scalar-signing and is a documented stretch.

## 6. Honesty ledger

- **Testnet only.** No mainnet, no real funds.
- v1 stealth = single-derived-key (no view/spend separation — stretch).
- Demo tree depth 10; scales to 20 with the same circuit, bigger ptau.
- Fixed-denomination notes in the demo for a clean anonymity set; arbitrary
  amounts are supported by the circuit but shrink the set.
- Trusted setup reuses the real Hermez Perpetual Powers of Tau.
- The ZK and every transaction are real; only the parties are ours.
