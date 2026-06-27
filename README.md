# Veil

**Private payments on Stellar — stealth notes + a ZK shielded pool.** A sender
pays a recipient in USDC so that **no one, including a chain observer, learns
who was paid, how much, or which deposit funded which withdrawal.**

> Stellar Hacks · Real-World ZK. ZK is load-bearing: remove it and the
> deposit→withdrawal link is public — there is no privacy left.

Pivoted from the earlier Ledgerproof proof-of-solvency build; reuses its proven
crypto stack (Circom + snarkjs Groth16, Poseidon, Soroban **BN254** verifier).

---

## What it does

| Layer | Hides | How |
|-------|-------|-----|
| **Stealth notes** (Umbra-style) | *who* is paid | Recipient publishes a scan key `V`. Sender does ECDH (`shared = r·V`), derives the note secrets from `shared`, announces only the ephemeral `R`. Only `V`'s holder recomputes `shared = v·R` and finds the payment. |
| **ZK shielded pool** (Tornado/Privacy-Pools-style) | *which deposit ↔ which withdrawal*, and the amount link | Deposits insert a Poseidon commitment into a Merkle tree. A withdrawal proves in zero knowledge it owns *some* unspent leaf — without revealing which — plus a fresh nullifier (double-spend guard). |

The chain only ever sees: commitments, random `R` values, a Merkle root, and
nullifier hashes. Never an identity, an amount tied to a person, or a
deposit↔withdrawal link.

## Why ZK is load-bearing

- **Remove the pool proof** → the withdrawal must name its deposit → link is public → no privacy.
- **Remove the nullifier** → a note is spendable twice → the pool drains.
- **Remove the recipient binding** → a relayer front-runs the withdrawal and redirects the payout.

## How the tree stays trustless without on-chain Poseidon

Stellar's host Poseidon2 constants don't match circomlib's Poseidon, so the
contract can't recompute the circuit's root on-chain. Instead, **every deposit
carries a Groth16 "insert" proof** that `new_root` correctly appends
`commitment` to the tree at the contract's current root. The contract checks
`old_root == current`, runs only the BN254 pairing check, and advances the root.
All hashing stays in circomlib-Poseidon land; the contract trusts no root it
didn't verify.

## Components

```
circuits/
  veil_withdraw.circom   membership + nullifier + amount range + recipient bind
  veil_insert.circom     old_root -> new_root append proof (per deposit)
sdk/
  veil.ts                X25519 ECDH stealth notes, Poseidon Merkle tree, stealth Stellar addr
  veil-convert.ts        snarkjs -> Soroban BN254 byte layout
contracts/.../veil/      Soroban pool: deposit (insert-verify), withdraw (membership-verify + nullifier)
scripts/
  veil-flow.ts           full off-chain flow: derive -> tree -> recognise -> prove
  veil-gen-insert.ts     build an insert witness
```

Public-input layouts (contract mirrors circuits exactly):
- insert: `[old_root, new_root, commitment, leaf_index]`
- withdraw: `[root, nullifier_hash, recipient, amount]`

## Proven end-to-end (real testnet transactions)

- **Contract (testnet):** [`CCM4HXQH…23YD`](https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD)
- ✅ **Deposit** — [`5aa164a0…c231`](https://stellar.expert/explorer/testnet/tx/5aa164a06f73e3e943824edcaedaf768ac773f52a9029f92656a5a8d7f97c231): the on-chain **insert proof** verified (BN254), USDC pulled into the pool, commitment + ephemeral pubkey announced.
- ✅ **Withdraw** — [`dca61041…cc81`](https://stellar.expert/explorer/testnet/tx/dca610418cc3b2d3ebfaf05282b96beffcfa620914b8ade9991bf4c4b1f7cc81): the **membership proof** verified, payout paid to a **stealth address** bound into the proof (keccak(ScAddress) matched cross-language). No deposit↔withdrawal link on chain.
- ✅ **Double-spend rejected** — replaying the same nullifier reverts with `NullifierUsed (#9)`.

### Local (real Groth16)

- ✅ Withdraw circuit: 3005 constraints, proves + `snarkjs verify` OK.
- ✅ Insert circuit: 4910 constraints, proves + `snarkjs verify` OK.
- ✅ SDK ⇄ circuit: real X25519 note → SDK Merkle proof → withdraw proof verifies (Poseidon matches in and out of circuit).
- ✅ Recipient recognises its own ECDH note; one-time stealth Stellar address derived.

## Run it

Prereqs: `bun`, `circom`, `snarkjs`, Rust (GNU toolchain on Windows), `stellar` CLI, a funded testnet identity.

```bash
bun install

# circuits (reuses the existing pot14 ptau)
bun run circuit:withdraw && bun run circuit:insert
# (one-time) snarkjs groth16 setup + zkey contribute + export verificationkey for each

# off-chain end-to-end (derive -> tree -> recognise -> prove)
bun run flow
snarkjs groth16 verify circuits/build/veil_vk.json \
  circuits/build/veil_flow_public.json circuits/build/veil_flow_proof.json

# contract
cd contracts/solvency && stellar contract build && cd ../..
bun run convert     # snarkjs vk/proof -> Soroban bytes
```

## Honesty ledger

- **Testnet only.** No mainnet, no real funds.
- Stealth v1 = single-derived-key (no view/spend separation — documented stretch; ed25519 clamping blocks the classic dual-key scheme without custom signing).
- Demo tree depth 10 (1024 notes); identical circuit scales to depth 20.
- Fixed-denomination notes in the demo for a clean anonymity set.
- Trusted setup reuses the real Hermez Perpetual Powers of Tau.
- The ZK and every transaction are real; only the parties are ours.

See `VEIL.md` for the full architecture.
