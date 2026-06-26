# Ledgerproof

**Confidential proof-of-solvency on Stellar.** A token issuer (stablecoin, exchange, RWA) proves on-chain that its reserves fully back everything it owes customers — a zero-knowledge proof of solvency — **without revealing any individual customer balance.**

> Stellar Hacks · Real-World ZK. ZK is load-bearing: remove it and the issuer must either publish every customer balance (a privacy breach) or be trusted on its word (the FTX hole).

- **Live demo:** https://frontend-gim99xuqr-venkat5599s-projects.vercel.app
- **Repo:** https://github.com/Venkat5599/stellar
- **Contract (testnet):** [`CA3G57DW…B6ZDO`](https://stellar.expert/explorer/testnet/contract/CA3G57DWPMJLVNXH3KVX55RMU3WEJGRLZJKDT6NGQMRZDSHEFBDB6ZDO)
- **Live SOLVENT attestation tx:** [`d54a35de…cc05`](https://stellar.expert/explorer/testnet/tx/d54a35de8a6567e021bf52c50af53dc1ced2cd5d05399297be0bddb6c7f1cc05)

---

## What it does

| Side | Where it lives | Visibility |
|------|----------------|------------|
| **Reserves** | Real Stellar testnet balances (SAC) | **Public — the Soroban contract reads them itself on-chain.** The issuer can't lie. |
| **Liabilities** | Issuer's private internal customer ledger | **Hidden — only a Merkle-sum root is published.** Proven `≤ reserves` in zero-knowledge. |

The contract verifies a Groth16 proof (BN254 host functions, Protocol 25/26) that `Σ liabilities ≤ reserves`, binds the proof's `total_reserves` to the balance it read itself, and publishes a public `SOLVENT` attestation — with **zero customer balances on-chain.**

## How ZK is load-bearing

1. **Circuit** (`circuits/solvency.circom`) proves, over private `(ids, balances, salts)`:
   - the Poseidon **Merkle-sum tree** reproduces the published `liabilities_root`,
   - every balance is in range `[0, 2^64)` (no negative/overflow tricks),
   - `Σ balances ≤ total_reserves`.
2. **Contract** (`contracts/solvency`) reads real reserves on-chain, injects that figure as the proof's `total_reserves` public input, and runs `bn254.pairing_check`. A valid proof can only exist if the issuer is genuinely solvent against the **live** reserves.
3. **Customer inclusion** (`sdk/inclusion.ts`) lets any customer verify their exact balance is inside the proven total — defeating the "omit some liabilities to look solvent" fraud.

## Proven end-to-end (all real testnet transactions)

- ✅ Solvent ledger → Groth16 proof verifies locally (`snarkjs`) and **on-chain** → `SOLVENT` published, no balances exposed.
- ✅ Contract reads reserves itself on-chain (`reserves() = 782586410`), binds them into the proof.
- ✅ Customer rebuilds a Merkle-inclusion proof against the published root.
- ✅ **Tamper demo:** drain reserves below liabilities → (1) a solvency proof can no longer be generated (circuit assert fails), and (2) any stale proof is **rejected on-chain** with `InvalidProof (#5)`. Restored to SOLVENT afterward.

## Stack

- **Circuit:** Circom 2 + snarkjs Groth16, Poseidon hash, **BN254** (`bn128`). Real Hermez Perpetual Powers of Tau (`powersOfTau28_hez_final_14.ptau`).
- **Contract:** Rust / Soroban SDK 26, `crypto::bn254` host functions (`g1_msm`, `g1_add`, `pairing_check`).
- **SDK/scripts:** Bun + TypeScript, `@stellar/stellar-sdk`, Stellar CLI.
- **Frontend:** Next.js + Tailwind (Issuer / Public / Customer views).
- **Network:** Stellar testnet (Protocol 26).

## Repo layout

```
circuits/      solvency.circom, merkle_sum.circom  (+ build/ artifacts)
contracts/     solvency/ — Soroban verifier + attestation registry (Rust)
sdk/           convert.ts (snarkjs→Soroban bytes), inclusion.ts
scripts/       seed-ledger, prove, fund-reserves, tamper, gen-frontend-data
frontend/      Next.js 3-view app
```

## Run it

Prereqs: `bun`, `circom`, `snarkjs`, Rust, `stellar` CLI, a funded testnet identity (`stellar keys generate issuer --network testnet --fund`).

```bash
bun install

# 1. Circuit: seed a ledger, compile, trusted setup, prove
bun run scripts/seed-ledger.ts
bun run circuit:compile
# (one-time) snarkjs groth16 setup + zkey contribute + export verificationkey

# 2. Contract: build + deploy
cd contracts/solvency && stellar contract build && cd ../..
stellar contract deploy --wasm contracts/solvency/target/wasm32v1-none/release/solvency.wasm --source issuer --network testnet

# 3. Reserves + proof bound to LIVE on-chain balance
bun run scripts/fund-reserves.ts
bun run scripts/prove.ts          # reads on-chain R, proves Σliab ≤ R, converts to bytes

# 4. Attest on-chain
stellar contract invoke --id <CONTRACT> --source issuer --network testnet -- set_vk --vk-file-path sdk/build/vk.json
stellar contract invoke --id <CONTRACT> --source issuer --network testnet -- attest \
  --proof-file-path sdk/build/proof.json --liabilities_root $(cat sdk/build/root.txt) --ledger_seq 1

# 5. Customer inclusion + tamper demo
bun run sdk/inclusion.ts 1004
bun run scripts/tamper.ts         # drain -> insolvent;  `restore` to undo
```

## Honesty ledger

- **Testnet only.** No mainnet, no real funds.
- **We run our own real testnet issuer.** No real third-party custodian's books are audited — the only thing simulated is *being the issuer*, because no custodian hands a hackathon its treasury. The cryptography and every transaction are real.
- **v1 reveals the reserve total** (the standard, fraud-relevant split — hide liabilities, expose reserves). Hiding reserves too is a documented stretch (FR10).
- **Demo tree is small** (8 leaves) for fast proving on a laptop; the construction scales (note the path to 2^10–2^20). The cryptography is identical at any size.
- **Trusted setup** uses the real Hermez Perpetual Powers of Tau; a production deployment would run its own ceremony.
- The internal customer ledger is realistic **seeded** data over the real circuit/contract path — the numbers are ours, the ZK and the chain are real.
- Frontend customer view ships precomputed inclusion proofs from the public demo ledger; the real verification logic is in `sdk/inclusion.ts` and runs against the published root.
