# Ledgerproof — Product Requirements Document

**Confidential proof-of-solvency for Stellar issuers — prove fully-backed, reveal nothing.**

Version: 1.0 (hackathon scope) · Target: Stellar Hacks — Real-World ZK · Deadline: 2026-06-29 12:00 PST

> Supersedes the earlier `zkTravel` concept. This document is the canonical spec.

---

## 1. Summary

Ledgerproof lets a Stellar-based token issuer (stablecoin, RWA, exchange) prove on-chain that **its reserves are greater than or equal to everything it owes its customers** — a zero-knowledge proof of solvency — **without revealing any individual customer balance**. The reserve side is verified directly on-chain by a Soroban contract (no trust needed); the liability side is proven in zero-knowledge from the issuer's private internal ledger, and every customer can independently verify their balance was included in the total.

It is Nick Szabo's 1990s "confidential auditing" thesis — *prove properties of accounts without revealing the accounts, removing the trusted auditor* — shipped on the chain built for institutional money movement.

## 2. Problem

When a custodian holds customer funds (stablecoin issuer, exchange, RWA platform), customers must trust the claim "every token is backed." That trust failed catastrophically with FTX, Celsius, and Terra. The two ways to give customers certainty both break today:

- **Reveal everything** — publish every account balance. Verifiable, but leaks every customer's private financial position. Illegal under GDPR/data-minimization, commercially suicidal.
- **Trust an auditor** — a quarterly PDF from a trusted third party. Slow, gameable, and exactly the "trusted third party = security hole" that crypto exists to remove. Critically, most proof-of-reserves attestations only verify the *reserve* side and take the *liability* side from the custodian's own word — which is the precise number FTX faked.

No on-chain, continuous, privacy-preserving solvency proof exists on Stellar today.

## 3. Why this is the right shape for "all real"

This idea was chosen specifically because **every input can be real** with no mocked authority:

- Reserves are **real Stellar testnet balances** the contract reads on-chain.
- Liabilities are a **real internal customer ledger** the issuer maintains (we stand up a realistic one — it is real data over real structure, not fabricated numbers injected at proof time).
- The proof, the verification, and the settlement are **real transactions** on live testnet.

There is no mock KYC provider, no mock bank feed, no mock sanctions list — the failure modes that forced earlier concepts to fake an authority. The only thing simulated is *being the issuer*, because no real custodian hands a hackathon their treasury. The README states this plainly.

## 4. Goals & non-goals

### Goals (hackathon)
- G1. Prove in zero-knowledge that `total_liabilities ≤ total_reserves`, with all per-customer balances hidden.
- G2. Verify the reserve total **on-chain** from real Stellar testnet balances (trustless reserve side).
- G3. Verify the Groth16 proof inside a Soroban contract; publish a signed "SOLVENT" attestation on-chain.
- G4. Customer inclusion: any customer can verify (Merkle proof) their balance is part of the proven total — defeats the FTX "omit liabilities" fraud.
- G5. Tamper demo: making the issuer actually insolvent makes the proof fail / the contract reject — shown live.
- G6. Ship a clean demo + open-source repo + 2–3 min video, with an honest README.

### Non-goals (stated in README)
- Auditing a real third-party custodian (we run our own real testnet issuer).
- Hiding the reserve total (v1 reveals reserves, hides liabilities — the standard, fraud-relevant split). Hiding reserves too is a stretch goal.
- Production trusted-setup ceremony (we use the real Hermez/Perpetual Powers of Tau — not a toy ceremony, but document the production path).
- Mainnet (testnet only).
- Off-chain reserve assets (v1 reserves are on-chain Stellar assets so the contract can verify them trustlessly).

## 5. Users / personas

- **Issuer** — runs the testnet token + reserve accounts; generates the solvency proof from its private customer ledger.
- **Customer** — holds a balance on the issuer's internal ledger; wants assurance of backing + that their balance was counted, without exposing it.
- **Public verifier / regulator** — reads the on-chain attestation; confirms "solvent" without seeing any balance.

## 6. User stories

- US1. As an issuer, I prove `liabilities ≤ reserves` and publish it on-chain without revealing any customer balance.
- US2. As the contract, I verify the reserve total myself from on-chain balances, so I never trust the issuer's reserve claim.
- US3. As a customer, I check a Merkle proof that my exact balance is inside the proven liabilities total.
- US4. As a public observer, I read "SOLVENT ✅ as of ledger N" on-chain and learn nothing about any individual.
- US5. As a skeptic, I watch the issuer go insolvent and see the proof fail and the contract refuse the attestation.

