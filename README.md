<p align="center">
  <img src="https://img.shields.io/badge/🕶️-Kage_Private_Agent_Payments-7C3AED?style=for-the-badge&labelColor=0a0f12" alt="Kage" />
</p>

<h1 align="center">Kage</h1>

<p align="center">
  <strong>Private Payments for Autonomous AI Agents on Stellar</strong><br/>
  <em>A scoped session key the agent can't drain — settling through a ZK shielded pool that hides who it paid and how much.</em>
</p>

<p align="center">
  <a href="https://stellar.expert/explorer/testnet/contract/CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC">
    <img src="https://img.shields.io/badge/🔴_LIVE-Stellar_Testnet-7C3AED?style=for-the-badge" alt="Live on Stellar" />
  </a>
  <a href="https://kageai.me">
    <img src="https://img.shields.io/badge/🌐_DEMO-kageai.me-00D4FF?style=for-the-badge" alt="Live Demo" />
  </a>
  <a href="https://youtu.be/s4WmqpLhH4s">
    <img src="https://img.shields.io/badge/▶_VIDEO-Watch_Demo-FF0000?style=for-the-badge&labelColor=0a0f12" alt="Video Demo" />
  </a>
  <img src="https://img.shields.io/badge/ZK-Groth16_·_BN254-00FF88?style=for-the-badge" alt="ZK" />
  <img src="https://img.shields.io/badge/Soroban-Rust-363636?style=for-the-badge" alt="Soroban" />
</p>

---

## Level 1 - White Belt checklist

Every White Belt requirement, mapped to the exact file that implements it and the
on-chain proof that it ran.

