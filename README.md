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
  <img src="https://img.shields.io/badge/ZK-Groth16_·_BN254-00FF88?style=for-the-badge" alt="ZK" />
  <img src="https://img.shields.io/badge/Soroban-Rust-363636?style=for-the-badge" alt="Soroban" />
</p>

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
git clone https://github.com/Venkat5599/stellar.git
cd stellar

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

<div align="center">

## Built for Stellar Hacks · Real-World ZK 🕶️

**Autonomy without custody. Settlement without surveillance.**

*Private payments for autonomous agents on Stellar.*

</div>