## 7. Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Circuit recomputes the liabilities Merkle-sum root from private leaves | Must |
| FR2 | Circuit proves each customer balance is in range `[0, 2^64)` (no negative/overflow tricks) | Must |
| FR3 | Circuit proves `sum(liabilities) ≤ total_reserves` (public input) | Must |
| FR4 | Soroban contract reads real reserve balance(s) on-chain via the Stellar Asset Contract and binds that figure as the proof's `total_reserves` public input | Must |
| FR5 | Soroban contract verifies the Groth16 proof (BN254 host functions) and stores a `SOLVENT` attestation + `liabilities_root` + ledger sequence | Must |
| FR6 | Contract rejects the attestation if the proof is invalid or reserves < liabilities | Must |
| FR7 | Customer-inclusion: tool/endpoint returns a Merkle proof for a given customer leaf against the published root | Must |
| FR8 | All funding, proof submission, and attestation are real testnet transactions, observable on the explorer | Must |
| FR9 | Minimal web UI: issuer "generate + publish proof" view, public "solvency status" view, customer "verify my inclusion" view | Should |
| FR10 | Stretch: hide the reserve total too (commit reserves, prove `≥` over two hidden sums) | Could |

## 8. Success criteria (judge-facing)

- A real Soroban transaction publishes "SOLVENT ✅" while the explorer shows **zero customer balances**.
- The reserve figure is **verified on-chain by the contract**, not asserted by the issuer.
- A customer reconstructs a valid Merkle inclusion proof for their balance against the on-chain root.
- Live: reduce reserves / inflate liabilities below the threshold → proof generation fails or contract rejects → status flips to not-solvent.
- ZK is load-bearing: remove it and the issuer must either expose every customer balance or be trusted on its word.
- README honestly states: testnet, self-run issuer, reserves revealed in v1, real Powers of Tau.

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| "Balances are public on Stellar anyway" | Liabilities live in the issuer's **internal ledger**, off the public chain — that is the private, fraud-prone side. Reserves are intentionally on-chain & verified. |
| Merkle-sum circuit + range checks slip | Pattern is well-trodden; keep the tree shallow (e.g. 2^10 leaves) for the demo, scale later. |
| Soroban reading classic balances | Use Stellar Asset Contract (SAC) balances so the contract can read reserves on-chain. Document this constraint. |
| Groth16 wiring to Soroban | Fork `stellar/soroban-examples/groth16_verifier`; keep public-input layout minimal. |
| "Is this just proof-of-reserves?" | Standard PoR fakes the liability side and is a periodic off-chain PDF. Ours verifies reserves on-chain AND proves the private liability side in ZK with customer inclusion — continuous and on-chain. |
| Proving too slow | Pre-bench; CLI proof-gen for the demo, browser is a stretch. |

## 10. Milestones (to 2026-06-29)

1. **Day 1** — Circom circuit: Merkle-sum tree (Poseidon, BN254) + range checks + `liabilities ≤ reserves`. Local proving on a real seeded ledger. Real Powers of Tau setup.
2. **Day 2** — Soroban contract: Groth16 verify + on-chain reserve read (SAC) + attestation storage. Deploy to testnet; fund reserve accounts with real testnet transactions.
3. **Day 3** — End-to-end on testnet: generate proof → submit → contract verifies reserves on-chain, verifies proof, publishes SOLVENT. Real transactions throughout.
4. **Day 4** — Customer-inclusion Merkle proof tool + tamper demo (insolvency → rejection). Minimal 3-view web UI.
5. **Day 5** — Honest README, 2–3 min live-testnet video, polish. Stretch: hide reserves (FR10).

## 11. Open questions

- Tree depth for the demo (2^10 customers is credible and fast; note scaling path to 2^20).
- Reserve modeling: single reserve account vs basket of SAC assets summed on-chain.
- Proving stack: Circom/Groth16 (cheapest verify, example verifier exists — recommended) vs Noir/UltraHonk.
- Demo narrative: stablecoin issuer vs exchange framing (exchange tells the FTX story more directly).