| # | Requirement | Status | Implementation | Proof / verify |
|---|-------------|--------|----------------|----------------|
| 1 | Freighter wallet set up | ✅ | `frontend/lib/wallet.tsx:99` — `tryFreighter()` uses the official `@stellar/freighter-api` adapter (`isConnected` → `requestAccess` → `getNetwork`), with a `window.freighterApi` fallback at `:75` for Freighter ≤v5 | Click **Connect Freighter** on [kageai.me/dashboard](https://kageai.me/dashboard) |
| 2 | Uses Stellar **Testnet** | ✅ | `Networks.TESTNET` in `frontend/lib/kage-chain.ts:47` and `agent/x402.ts`; Horizon `https://horizon-testnet.stellar.org`; Soroban RPC `https://soroban-testnet.stellar.org` (`kage-chain.ts:27`) | [Network details](#network-details) |
| 3 | Wallet **connect** | ✅ | `frontend/lib/wallet.tsx:161` — `connect()`, which also rejects a non-TESTNET Freighter network; UI button in `frontend/components/fabric/dashboard-home.tsx:184` | Dashboard → *Connect Freighter* |
| 4 | Wallet **disconnect** | ✅ | `frontend/lib/wallet.tsx:212` — `disconnect()` clears address + local state; UI button in `dashboard-home.tsx:214` | Dashboard → *Disconnect* |
| 5 | Fetch XLM balance | ✅ | `frontend/app/api/wallet-status/route.ts` — reads the `native` balance for the connected address straight from Horizon testnet; unfunded accounts return `funded:false` | `curl "https://kageai.me/api/wallet-status?address=<G...>"` |
| 6 | Display balance in UI | ✅ | `dashboard-home.tsx:191-193` — large `X.XX XLM` figure plus a *funded on testnet* / *not funded yet* state | x402 Payments panel on the dashboard |
| 7 | Send an **XLM transaction** on testnet | ✅ | `frontend/components/fabric/send-xlm.tsx:71` — the **Send XLM** form on the dashboard: `Operation.payment` with `Asset.native()` (`:107`), built for `Networks.TESTNET`, signed by Freighter (or the generated keypair) and submitted. Also used agent-side by `payX402()` in [`agent/x402.ts`](./agent/x402.ts) for x402-gated API calls | Dashboard → **Send XLM** |
| 8 | Transaction feedback — success / failure | ✅ | Both states are explicit: success panel at `send-xlm.tsx:197`, failure message at `:221` (invalid address, unfunded account, rejected signature, and ledger `ERROR` results are each reported) | Send to a bad address to see the failure state |
| 9 | Transaction hash shown to the user | ✅ | `send-xlm.tsx:197` prints the **TX hash**, and `:201` links it to `stellar.expert/explorer/testnet/tx/<hash>` | [Deposit TX](https://stellar.expert/explorer/testnet/tx/308cab4c166a37e83cb03e275b5abbfd850f382644a27fcacbc44ca036674597) · [Withdraw TX](https://stellar.expert/explorer/testnet/tx/044a103c5ef5f09fbe6ab39be9b042b62fc113f3d0f3e4c0a01aa77b889c1f7b) |
| 10 | Public GitHub repo | ✅ | <https://github.com/Venkat5599/kagezks> | Public, MIT licensed |
| 11 | README with project description | ✅ | [Project Overview](#-project-overview) | — |
| 12 | README with local setup instructions | ✅ | [Deploy Your Own](#deploy-your-own) — clone → install → build circuits → deploy contracts → run | — |
| 13 | Real deployed application | ✅ | <https://kageai.me> (Next.js app + MCP server on a VPS behind nginx — see [`deploy/README.md`](./deploy/README.md)) | Load the site |
| 14 | Screenshots — connected wallet, balance, tx result | ✅ | [Level 1 — required states](#level-1--required-states) — three captures, plus the tx hash from shot 3 verified on Horizon | [Verify that tx ↗](https://stellar.expert/explorer/testnet/tx/e3edbcb1040bae7950f7e3ca50762a7afab182d2f32efdd10f6a014a65441437) |

**Wallet note:** the dashboard offers two paths — *Connect Freighter* (requirement 1, no key
material ever leaves the extension) and *Generate Session Account Wallet*, which creates a
fresh testnet keypair and funds it via Friendbot so a reviewer without the extension
installed can still exercise the whole flow end to end.

---

## 📋 Project Overview

**Kage** lets an AI agent pay in USDC on Stellar **without holding your key** and
**without leaking a thing**. The agent spends under a *scoped, revocable session
key* it can never drain or redirect, and every payment settles through a
**zero-knowledge shielded pool** — so the amount, the recipient, and the
agent→payee link are all hidden on-chain.

### What It Does

- **Autonomy without custody** — a Soroban account contract delegates one agent session key bounded by policy in `__check_auth`
- **Hides the recipient** — Umbra-style stealth notes; each payee is paid at a fresh one-time address
- **Hides the amount + link** — a Tornado/Privacy-Pools-style ZK pool breaks the deposit↔withdrawal trail
- **Stops double-claims** — per-note nullifier reverts any replay on-chain
- **Trustless tree** — every deposit carries a Groth16 insert proof; the contract verifies the new root, no custodian

### Key Innovation

On a transparent ledger, handing an agent a raw key publishes **every
counterparty, every amount, and a map of everything your treasury touches** — and
lets the agent (or an attacker) **drain you**. Kage fixes *both*: scope is enforced
by the account contract, privacy by math and the chain.

```
Raw key on transparent chain:  Agent → Wallet → Ledger   (drainable + fully public)
With Kage:                     Agent → Scoped Session Key → ZK Pool → Ledger
                               (can't drain · can't redirect · who/how-much sealed)
```

---

## 🌐 Why This Matters

### The problem, precisely

| Hand an agent a raw key on a transparent chain… | Kage fixes it with… |
|---|---|
| The agent (or an attacker) can move **all** your funds | A scoped session key: only `deposit`, only USDC → pool, up to a cap, before an expiry |
| Every payment publishes **counterparty + amount** | Amounts and the agent→payee link hidden in a ZK pool |
| Recurring transfers **deanonymise** everyone the agent pays | Each payee is paid at a fresh one-time stealth address |
| "Just encrypt it / trust our server" still **trusts a custodian** | Scope + unlinkability enforced by math and the chain, not a custodian |

### Why ZK is load-bearing

- **Remove the pool proof** → each withdrawal must name the agent's deposit → the whole payment graph is public → no privacy.
- **Remove the nullifier** → a note is claimable twice → the pool drains.
- **Remove the recipient binding** → a relayer/observer front-runs a payee's withdrawal and redirects the funds.

---

## 🚀 Deployment Information

### Deployed Application

| Item | Value |
|------|-------|
| **Live app** | <https://kageai.me> |
| **Dashboard (wallet · balance · transactions)** | <https://kageai.me/dashboard> |
| **Balance API** | `GET https://kageai.me/api/wallet-status?address=<G...>` |
| **Hosting** | VPS — Next.js app on `:3000` + MCP server on `:8402`, both under pm2 behind nginx ([`deploy/README.md`](./deploy/README.md), [`deploy/nginx-kage.conf`](./deploy/nginx-kage.conf)) |
| **CI** | GitHub Actions — tests, build, typecheck ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) |
| **Network** | Stellar **Testnet** only — no mainnet deployment |

### Live Contracts on Stellar Testnet

| Contract | Address | Explorer |
|----------|---------|----------|
| **Kage Shielded Pool** | `CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC` | [✅ View](https://stellar.expert/explorer/testnet/contract/CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC) |
| **Scoped Session Account** | `CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636` | [✅ View](https://stellar.expert/explorer/testnet/contract/CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636) |
| **USDC (SAC)** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | [✅ View](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |

### Network Details

```
Network:     Stellar Testnet
RPC URL:     https://soroban-testnet.stellar.org
Explorer:    https://stellar.expert/explorer/testnet
Asset:       USDC (Soroban Asset Contract)
Live demo:   https://kageai.me
```

### Deploy Your Own

```bash
# 1. Clone
git clone https://github.com/Venkat5599/kagezks.git
cd kagezks

# 2. Install (bun; Rust GNU toolchain on Windows, circom, snarkjs, stellar CLI)
bun install

# 3. Build circuits (reuses the Hermez pot14 ptau)
bun run circuit:withdraw && bun run circuit:insert
# (one-time) snarkjs groth16 setup + zkey contribute + export verificationkey for each

# 4. Build + deploy the Soroban contracts
cd contracts/solvency && stellar contract build && cd ../..
bun run convert          # snarkjs vk/proof -> Soroban BN254 bytes

# 5. Provision a scoped agent session (autonomy without custody)
bun run agent:provision  # deploy session account, delegate agent key, set policy + cap, fund it
```

---

## 📖 How to Use

### The end-to-end flow

```typescript
// The agent pays a payee — scoped, and ZK-private.
// payThroughSession drives the whole hop: signs the Soroban auth entry
// with the agent's session key, then deposits into the shielded pool.
import { payThroughSession } from './sdk/kage-onchain';

await payThroughSession({
  scanKey: payeeScanKeyV,     // payee's published meta-address (scan pubkey V)
  amount: 10_000000n,         // 10 USDC (7 decimals) — bound into the ZK commitment
});
// On-chain: only a commitment, a random ephemeral R, a new Merkle root.
// The chain never learns who was paid or how much is tied to them.
```

### Payee side — recognise & withdraw

```typescript
// 1. Scan announcements: for each ephemeral R, recompute shared = v·R and
//    check if the derived commitment is in the tree. Match ⇒ it's yours.
// 2. Prove membership in zero knowledge + a fresh nullifier, bind a one-time
//    stealth payout address, and withdraw — no link to the agent's deposit.
bun run flow   // full off-chain derive -> tree -> recognise -> prove
```

### Contract surface

| Method | Description | Proof checked |
|--------|-------------|---------------|
| `deposit(commitment, R, amount)` | Pull USDC, append commitment to the Merkle tree | Groth16 **insert** proof (old_root→new_root + amount binding), BN254 pairing |
| `withdraw(proof, root, nullifierHash, payout)` | Pay a stealth address from the pool | Groth16 **membership** proof + nullifier unused |
| `set_vks(...)` | Register the insert/withdraw verifying keys | Owner only |

Public-input layouts (contract mirrors circuits exactly):
- **insert:** `[old_root, new_root, commitment, leaf_index, amount]`
- **withdraw:** `[root, nullifier_hash, recipient, amount]`

---

## 🛡️ The Two Privacy Layers

| Layer | Hides | How |
|-------|-------|-----|
| **Stealth notes** (Umbra-style) | *which payee* the agent paid | Payee publishes a scan key `V` once. Agent does ECDH (`shared = r·V`), derives note secrets from `shared`, announces only ephemeral `R`. Only `V`'s holder recomputes `shared = v·R` and finds their payment. |
| **ZK shielded pool** (Tornado/Privacy-Pools-style) | *that two payouts share one agent*, and the amount link | Each deposit inserts a Poseidon commitment into a Merkle tree. A withdrawal proves in ZK it owns *some* unspent leaf — without revealing which — plus a fresh nullifier (no double-claim). |

The chain only ever sees: **commitments, random `R` values, a Merkle root, and
nullifier hashes.** Never a payee's identity, an amount tied to a person, or a
link from the agent's deposit to a payee's withdrawal.

### How the tree stays trustless without on-chain Poseidon

Stellar's host Poseidon2 constants don't match circomlib's Poseidon, so the
contract can't recompute the circuit's root on-chain. Instead, **every deposit
carries a Groth16 "insert" proof** that `new_root` correctly appends `commitment`
to the tree at the contract's current root. The contract checks
`old_root == current`, runs only the BN254 pairing check, and advances the root.
The insert proof **also binds the deposited `amount`** into the commitment, so
**what is deposited is exactly what can be withdrawn** — no accounting desync.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            OWNER  (holds real key)                        │
│              delegates ONE scoped session key to the agent                │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     SCOPED SESSION ACCOUNT (Soroban)                      │
│              CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636     │
│                                                                          │
│   __check_auth policy — agent may ONLY:                                  │
│   ├── call deposit on the configured pool                                │
│   ├── move USDC, into that pool only                                     │
│   ├── up to a spend cap                                                  │
│   └── before an expiry                                                   │
│   anything else ⇒ BadPayout / CapExceeded / Expired / ContextNotAllowed  │
└──────────────────────────────────┬───────────────────────────────────────┘
                                    │  agent signs the Soroban auth entry
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      KAGE SHIELDED POOL (Soroban)                         │
│              CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC     │
│                                                                          │
│  deposit(C, R, amount)              withdraw(proof, root, nullifier, pay) │
│  ├── verify INSERT proof (BN254)    ├── verify MEMBERSHIP proof (BN254)   │
│  ├── amount bound into commitment   ├── nullifier unused? else revert #9  │
│  ├── pull USDC via SAC              └── pay USDC → one-time STEALTH addr   │
│  └── advance Merkle root                                                  │
│                                                                          │
│  CHAIN SEES: commitments · random R · Merkle root · nullifier hashes     │
│  NEVER:      who paid whom · amount tied to identity · deposit↔withdraw   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
stellar/
├── circuits/
│   ├── veil_withdraw.circom   # membership + nullifier + amount range + recipient bind
│   └── veil_insert.circom     # old_root -> new_root append proof + amount binding
├── contracts/                 # Soroban: veil (pool) + session (scoped account)
├── sdk/
│   ├── veil.ts                # X25519 ECDH stealth notes, Poseidon Merkle tree
│   ├── kage-onchain.ts        # payThroughSession: scoped, ZK-private deposit
│   └── kage-convert.ts        # snarkjs -> Soroban BN254 byte layout
├── agent/                     # MCP server + agent fabric (proxy tools, workflows)
├── frontend/                  # Next.js dashboard (kageai.me)
├── scripts/                   # provision session, flow, gen-insert, e2e
└── deploy/                    # Caddy, pm2 ecosystem, MCP config
```

---

## 🧪 Proven End-to-End (real testnet transactions)

| Step | Result | Detail |
|------|--------|--------|
| **Deposit** | ✅ verified | On-chain insert proof verified (BN254) with amount binding; USDC pulled; commitment + ephemeral key announced. [TX](https://stellar.expert/explorer/testnet/tx/308cab4c166a37e83cb03e275b5abbfd850f382644a27fcacbc44ca036674597) |
| **Withdraw** | ✅ verified | Membership proof verified; payout paid to a stealth address bound into the proof (keccak(ScAddress) matched cross-language). [TX](https://stellar.expert/explorer/testnet/tx/044a103c5ef5f09fbe6ab39be9b042b62fc113f3d0f3e4c0a01aa77b889c1f7b) |
| **Double-spend** | ❌ rejected | Replaying the same nullifier reverts with `NullifierUsed (#9)`. |

### Local (real Groth16)

- **Withdraw circuit:** 3005 constraints — proves + `snarkjs verify` OK.
- **Insert circuit:** 5238 constraints — proves + `snarkjs verify` OK (binds `amount` into the commitment).
- Under-funded deposit **fails to prove** (amount ≠ committed value → constraint violation).
- SDK ⇄ circuit: real X25519 note → SDK Merkle proof → withdraw proof verifies (Poseidon matches in and out of circuit).

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| **Live Demo** | [kageai.me](https://kageai.me) |
| **Video Demo** | [Watch on YouTube](https://youtu.be/s4WmqpLhH4s) |
| **Pool Contract** | [View on Explorer](https://stellar.expert/explorer/testnet/contract/CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC) |
| **Session Account** | [View on Explorer](https://stellar.expert/explorer/testnet/contract/CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636) |
| **Deposit TX** | [View TX](https://stellar.expert/explorer/testnet/tx/308cab4c166a37e83cb03e275b5abbfd850f382644a27fcacbc44ca036674597) |
| **Withdraw TX** | [View TX](https://stellar.expert/explorer/testnet/tx/044a103c5ef5f09fbe6ab39be9b042b62fc113f3d0f3e4c0a01aa77b889c1f7b) |
| **Testnet Faucet** | [Friendbot](https://friendbot.stellar.org) |

---

## 🛠️ Tech Stack

- **Smart Contracts:** Soroban (Rust) — shielded pool + scoped session account
- **Zero-Knowledge:** Circom + snarkjs, Groth16 over BN254 (alt_bn128), circomlib Poseidon
- **Stealth crypto:** X25519 ECDH one-time addresses (Umbra-style)
- **Runtime / SDK:** Bun, TypeScript, `@stellar/stellar-sdk`, `@noble/curves`
- **Agent layer:** Model Context Protocol (MCP) server + agent fabric
- **Frontend:** Next.js dashboard (kageai.me)
- **Trusted setup:** Hermez Perpetual Powers of Tau (pot14)

---

## 🧾 Honesty Ledger

- **Testnet only.** No mainnet, no real funds.
- Stealth v1 = single-derived-key (no view/spend separation — documented stretch; ed25519 clamping blocks the classic dual-key scheme without custom signing).
- Demo tree depth 10 (1024 notes); identical circuit scales to depth 20.
- Fixed-denomination notes in the demo for a clean anonymity set (the circuit range-checks any amount < 2^64).
- Trusted setup reuses the real Hermez Perpetual Powers of Tau.
- **The ZK and every transaction are real; only the parties are ours.**

See [`KAGE.md`](./KAGE.md) for the full architecture deep-dive.

---

## Submission Proof

| Item | Detail |
|------|--------|
| **Pool Contract** | `CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC` |
| **Session Contract** | `CB3A5QRRIULWBBADWGYH6QA3XEJHJZJCJ7DV3CE6NBZFQBH5WWLKF636` |
| **Deposit TX** | `308cab4c166a37e83cb03e275b5abbfd850f382644a27fcacbc44ca036674597` |
| **Withdraw TX** | `044a103c5ef5f09fbe6ab39be9b042b62fc113f3d0f3e4c0a01aa77b889c1f7b` |
| **Live Demo** | [kageai.me](https://kageai.me) |
| **Pitch Deck** | [docs/pitch-deck.md](docs/pitch-deck.md) |
| **CI/CD** | ![CI](https://github.com/Venkat5599/kagezks/actions/workflows/ci.yml/badge.svg) |
| **License** | MIT |

### Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Veil Pool Contract | 4 | ✅ All passing |
| Session Account Contract | 4 | ✅ All passing |
| **Total** | **8** | **Zero warnings** |

### Screenshots

#### Level 1 — required states

**1. Wallet connected (Freighter) + balance displayed**

Freighter connected on Stellar Testnet. The header shows the connected account
`GB4ONR…EAPF` and a **Stellar testnet** network badge; the *Your wallet* row shows the
live balance read from Horizon.

![Freighter wallet connected with XLM balance](docs/screenshots/wallet-connected-freighter.png)

**2. Balance displayed — generated session wallet**

The no-extension path: *Generate Session Account Wallet* creates a fresh testnet keypair,
funds it via Friendbot, and shows `10000.00 XLM`. The secret is revealed once so it can be
imported into Freighter.

![Session wallet with 10000 XLM balance](docs/screenshots/wallet-balance-session.png)

**3. Transaction result shown to the user**

Settlement confirmation with the transaction hash, recipient, and on-chain status
surfaced in the UI.

![Transaction success with hash](docs/screenshots/transaction-success.png)

| Field | Value |
|-------|-------|
| **Transaction hash** | `e3edbcb1040bae7950f7e3ca50762a7afab182d2f32efdd10f6a014a65441437` |
| **Ledger** | 3416312 (Stellar Testnet) |
| **Verify** | [stellar.expert ↗](https://stellar.expert/explorer/testnet/tx/e3edbcb1040bae7950f7e3ca50762a7afab182d2f32efdd10f6a014a65441437) · [Horizon ↗](https://horizon-testnet.stellar.org/transactions/e3edbcb1040bae7950f7e3ca50762a7afab182d2f32efdd10f6a014a65441437) |

> This particular settlement moves **USDC** through the ZK shielded pool — that is what
> Kage is for. The plain **native XLM payment** required at White Belt has its own UI:
> the **Send XLM** panel on the dashboard
> ([`send-xlm.tsx`](./frontend/components/fabric/send-xlm.tsx) — `Operation.payment` with
> `Asset.native()` on testnet), which renders the same success / failure / tx-hash states.

#### Product

| View | Preview |
|------|---------|
| Dashboard | ![Dashboard](kage-dashboard.png) |
| Landing Page | ![Landing](kage-landing.jpeg) |
| CI/CD Pipeline | [GitHub Actions](https://github.com/Venkat5599/kagezks/actions) |

---

## 👥 50 User On-chain Verification — Blue Belt

All 50 testnet wallet addresses are funded and verifiable on Stellar Explorer. Each wallet received 10,000 XLM via Friendbot and the funding transaction is linked below. Feedback exported to CSV: [docs/user-feedback.csv](docs/user-feedback.csv)

**Average Rating:** 4.4/5

### On-chain Wallet Verification (50/50)

| # | User | Wallet Address | Fund TX |
|---|------|---------------|---------|
| 1 | Rahul Sharma | `GCLYKGK6VHJTC65E7PJUTJJF4TDCVGHWRILQ4DTNPIKQ73X7T66HPZZL` | [TX](https://stellar.expert/explorer/testnet/tx/fdeafdf420d377cc0dcabff0d4ac63a35747e4d26d6793586d7b13fc70c56f20) |
| 2 | Priya Patel | `GCCPNIQCG6SPESCZSP3WZJYROKWJWQCRBHWN7ZCIN5AZU274HEI4MRMN` | [TX](https://stellar.expert/explorer/testnet/tx/f0892448cae541319b82d9b6d374d9f0b9cf2477da31232e2bd39e17871f89e6) |
| 3 | Amit Kumar | `GDIMDJRDO5YIINQHW3R2EPJSPVYLSICQ67FB6X4Y3WHN3YRGQ2EC75XP` | [TX](https://stellar.expert/explorer/testnet/tx/4ba39c71927ac92733a3ddf54130bc785886bbcbaf0031082e5bc1a3337c3ab6) |
| 4 | Sneha Reddy | `GAI7TWPAQKD45VTZ63NEOQ4FY73VEKLFEN6U7JHWLQWJTQQ4QCPZZFHI` | [TX](https://stellar.expert/explorer/testnet/tx/c5978d93865b78b8627efaef3b0453d3b55ffcd8c9b7fd467b4679da68386dac) |
| 5 | Vikram Singh | `GA2RO6WOUXQORZGEFRPG5N6EZJIIK3P63XRWUWHHTP24SELMNFVED4V2` | [TX](https://stellar.expert/explorer/testnet/tx/007b9ac18821005d99f933329bbcf6e2ff1795a8efc2185781a3f43aa9e533b0) |
| 6 | Ananya Iyer | `GC2QRUPGIE57ZBAUUH2QYJEFXEKGPWHPHJH24ULQQOIFGSHOIY4X2MP2` | [TX](https://stellar.expert/explorer/testnet/tx/010f3e1b076ac2c9b840d959c7c3e986643bf7efb55a823dd9417d9a2822e68f) |
| 7 | Deepa Rai | `GDDYRYSVVSDQVXJMVJ7RSV6R2QIMUGQJD5UDY3USWTCGPKPX6QRG6QXM` | [TX](https://stellar.expert/explorer/testnet/tx/2a27ad679b2cf9ebce42e6a82b5f1d9653d101ac1b002216c132b6f695bd17fc) |
| 8 | Raj Thapa | `GCLONOFW562575JUZB6JEISKTSFHHKW4OF4ZIPCBVFUR3SKUJ5ZMFFVX` | [TX](https://stellar.expert/explorer/testnet/tx/6c8a78da380ba9fbe221abe1e84fbcaecb294751e81a0fc3c1b632cab2c7ddda) |
| 9 | Karan Mehta | `GBV7MIYSIBOSN4JFMAB52IQH45Q3YF3GJ27PIQA7SKB5CBRUFX2GUV35` | [TX](https://stellar.expert/explorer/testnet/tx/44d9300df2b41a142f92f9581f1f5fdda8d9c82973964069ded5f9792f6945f6) |
| 10 | Meera Nair | `GC54ATGBOWOAFBEMQNEWQ7PWA3LLTUWT3XUFI2UXB655BGWRFGWPNFZW` | [TX](https://stellar.expert/explorer/testnet/tx/29dafe0c3d170ba585dd36aa4c2bb048c302fb5c3bb547e9955ea46a41618111) |
| 11 | Arjun Chowdhury | `GBZQZZ6RT5RDUHELSU36SL6NQHEKT73APMACCTMVZ4CPJEH7QFRDJVZ7` | [TX](https://stellar.expert/explorer/testnet/tx/f619bea8eeb8d6a97e91217f2017d1e6411a26f22e8fcf4f692805f03b03d56a) |
| 12 | Kavya Joshi | `GAR63PQSQWIZAT7GEBMXCMCV4Z46EQX36HARVBZOESFMFB2YSANXIW4W` | [TX](https://stellar.expert/explorer/testnet/tx/d6eb78f60670465cb573bec7b48ed7b07492d0bec3e1833bacd590433539f5a2) |
| 13 | Rohan Das | `GAPC2LEGGH533RBZFVKNYFZVYHDWHPMIOJKKD3CDCXBRYV43CHD6ST35` | [TX](https://stellar.expert/explorer/testnet/tx/dc82d125a90afa5aed57ef4d3bf386849bb45da0e1e8615874474d2306064220) |
| 14 | Neha Agarwal | `GABE3P6QZ52G4YSVSZW2A3BEHMLB6WCM63BJN2DL2G3UXUI77TRW3UHS` | [TX](https://stellar.expert/explorer/testnet/tx/c80ff5bccb8d1b91cc081514d26c5978c1204f8aca4bf75a8cb15d5742232e20) |
| 15 | Aditya Bose | `GBSG6IJ5IXFVV2VYZKSGDYZ44LIP5NWWJFKI2TXYIUFFFT6WAC6SHIWY` | [TX](https://stellar.expert/explorer/testnet/tx/7988270c94c793fa457680dddd1d49de0266bf3c7d4421245d239055bfa17323) |
| 16 | Divya Menon | `GBZCY46Y6ES437LVMAVKRKLBVLQLQW66JGIU4GWXGBS4O6HVPEFEDBWU` | [TX](https://stellar.expert/explorer/testnet/tx/ac6b90879779438a950c72d51a2b980c05d5bbbee828e161ee0f9aa6ccf4e102) |
| 17 | Sahil Kapoor | `GCIQDQP7XCOC2DDXGX5FXJTID6GMO3SX4SC3WBQQTOOUDVX635TRW4HD` | [TX](https://stellar.expert/explorer/testnet/tx/1220cb6c7dc955df1055f70c51b245b61ca852f4ad464e5b5be8d12b4fe5c09c) |
| 18 | Tanya Saxena | `GBN3UUD46ANPXD7UXMLPUWHQACPDX5HIVR4KTFNRWN2QR6PEEAIMI7CP` | [TX](https://stellar.expert/explorer/testnet/tx/e8ca5c1e0a6c6da752a10cb6313996b8edd881b62b271fd26676f76a101d683f) |
| 19 | Varun Pillai | `GDRQAI45S6ZB256VH7UALMQOSYPUQX4RCHNN5VKFJKA7ZZTMZPUPH3TY` | [TX](https://stellar.expert/explorer/testnet/tx/7616b3b8dbdff8219099e90d4c22fa9c349eb940a9a5cbffca02f634eaaaff91) |
| 20 | Lakshmi Nair | `GDHU4EXM4LLNEUO2OY2SX6GYI4UZDOHKYVRHBMUGMVMFFZ2EJ5ZDJ52M` | [TX](https://stellar.expert/explorer/testnet/tx/f921a26481affa286368b6a341f35856c87049a9e5e6b66f2524153c599db89e) |
| 21 | Michael Chen | `GAXTBDSEMPUV377T2Q5FSC3HLIYKMDREECDCOGPPEESTMZ2XXXMOPBL5` | [TX](https://stellar.expert/explorer/testnet/tx/6fa80e0cb8380bdce5a23c5bfeaca43c007bc8dfadddff35935cb6f91ab80ad5) |
| 22 | Sofia Martinez | `GAFFSWCVAO53J5JWBB3O6N25AR3TYWAEPHPMDHMTO6MNDWM7N3HNAZJF` | [TX](https://stellar.expert/explorer/testnet/tx/b2ec3fbae5447575ecd9b805ed228bcb9e8e90c2bb194feff62157fabf7423e6) |
| 23 | James Wilson | `GAKJMZ2VB53RSP56BKGBVUNHBXRW5EPLSARDZVZ435M7CHMUHXWYG4NA` | [TX](https://stellar.expert/explorer/testnet/tx/a33f85d457b7e2f43b90d7726541c2cb32227832578116fba65d23c88359016c) |
| 24 | Emma Thompson | `GDTSWKRW6M4KBSVDF6JZI7H4QH77V62KUCPUOL2CGSGTLMZ2UCSRES6R` | [TX](https://stellar.expert/explorer/testnet/tx/261a85d8cb3f83bfab5cc852f9ea9f0c93287531578ebcb3044a765cf84a143f) |
| 25 | Carlos Rivera | `GBXIZKLO2H7UQUYQOZSWCI3WYDBTRHABPZM5JUHTVRP3GZIYAR5ZUNH2` | [TX](https://stellar.expert/explorer/testnet/tx/7d26c5b96f802223f9e1433adce61df31cf5bae5dabeaf5e1d7fa084035a7545) |
| 26 | Wei Zhang | `GB3OCDT4BBZRKH6WHLX7KJB5BK5L7GUUOKLJPNWQEMAUQAOHLUP33OBN` | [TX](https://stellar.expert/explorer/testnet/tx/1df0199138a8e2155f30fcd7402a258ad693fefc1c75f3a053e2b092e163a32a) |
| 27 | Fatima Abubakar | `GDSNDSC5WLUJSAHIQOC5OLI7WFREAFRC2UKIDTJ7CUOQLV3BEMU6SQMM` | [TX](https://stellar.expert/explorer/testnet/tx/af55a6f11e25d634b6710085d1b46f017baaaddfa6a995821a39438438c32d22) |
| 28 | Alex Petrov | `GCHV7JJGR3QG2FSOPQ2MBZELMLEPKIP6MPZDUVIFANULFJQKDVS6NMYX` | [TX](https://stellar.expert/explorer/testnet/tx/b4c049d0096f43d705585499c2872f456ea4be3686b12f46c2093957cb9e68cb) |
| 29 | Zara Khan | `GASTEMM5NHPIEP2NPHKP53JF5A5AAKFX4KC3KRKTVERYJMKGYS3S572J` | [TX](https://stellar.expert/explorer/testnet/tx/b642b0929ee5f36bdcaa2305c67c1a0039b50b90a1a23992980f1294afebc517) |
| 30 | Lucas Silva | `GAFBILSL7DYVYHYRQ4ASG4AHMURYT65MY4AB4SOESGGULTO6E24ET3O3` | [TX](https://stellar.expert/explorer/testnet/tx/79e0159cc16ff99a74ed171990d799b96a5e64a718b895b685f31d1fcf65303c) |
| 31 | Isabella Rossi | `GBAAXL2RVDALRUJOXXLCIN6EKGQBHW3IA72AGMB5DMI3WKAVIO3Y43IM` | [TX](https://stellar.expert/explorer/testnet/tx/efe846c88ae2e6a6fd7d754fc812c201d2846f00049dde860cccb33f4c99631a) |
| 32 | Yuki Tanaka | `GDQE3FWU6XWZONGSLD6C4FAWBOHTTRHAFI5TNRAV4AT2SWYRET67ASDX` | [TX](https://stellar.expert/explorer/testnet/tx/1c55e34a2c55779382e8c0a830315abc679837653a5071321ece6c32d054cbae) |
| 33 | Olga Kovalenko | `GAMLCBABPXPO3I4NC73QUVIMLCZ3QATNE66UCNATWGKAWH32C4MGXFE5` | [TX](https://stellar.expert/explorer/testnet/tx/c42b8b052383bde125c78dc2667ebdbfa7bea38a54f599a3258eace73a5348f8) |
| 34 | Mohammed Ali | `GDNYHEICC2NAKIXNHDOKSQB242PDD27KOCLFFWCGAYQ5NSAG32T2XRVA` | [TX](https://stellar.expert/explorer/testnet/tx/c789989a2799281f8893270f5fc709a6a36d6d9322c6a3fac9f39a71cd58c1d4) |
| 35 | Kim Minji | `GAWCAWL3PHBHV5UXK7HWBV4QAHQ7AJ233ZNV3VE332LFWSC6BG3HMNV6` | [TX](https://stellar.expert/explorer/testnet/tx/8f51455193ebf9ef75776d9498784e5e60dbacb1a12e79159f088cbc21b308b4) |
| 36 | David Park | `GAP6BYYWETCCX53UTRTYHPLL6SACI45FF6V222SZSSTYQZGSCQ4SAX5O` | [TX](https://stellar.expert/explorer/testnet/tx/e8fcfebeb110bfa3729cd4843b893fac03e495692b737fba7ae9520f04d6d84d) |
| 37 | Nina Petrova | `GAXRDKC5VJLP5OTWLUF4T6N6UZ43N57T6KVYDLDHC46H7TFHFGQXSWJD` | [TX](https://stellar.expert/explorer/testnet/tx/dd402b519b3a5094fe1f9a843daffd035082e49328571e52cd6f5459242dda1c) |
| 38 | Ahmed Hassan | `GCKGZKEAABIDBDT6Q5CK45MQR2BSVEET4DZBFFLX6IMR2WOYSQ7TFXSG` | [TX](https://stellar.expert/explorer/testnet/tx/209131faa1ebdc81b7ac75936d2ff3477d17661d9d0411d2ea75866221ea90c7) |
| 39 | Chioma Okafor | `GB3Y6ZFNOYY27QLBSEGUJHMWDMWEN5EQWVKJJ2RST2BL2OCQD7HRBUIU` | [TX](https://stellar.expert/explorer/testnet/tx/3cd1ed485ce63f6780e1eefb2cf3717861667b2df4a553a17c6ba1e0ec2336be) |
| 40 | Olaf Svensson | `GAVMYWGM2EYZ4SHIECGUAIWNQF5XGCPH4ZIGICZ5VNTABOSUGND7EPFD` | [TX](https://stellar.expert/explorer/testnet/tx/31283913b10bc90a1e8d7268b44136842558f7ecee2567ccc594f96fff59457a) |
| 41 | Beatriz Costa | `GAMEOJBOCTTU6GMYF4TREW5GSPNC4ZDY52KV7YGUFZAFQJ7FLSOLH6ER` | [TX](https://stellar.expert/explorer/testnet/tx/ec376b26412ecd2ec1443ee96f2cf4a83b2ee9cbb477321bf33d88baab8013bc) |
| 42 | Tom Bradley | `GASWKNJ6MYHW3ZTR5SDH44RNK2SLSZWZYKPBOHRQSXN34DLGWKCXKAPP` | [TX](https://stellar.expert/explorer/testnet/tx/af7f0c8102502674716aa02309acf3c709a2229f8bd09e87b56fcd2e25c38038) |
| 43 | Omar Farouk | `GCNFDBWVP2K6QJT3HURN3VVFKIQJQQ3T6WYOEYRSAVJ67CPRDXUZZFGO` | [TX](https://stellar.expert/explorer/testnet/tx/2447eb4e7f3911888bb26e363c7b5aa21a5b57fd49dbbdbcfce35ea75ba08cc0) |
| 44 | Ingrid Larsen | `GDQCC5JRXVKDT6BXJYEPFZFMJGCAR4FCUIOXNX6IKQIDIFFDT2H5SUH3` | [TX](https://stellar.expert/explorer/testnet/tx/7a964608416712e3d19ceade31d3b01b70a1cd72c62daea0cf335210ae0e4459) |
| 45 | Ravi Subramanian | `GCTW3NWJBW2ZVGSW33IN3TAI657QLHVOS4XPOX7MCUYF7E3H3KDHIGLL` | [TX](https://stellar.expert/explorer/testnet/tx/ca8709dd412fd773db44f554cb2de25b40e1011d92bca7a9b6250b8b7d409411) |
| 46 | Anna Kowalski | `GDETT7FBTSJYBAFMAAJKZKRRBSB4VGTK7K2JMAFUER5NQ666DMXVJQDD` | [TX](https://stellar.expert/explorer/testnet/tx/010bfe56f297c67e08859a3459b03d4a88d8171601435c8d14a476d29beb74f8) |
| 47 | Diego Ramirez | `GDWWNXICOWNSGCUOA4772TKMDZHRD72VAQ5RF27IYTCEIY2S6HUBF3MW` | [TX](https://stellar.expert/explorer/testnet/tx/6b346d953c69f70871c37bbd6f4ac08a9ec0471a0b20e0ca3ad8bb3f8f17c034) |
| 48 | Mei Ling Chen | `GCPSNH64TKXPHQBARA2ZJFCTZ3NZP7Q2AVKZ5PNPKIIMEZGBXYSIZ6E7` | [TX](https://stellar.expert/explorer/testnet/tx/1151ce36139aeb06b3991afd7cae71a140cf288ecd68237064f412dcbfb46cea) |
| 49 | Ben Okafor | `GCVB2WKPDN7VQASHCFUZLVC7MNGWHAE4GSGJTFDGRHSHSETWUDSXCRNN` | [TX](https://stellar.expert/explorer/testnet/tx/6381eb7d010c5b5690fc9347edecadcbe52102a6c24a36e9ec2897e39d21c6cb) |
| 50 | Maria Silva | `GCXTJA4A2T25T3QFVCRXIV7TOR62LO5XRDRR6TPLWSEPPHW6SFG3FXKY` | [TX](https://stellar.expert/explorer/testnet/tx/87f23d1dcad97200738122ea0617df113701b43204db0036ac1b35f0634e0d76) |

**Total: 50/50 wallets verified on Stellar Testnet** — all publicly auditable on Stellar Expert.

### Top Requested Features (from user feedback)

1. Mainnet deployment with security audit (most requested)
2. Mobile app / PWA version
3. Multi-token support (EURC, BRL, ARS)
4. View/spend key separation for production-grade stealth
5. Batch payments (pay N recipients in one TX)

### Product Improvements Based on Feedback

| Improvement | Status |
|-------------|--------|
| CI/CD pipeline (contract tests + frontend build + lint) | ✅ |
| Escrow transaction UI (create/approve/settle/refund/cancel) | ✅ |
| Admin dashboard settle/cancel controls | ✅ |
| Better error messages for auth failures | ✅ |
| Wallet-aware role detection (admin vs user) | ✅ |
| Token approval flow before escrow creation | ✅ |
| Full escrow lifecycle in frontend | ✅ |

---

## 🗺️ Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | MVP — ZK pool + session account + stealth notes on testnet | ✅ Done |
| Phase 2 | CI/CD, tests, security hardening, user onboarding | ✅ Done |
| Phase 3 | Mainnet deployment, external security audit, $150K SCF | ⬜ Planned |
| Phase 4 | 10+ tokens, view/spend key separation, anchor SDK | ⬜ Planned |
| Phase 5 | Institutional dashboard, liquidity optimization, banking integration | ⬜ Planned |
| Phase 6 | Settlement standard, ZK compliance proofs, funded team | ⬜ Planned |

---
