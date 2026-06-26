# Ledgerproof — TODO

Confidential proof-of-solvency on Stellar. Deadline: **2026-06-29 12:00 PST**. All transactions real on testnet.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⭐ critical-path (demo dies without it)

---

## Day 0 — Setup & toolchain
- [x] Install / verify: `circom` 2.2.3, `snarkjs` 0.7.6, `rustc`+`cargo` (GNU toolchain, project-scoped override), `stellar` CLI 27.0.0 (prebuilt binary), `bun`, `node`
- [x] Create testnet identity + fund via friendbot — alias `issuer` = `GC7T5BU4A52IFL4EY4WJWG2ZFU2XWMOXRPVOE46D5WJZV7XKE66BT3UW` (10000 XLM)
- [x] Init repo structure: `circuits/ contracts/ sdk/ scripts/ client/` (+ `frontend/`)
- [x] `git init`, `.gitignore` (keys, node_modules, target, build artifacts) — remote: github.com/Venkat5599/stellar
- [x] Download real Perpetual Powers of Tau — Hermez `powersOfTau28_hez_final_14.ptau` (18 MB)

> **Curve decision:** BN254 (circom/snarkjs default `bn128`) — matches Nethermind `circom-groth16-verifier` (`crypto::bn254`) + circomlib Poseidon native field. Not BLS12-381.

## Day 1 — ZK circuit ⭐ — DONE, proof verifies both directions
- [x] `circuits/merkle_sum.circom` — Poseidon Merkle-sum tree (parent = `Poseidon(L,R,sumL+sumR)`)
- [x] `circuits/solvency.circom` — main circuit:
  - [x] ⭐ recompute `liabilities_root` from `(ids, balances, salts)`
  - [x] ⭐ range check every `balances[i] ∈ [0, 2^64)`
  - [x] ⭐ assert `Σ balances ≤ total_reserves`
- [x] `scripts/seed-ledger.ts` — realistic N-leaf ledger (currently N=2^3 for speed; bump to 2^10)
- [x] Compile circuit (4601 non-linear constraints), trusted setup with real ptau → `vk`, `zkey`
- [x] ⭐ Generate + verify proof locally — `snarkJS: OK!` on solvent ledger
- [x] ⭐ Negative test — insolvent ledger (reserves<liabilities) FAILS witness (assert) — ZK is load-bearing
- [ ] Bump tree depth 3→10 (1024 customers) + bench proving time

## Day 2 — Soroban contract ⭐ — contract AUTHORED + BUILDS (wasm 7677 bytes), unit test green
- [x] Wrote `contracts/solvency/contracts/solvency/src/lib.rs` modeled on Nethermind bn254 verifier (stellar init scaffold, not the BLS12-381 example)
- [x] ⭐ `attest(proof, liabilities_root, ledger_seq)` — groth16_verify via BN254 host fns (`g1_msm`, `g1_add`, `pairing_check`, `-A` neg)
- [x] ⭐ Read real reserve balance on-chain — `reserves()` sums SAC `token::Client.balance()` over configured accounts
- [x] ⭐ Bind: contract injects on-chain `R` as the `total_reserves` public input (issuer cannot supply it)
- [x] Store attestation `{ liabilities_root, R, ledger_seq, SOLVENT, ts }` + emit `solvency/SOLVENT` event
- [x] `status()` view returns latest attestation
- [x] `init` (admin/reserve_token/reserve_accounts) + `set_vk` admin fns
- [x] Builds to wasm (soroban-sdk 26, BN254 API confirmed correct), `cargo test` passes
- [x] ⭐ Deploy to testnet — contract `CA3G57DWPMJLVNXH3KVX55RMU3WEJGRLZJKDT6NGQMRZDSHEFBDB6ZDO`
- [x] Reserve asset + SAC `CDCMSHPRVF4FA2XP4SNKYCYR6BZEW6XPZCQX2ELBISMF5CE3NF3CEVJ7` (RSV), minted real balance to reserve account
- [x] ⭐ `sdk/convert.ts` — snarkjs vk/proof → VkBytes/ProofBytes; G2 EIP-197 ordering correct first try

## Day 3 — End-to-end on testnet ⭐ — DONE, SOLVENT published on-chain
- [x] ⭐ Full path: seed → contract reads reserves (782586410) → prove (bound to live R) → `attest` → SOLVENT on-chain
- [x] ⭐ Real tx on explorer: https://stellar.expert/explorer/testnet/tx/d54a35de8a6567e021bf52c50af53dc1ced2cd5d05399297be0bddb6c7f1cc05 — event SOLVENT, zero balances exposed
- [x] Negative path: tampered proof → `HostError(Crypto, InvalidInput)`, tx fails, status() unchanged (no corruption)
- [ ] `sdk/` — TS wrapper helpers: `generateProof()`, `attest()`, `getStatus()` (currently driven via scripts/CLI)

## Day 4 — Anti-fraud + tamper demo + UI ⭐
- [x] ⭐ `sdk/inclusion.ts` — Merkle inclusion proof for a customer leaf vs published root (verified: customer 1004 rebuilds root)
- [x] Customer verifies their balance is counted (defeats FTX omit-liabilities trick)
- [x] ⭐ tamper demo proven LIVE on testnet: drained reserves 782586410→182586410 → (1) proof gen fails, (2) on-chain attest reverts `Error(Contract,#5)` InvalidProof; restored to SOLVENT
- [x] `scripts/tamper.ts` + `scripts/prove.ts` + `scripts/fund-reserves.ts` — reproducible orchestration
- [ ] `frontend/` 3 views: Issuer (gen+publish) · Public (status, no balances) · Customer (verify inclusion)
- [ ] Deploy frontend to Vercel

## Day 5 — Ship ⭐
- [ ] ⭐ `README.md` — what it is, how to run, ZK explainer, **honesty ledger** (testnet, self-run issuer, reserves revealed v1, real ptau)
- [ ] ⭐ Record 2–3 min demo on live testnet: SOLVENT with balances hidden → tamper → rejected
- [ ] Verify repo is public + clean (no secret keys committed)
- [ ] Submit before 2026-06-29 12:00 PST
- [ ] Rotate any exposed API keys / tokens

## Stretch (only if ahead)
- [ ] FR10 — hide reserve total too (commit reserves, prove `≥` over two hidden sums)
- [ ] Browser proof-gen (WASM)
- [ ] Reserve basket (sum multiple SAC assets on-chain)
- [ ] Scale tree to 2^20 + note benchmarks

---

## Risk watchlist
- Merkle-sum + range circuit slips → keep tree shallow, ship N=2^10 first
- Soroban reading classic XLM balance → use SAC assets for reserves
- Proving too slow in browser → CLI proof-gen for demo, browser = stretch
- Groth16 public-input layout mismatch with verifier → keep layout minimal, test early
