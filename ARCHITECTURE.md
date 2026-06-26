# Ledgerproof — Architecture

Confidential proof-of-solvency on Stellar (Soroban + Groth16). Reserves verified on-chain; liabilities proven in zero-knowledge.

> Supersedes the earlier `zkTravel` architecture.

---

## 1. The core idea in one diagram

```
  ISSUER (runs a real testnet token + reserve accounts)
  ┌──────────────────────────────────────────────────────────┐
  │  PRIVATE internal customer ledger                          │
  │  [(cust_1, bal_1), (cust_2, bal_2), ... (cust_n, bal_n)]   │   ← never published
  │            │                                               │
  │            ▼                                               │
  │   ┌──────────────────────────┐                            │
  │   │  ZK Proof Generator       │  (Circom + Groth16)        │
  │   │  - Merkle-sum root         │                           │
  │   │  - each bal in [0, 2^64)   │                           │
  │   │  - sum(bal) ≤ reserves     │                           │
  │   └───────────┬──────────────┘                            │
  │               │ proof + public inputs                      │
  │               │ (liabilities_root, total_reserves)         │
  └───────────────┼──────────────────────────────────────────┘
                  ▼
  ┌──────────────────────────────────────────────────────────┐
  │   SOROBAN SOLVENCY CONTRACT (Stellar testnet)             │
  │   1. read REAL reserve balance on-chain (SAC) → R          │
  │   2. assert public_input.total_reserves == R               │
  │   3. groth16_verify(vk, proof, public_inputs)  (BN254)     │
  │   4. store {liabilities_root, R, ledger_seq, SOLVENT}      │
  │   5. emit Solvency event                                    │
  └───────────────┬──────────────────────────────────────────┘
                  │ on-chain attestation
        ┌─────────┴───────────────────────────┐
        ▼                                       ▼
   PUBLIC VERIFIER                         CUSTOMER
   reads "SOLVENT ✅ @ ledger N"           Merkle-inclusion proof:
   sees NO balances                        "my (id, bal) is in liabilities_root"

  PUBLIC CHAIN sees: reserves figure + SOLVENT + a Merkle root. No customer balance.
```

## 2. The real-vs-private split (why ZK is load-bearing)

| Side | Where it lives | Visibility | Why |
|------|----------------|------------|-----|
| **Reserves** | Real Stellar testnet accounts (SAC assets) | **Public, verified on-chain by the contract** | This is the side you *want* trustless. The contract reads it itself; the issuer can't lie about it. |
| **Liabilities** | Issuer's **internal** customer ledger | **Private**, only a Merkle root is published | This is the side that leaks customer data and the side FTX faked. ZK proves the sum without exposing it. |

Remove the ZK and you must either publish every customer balance (privacy breach) or have the contract trust the issuer's liability number (the FTX hole). That is why ZK is essential, not decorative.

## 3. Components

### 3.1 ZK circuit (`circuits/solvency.circom`)

**Private inputs (witness):**
- `balances[N]` — each customer's balance on the internal ledger.
- `ids[N]` — customer identifiers (or salted commitments) for the leaves.
- `salts[N]` — per-leaf randomness so leaves aren't guessable.

**Public inputs:**
- `liabilities_root` — Poseidon Merkle-sum root over the leaves.
- `total_reserves` — the reserve figure the contract verified on-chain (bound into the proof).

**Constraints proven:**
1. **Tree integrity** — recomputing the Merkle-sum tree from `(ids, balances, salts)` yields `liabilities_root`. (Sum tree: each parent stores `Poseidon(L, R, sumL+sumR)`.)
2. **Range** — every `balances[i] ∈ [0, 2^64)`. Blocks negative balances that could fake a low total, and overflow.
3. **Solvency** — `Σ balances[i] ≤ total_reserves`.

Output: a Groth16 proof + the two public inputs.

> Hash = Poseidon/Poseidon2 (P25 host function). Curve = BN254 (P26 host functions). Scheme = Groth16 (cheapest on-chain verify). Trusted setup = real Hermez Perpetual Powers of Tau.

### 3.2 Soroban solvency contract (`contracts/solvency/`)

The on-chain verifier and attestation registry.

Functions:
- `set_vk(vk)` / `set_reserve_accounts(addrs[])` — admin config (verification key, which SAC balances count as reserves).
- `attest(proof, liabilities_root, ledger_seq)`:
  1. `R = Σ sac.balance(reserve_account)` — read **real on-chain reserve balances**.
  2. assert the proof's `total_reserves` public input `== R` (binds proof to live reserves).
  3. `groth16_verify(vk, proof, [liabilities_root, R])` via BN254 host functions.
  4. on success: store `{ liabilities_root, R, ledger_seq, status: SOLVENT, ts }`; emit `Solvency` event.
  5. on failure: revert — no attestation written.
- `status()` → latest attestation (root, reserves, ledger, SOLVENT/none).

Storage: verification key, reserve account list, latest attestation record.

### 3.3 Customer inclusion (`sdk/inclusion.ts`)

