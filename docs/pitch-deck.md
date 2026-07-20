# Kage — Pitch Deck

## Private Payments for Autonomous AI Agents on Stellar

**Stellar Journey to Mastery · Blue Belt · July 2026**

---

## Slide 1: Problem

AI agents are the next wave of on-chain activity — paying for APIs, services, data, and
compute. But on a transparent ledger like Stellar, giving an agent a raw private key is
**suicidal**:

- **Every payment is public** — counterparty, amount, frequency, all on-chain forever
- **The agent (or an attacker) can drain you** — no scope, no limits, no undo
- **Recurring payments deanonymise** — pattern analysis reveals your entire treasury graph
- **$800B cross-border payments market** — but agents can't safely participate

> "An AI agent with a raw key on-chain is a walking data breach and a bank account
> with no withdrawal limit."

---

## Slide 2: Solution

**Kage** gives agents "autonomy without custody" and "settlement without surveillance."

| Layer | What it does |
|-------|-------------|
| **Scoped Session Key** | Agent can only deposit USDC into the pool, up to a cap, before expiry. Can't drain, can't redirect. |
| **ZK Shielded Pool** | Tornado/Privacy-Pools-style. Chain sees commitments + Merkle root. Never who paid whom or how much. |
| **Stealth Notes** | Umbra-style one-time addresses. Payee identity never touches the chain. |

```
Raw key:      Agent → Wallet → Ledger  (drainable + fully public)
With Kage:    Agent → Scoped Key → ZK Pool → Ledger
              (can't drain · can't redirect · who/how-much sealed)
```

---

## Slide 3: Architecture

```
OWNER (holds real key)
  │  delegates scoped session key
  ▼
SESSION ACCOUNT (Soroban)
  │  __check_auth: only deposit(), only USDC, up to cap, before expiry
  ▼
KAGE SHIELDED POOL (Soroban)
  ├── deposit(C, R, amount) → verify Groth16 INSERT proof (BN254)
  ├── withdraw(proof, root, nullifier, payee) → verify MEMBERSHIP proof
  ├── Merkle tree advanced trustlessly (no on-chain Poseidon)
  └── nullifier set → double-spend guard
```

**Circuits:** Circom + snarkjs, Groth16 over BN254, Hermez pot14 trusted setup.
**Frontend:** Next.js 16 dashboard with live on-chain event streaming.
**Agent layer:** MCP server + x402 metered payments + agent fabric workflow engine.

---

## Slide 4: Market

**Target:** AI agent operators who need on-chain payment infrastructure without custody risk.

| Segment | Size | Need |
|---------|------|------|
| AI agent platforms | Growing 10x/year | Pay for APIs, data, compute on-chain |
| DAO treasuries | $25B+ TVL | Programmatic payments without multisig overhead |
| Cross-border settlement | $800B market | Privacy-preserving FX between anchors |
| Stellar ecosystem | 7M+ accounts | First ZK privacy layer for agent payments |

**Competitive moat:** ZK + scope + stealth all on Stellar. No competitor has all three on one chain.

---

## Slide 5: Traction

| Metric | Value |
|--------|-------|
| Smart Contracts | 2 (Pool + Session Account) |
| ZK Circuits | 2 (Insert + Withdraw, real Groth16) |
| Testnet TXs Verified | 3 (deposit, withdraw, double-spend reject) |
| Contract Tests | 20 (10 pool + 10 session) |
| Frontend Tests | 17 |
| **Total Tests** | **37 passing, zero warnings** |
| CI/CD Pipeline | GitHub Actions (contract + frontend + lint + audit) |
| Testnet Users | 50+ onboarded |
| User Rating | 4.4/5 |
| Live Demo | kageai.me |
| License | MIT |

---

## Slide 6: Roadmap

| Phase | Focus | Timeline |
|-------|-------|----------|
| Phase 1 (done) | MVP — ZK pool + session + stealth notes on testnet | ✅ |
| Phase 2 (done) | CI/CD, security hardening, test suite, user onboarding | ✅ |
| Phase 3 | Mainnet deployment, external security audit | Q3 2026 |
| Phase 4 | 10+ tokens, view/spend key separation | Q4 2026 |
| Phase 5 | Institutional dashboard, banking integration | 2027 |

---

## Slide 7: Team

**Venkat** — Full-stack + ZK engineer. Built the entire Kage stack: Circom circuits,
Soroban contracts, BN254 verifier integration, stealth notes SDK, and Next.js dashboard.

Built for Stellar Journey to Mastery · July 2026

---

## Slide 8: Funding Ask

| Source | Amount | Use |
|--------|--------|-----|
| SCF | $150K | Mainnet deployment, security audit, 3 corridors, team |
| InstaAward | $5K | Security review, partner onboarding |

**Revenue model:** Protocol fees on settlement volume. Open-source core, paid enterprise features (batch payments, compliance reporting, dedicated RPC).
