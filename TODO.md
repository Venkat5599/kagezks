# Ledgerproof — TODO

Confidential proof-of-solvency on Stellar. Deadline: **2026-06-29 12:00 PST**. All transactions real on testnet.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⭐ critical-path (demo dies without it)

---

## Day 0 — Setup & toolchain
- [ ] Install / verify: `circom` 2.x, `snarkjs`, `rustc` + `cargo`, `stellar` CLI (soroban), `bun`, `node`
- [ ] Create testnet identity + fund via friendbot (real testnet account)
- [ ] Init repo structure: `circuits/ contracts/ sdk/ scripts/ client/`
- [ ] `git init`, add `.gitignore` (keys, `node_modules`, `target`, `build/*.zkey` if large)
- [ ] Download real Perpetual Powers of Tau file (correct power for tree depth)

## Day 1 — ZK circuit ⭐
- [ ] `circuits/merkle_sum.circom` — Poseidon Merkle-sum tree (parent = `Poseidon(L,R,sumL+sumR)`)
- [ ] `circuits/solvency.circom` — main circuit:
  - [ ] ⭐ recompute `liabilities_root` from `(ids, balances, salts)`
  - [ ] ⭐ range check every `balances[i] ∈ [0, 2^64)`
  - [ ] ⭐ assert `Σ balances ≤ total_reserves`
- [ ] `scripts/seed-ledger.ts` — build realistic N-leaf customer ledger (start N=2^10), output root
- [ ] Compile circuit, run trusted setup with real ptau → `vk`, `zkey`
- [ ] ⭐ Generate + verify a proof locally on the seeded ledger (snarkjs)
- [ ] Bench proving time; lock tree depth for demo

## Day 2 — Soroban contract ⭐
- [ ] Fork `stellar/soroban-examples/groth16_verifier` into `contracts/solvency/`
- [ ] ⭐ `attest(proof, liabilities_root, ledger_seq)` — groth16_verify via BN254 host fns
- [ ] ⭐ Read real reserve balance on-chain (Stellar Asset Contract) → `R`
- [ ] ⭐ Bind: assert proof public input `total_reserves == R`
- [ ] Store attestation `{ liabilities_root, R, ledger_seq, SOLVENT, ts }` + emit event
- [ ] `status()` view returns latest attestation
- [ ] `set_vk` / `set_reserve_accounts` admin fns
- [ ] ⭐ Deploy to testnet (real deploy tx)
- [ ] `scripts/fund-reserves.ts` — issue SAC asset + fund reserve accounts (real txs)

## Day 3 — End-to-end on testnet ⭐
- [ ] ⭐ Full path: seed ledger → contract reads reserves → gen proof → `attest` → SOLVENT on-chain
- [ ] ⭐ Confirm every step is a real tx visible on testnet explorer
- [ ] Negative path: invalid proof → contract reverts, no attestation
- [ ] `sdk/` — TS wrapper: `generateProof()`, `attest()`, `getStatus()`

## Day 4 — Anti-fraud + tamper demo + UI ⭐
- [ ] ⭐ `sdk/inclusion.ts` — Merkle inclusion proof for a customer leaf vs published root
- [ ] Customer verifies their balance is counted (defeats FTX omit-liabilities trick)
- [ ] ⭐ `scripts/tamper.ts` — drop reserves / inflate liability → proof fails OR contract rejects
- [ ] `client/` minimal 3 views: Issuer (gen+publish) · Public (status, no balances) · Customer (verify inclusion)

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