- Issuer publishes only `liabilities_root` on-chain.
- For each customer, issuer (or a self-serve tool) produces a Merkle path proving `leaf = Poseidon(id, balance, salt)` is under `liabilities_root`.
- Customer recomputes the path locally → confirms their exact balance was counted. Defeats the "omit liabilities to look solvent" fraud, because every customer who checks would catch an omission.

### 3.4 Reserve funding & ledger seeding (`scripts/`)

- `seed-ledger.ts` — builds a realistic internal customer ledger (N leaves), computes the Merkle-sum root.
- `fund-reserves.ts` — issues a testnet SAC asset and funds reserve accounts with **real testnet transactions** so the contract has real balances to read.
- `tamper.ts` — for the demo: move reserves out / inflate a liability so `Σ liabilities > R`, then show proof failure / contract rejection.

### 3.5 Client / UI (`client/`)

Three minimal views:
- **Issuer** — generate proof from the private ledger, submit `attest` (real tx).
- **Public** — read `status()`; show "SOLVENT ✅ @ ledger N", reserves figure, root. No balances.
- **Customer** — paste leaf → get/verify Merkle inclusion against the on-chain root.

## 4. Data flow (end to end, all real transactions)

1. Issuer issues a testnet SAC asset and funds reserve accounts — **real txs**.
2. Issuer maintains a private internal customer ledger; computes `liabilities_root`.
3. Contract reads live reserve balances on-chain → `R`.
4. Issuer generates the ZK proof with `total_reserves = R`.
5. Issuer calls `attest(proof, liabilities_root, ledger_seq)` — **real tx**.
6. Contract re-reads reserves, checks `total_reserves == R`, verifies the proof, writes `SOLVENT`, emits event — **real tx**.
7. Public reads the attestation: solvent, no balances exposed.
8. Any customer verifies Merkle inclusion of their balance against the published root.
9. Tamper path: reserves drop below liabilities → proof invalid or contract revert → status not solvent.

## 5. Why each guarantee holds (judge-proofing)

| Attack / question | Defense |
|---|---|
| "Issuer lies about reserves" | Contract reads reserve balances **itself** on-chain (FR4); issuer's claim is never trusted. |
| "Issuer hides some liabilities to look solvent" | Customer-inclusion Merkle proofs (FR7) — omitted customers detect it; root binds the full set. |
| "Negative/overflow balance fakes a low total" | In-circuit range check `[0, 2^64)` (FR2). |
| "Balances leak on-chain" | Only the Merkle root + reserve total are public; individual balances never leave the issuer (FR5). |
| "Replay an old solvent proof" | Attestation binds `ledger_seq` + the live reserve read; stale reserves won't match `R`. |
| "Is this just proof-of-reserves?" | PoR fakes the liability side and is an off-chain periodic PDF. Here reserves are on-chain-verified AND the private liability side is proven in ZK with customer inclusion — continuous, on-chain, fraud-resistant on both sides. |

## 6. Tech stack

- **Circuits:** Circom 2 + snarkjs (Groth16). Poseidon hash. BN254. Real Perpetual Powers of Tau.
- **Contract:** Rust / Soroban SDK (P25+ for BN254/Poseidon host fns). Fork `stellar/soroban-examples/groth16_verifier`. Stellar Asset Contract for reserve reads.
- **Client/SDK:** bun + TypeScript. `@stellar/stellar-sdk` for txs, Horizon for reads.
- **Network:** Stellar testnet (Protocol 26).

## 7. Repo layout

```
ledgerproof/
├── circuits/
│   ├── solvency.circom            # Merkle-sum + range + inequality
│   ├── merkle_sum.circom
│   └── build/                     # compiled + keys (real ptau)
├── contracts/
│   └── solvency/                  # Soroban verifier + attestation registry (Rust)
├── sdk/                           # TS: proof-gen wrapper, inclusion proofs
├── scripts/                       # seed-ledger, fund-reserves, tamper, deploy
├── client/                        # issuer / public / customer views
└── README.md                      # honest scope: testnet, self-run issuer, reserves revealed in v1
```

## 8. Build order (maps to PRD milestones)

1. Circuit → local proving on a real seeded ledger; real ptau (Day 1).
2. Soroban contract: Groth16 verify + on-chain reserve read + attestation; testnet deploy + real reserve funding (Day 2).
3. End-to-end real transactions on testnet (Day 3).
4. Customer-inclusion tool + tamper demo + 3-view UI (Day 4).
5. README + video + polish; stretch: hide reserves (Day 5).

## 9. Honesty ledger (put in README)

- Testnet only.
- We run our own real testnet issuer — no real third-party custodian's books are audited.
- v1 reveals the reserve total (the standard, fraud-relevant split); hiding reserves is a documented stretch.
- Trusted setup uses the real Perpetual Powers of Tau; a production deployment would run its own ceremony.
- Internal customer ledger is realistic seeded data over the real circuit/contract path — the numbers are ours, the cryptography and transactions are real.
