# Kage — Smart Contract Security Review

**Scope:** `contracts/solvency/contracts/veil` (ZK shielded pool) and
`contracts/solvency/contracts/session` (scoped session account), Soroban
(soroban-sdk 26), for the Stellar mainnet deployment.

**Reviewer:** project maintainer (self-review; not a third-party audit).
**Status:** covers the contract surface below; see "Honest scope / limits".

---

## 1. Architecture summary

Two contracts:

1. **Veil** — a Tornado/Privacy-Pools-style shielded pool. Deposits append a
   Poseidon commitment to an incremental Merkle tree and pull the pool token
   (native XLM SAC). Withdrawals prove, in zero knowledge, the right to spend
   ONE note in the tree without revealing which, and pay out to a recipient
   bound into the proof.
2. **SessionAccount** — a custom-auth account that delegates one agent key,
   bounded by policy (`__check_auth` permits only `Veil.deposit` + token
   transfer → pool, within cap, before expiry).

---

## 2. ZK soundness

- Verification runs entirely through Soroban's **native BN254 host functions**
  (`env.crypto().bn254()`: `g1_msm`, `g1_add`, `pairing_check`), not an
  in-wasm pairing library. This removes the largest class of crypto bugs
  (hand-rolled curve math).
- **Insert proof** binds the deposited `amount` into the public inputs and the
  circuit proves `commitment == Poseidon(amount, secret, nullifier)`. A
  depositor cannot commit a large note while under-funding the pool — the
  pulled amount must equal the committed amount.
- **Withdraw proof** binds `recipient = keccak256(ScVal::Address)` (top byte
  zeroed so the 248-bit value is a canonical field element) and the
  `nullifier_hash` into the public inputs. A relayer cannot redirect the payout
  to a different address — the contract recomputes the recipient field from the
  `to` argument and checks it against the proof.

## 3. State-integrity invariants

| Invariant | Enforcement |
|-----------|-------------|
| One-time init | `init` reverts if `Admin` key already set (`AlreadyInitialized`) |
| Admin-gated config | `set_vks` calls `require_admin` |
| Fresh nullifier | `withdraw` reverts on a seen nullifier (`NullifierUsed`) |
| Known root | `withdraw` reverts if root not in the seen-root set (`UnknownRoot`) |
| Correct append | `deposit` reverts unless `old_root == current root` (`StaleRoot`) and `leaf_index == leaf_count` (`BadLeafIndex`) |
| No under-funded note | amount bound into insert proof (see §2) |

## 4. Reentrancy / interaction ordering

`deposit` advances the tree (`CurrentRoot`, `LeafCount`, seen-root) **before**
the token transfer (Checks-Effects-Interactions). The token move is the only
external call and happens last. Soroban host functions (SAC `transfer`) do not
re-enter the calling contract, so the ordering is defense-in-depth.

## 5. Session account (account abstraction)

`__check_auth` gates the delegated agent key to exactly one action —
`Veil.deposit` on the configured pool with the configured token — and enforces:
- `amount <= cap` and `spent + amount <= cap` (cumulative cap),
- `now < expiry`,
- signature is a valid ed25519 over the auth preimage (rebuilt byte-for-byte
  from the submitted entry).

The owner can `revoke` (expiry → 0) or `extend` at any time. The agent key is a
raw `BytesN<64>` signature, never the owner's key — "autonomy without custody".

## 6. Privacy properties

- **Hides the recipient** — payout goes to a fresh one-time stealth address
  (Umbra-style single-derived-key model).
- **Hides the amount + deposit↔withdrawal link** — the ZK membership proof
  breaks the on-chain trail between a deposit and its withdrawal.
- **Known leakage** — the deposit `amount` is published in the deposit event
  (needed so the amount-bound insert proof can be checked). Denomination
  uniformity (fixed-size notes) is recommended to hide amounts in practice.

---

## 7. Honest scope / limits (what this review does NOT cover)

1. **This is a self-review, not a third-party audit.** The belt requirement is
   "audit OR security review approved by mentors/team"; approval is pending the
   reviewer's sign-off.
2. **Trusted setup** — Groth16 requires a trusted setup. Phase 1 reuses the
   Hermez `powers-of-tau` (pot14); the phase-2 contribution is single-party.
   A malicious phase-2 participant could forge proofs; multi-party ceremony is
   the mitigation for production value.
3. **Unbounded storage growth** — the seen-root set and spent-nullifier set grow
   indefinitely (no pruning). Long-term, TTL/archival or a batched-commitment
   scheme should bound this.
4. **Stealth address model** — the single-derived-key scheme is not the full
   Umbra two-key (spend/view) model; see `VEIL.md §5` for the honest scope.
5. **No economic-incentive analysis** (dust/rounding attacks on the pool) beyond
   the amount-binding check above.

## 8. Findings summary

- **Critical:** none found.
- **Informational:** unbounded nullifier/root sets (§7.3); single-party
  phase-2 trusted setup (§7.2); amount leaks in deposit event (§6).
