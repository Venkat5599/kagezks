<div align="center">

# KAGE

### Private payments for AI agents on Stellar: a session key the agent can't drain, settling through a zero-knowledge pool that hides who it paid.

[![Live](https://img.shields.io/badge/live-kageai.me-7C3AED)](https://kageai.me)
[![Network](https://img.shields.io/badge/Stellar-mainnet-000000)](https://stellar.expert/explorer/public/contract/CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV)
[![CI](https://img.shields.io/github/actions/workflow/status/Venkat5599/kagezks/ci.yml?branch=main&label=CI)](https://github.com/Venkat5599/kagezks/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
![Tests](https://img.shields.io/badge/contract%20tests-9%20passing-2ecc71)
[![X](https://img.shields.io/badge/X-%40Kage__stellar-000000?logo=x)](https://x.com/Kage_stellar)
![Stack](https://img.shields.io/badge/Soroban%20·%20Groth16%2FBN254%20·%20Circom%20·%20MCP-14151a)

**[ Live app ↗ ](https://kageai.me)** · **[ Network status ↗ ](https://kageai.me/status)** · **[ Verify every claim ↓ ](#verify-every-claim-in-one-command)** · **[ 30-day scope ↗ ](docs/SPRINT-SCOPE.md)**

</div>

Give an AI agent a raw Stellar key and two things go wrong at once. It can move everything you own, and every payment it makes is public: each counterparty, each amount, a map of everything your treasury touches. Kage fixes both. The agent signs with a **scoped session key** that a Soroban account contract confines to one action (deposit into the pool, up to a cap, before an expiry), and every payment settles through a **Groth16 shielded pool** where the payee later proves, in zero knowledge, that it owns *some* note without revealing which. The chain sees commitments, random ephemeral keys, a Merkle root and nullifier hashes. It never sees who paid whom.

The pool is live on Stellar mainnet and holds real XLM. The BN254 pairing check runs inside the contract, on chain, on every deposit and every withdrawal.

```
SCOPED  ≠  CUSTODIED          the agent can pay, it cannot drain or redirect
PAID    ≠  LINKED             a withdrawal never names the deposit it spends
PROVEN  ≠  TRUSTED            the pool verifies every root change itself; nobody vouches for the tree
```

## Live status

| Surface | Status | The evidence |
|---|---|---|
| Shielded pool (mainnet) | ✅ live | [`CAEEKIM…GIXLV`](https://stellar.expert/explorer/public/contract/CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV) — `leaf_count = 32` at ledger 64976394 |
| Mainnet transactions | ✅ 101 / 101 successful | 20 wallets × 5 txs + 1 fee-sponsored tx, re-read from Horizon by [`scripts/verify-mainnet.sh`](scripts/verify-mainnet.sh) |
| Web app | ✅ live | [kageai.me](https://kageai.me) — Next.js on Vercel, Neon Postgres |
| Agent fabric (MCP) | ✅ live | `https://kageai.me/fabric/mcp` answers `initialize`; `/fabric/health` reports the mainnet pool |

## The 20-second pitch

Agents are starting to pay for things: APIs, data, compute, each other. On a public ledger that is a privacy leak by default, and handing an agent a key is a custody risk by default. The usual answer is a server that holds the key and promises to behave.

**Kage takes the server out.** Scope is enforced by the account contract's `__check_auth`. Privacy is enforced by a zero-knowledge proof the pool verifies itself. The agent never holds anything it could drain, and an observer of the ledger never learns the payee.

```
Raw key on a public chain:   Agent ──► Wallet ──► Ledger            drainable · fully public

With Kage:                   Agent ──► SessionAccount ──► ZK pool ──► Ledger
                                       (cap · expiry ·    (insert proof     (commitments, R,
                                        pool-only)         + amount bound)   roots, nullifiers)

Payee, later:                scan R with view key ──► prove membership in ZK ──► withdraw to a one-time address
```

---

## Table of contents

- [Verify every claim in one command](#verify-every-claim-in-one-command)
- [Screenshots](#screenshots)
- [What Kage is NOT](#what-kage-is-not)
- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What I built](#what-i-built)
- [Architecture](#architecture)
- [The payment loop, step by step](#the-payment-loop-step-by-step)
- [Where the guarantee is enforced](#where-the-guarantee-is-enforced)
- [Why the ZK is load-bearing](#why-the-zk-is-load-bearing)
- [Engineering decisions & the traps that taught me something](#engineering-decisions--the-traps-that-taught-me-something)
- [Attack → test](#attack--test)
- [The app](#the-app)
- [Security](#security)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Run it yourself](#run-it-yourself)
- [How it's deployed](#how-its-deployed)
- [Roadmap](#roadmap)
- [Tests](#tests)
- [License](#license)

---

## Verify every claim in one command

Every mainnet figure in this README is re-derivable without a key. The script pulls each transaction hash from the proof files, asks Horizon whether it succeeded, then simulates a read of the pool's live leaf count:

```bash
bun install
bash scripts/verify-mainnet.sh
```

Real output, run while writing this README:

```
mainnet txs: 101/101 successful on Horizon (0 failed or missing)
pool CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV
  leaf_count = 32  (ledger 64976394)
```

The 101 hashes live in [`scripts/20-users-mainnet-proof.txt`](scripts/20-users-mainnet-proof.txt) (20 wallets, each funded → deposit → withdraw → two merges) and [`scripts/fee-sponsor-proof.txt`](scripts/fee-sponsor-proof.txt) (one gasless payment through a fee bump). One of each, if you would rather click:

| Step | What the chain checked | Transaction |
|---|---|---|
| Deposit | Groth16 insert proof (BN254 pairing), amount bound into the commitment, XLM pulled into the pool | [`bd2de9fa…9cd0d379`](https://stellar.expert/explorer/public/tx/bd2de9fa7612fbc1b8ac775cd29dcd13907ad1c29520c485363d295a9cd0d379) |
| Withdraw | Groth16 membership proof, nullifier unused, payout address bound into the proof | [`5f3235cc…19461793`](https://stellar.expert/explorer/public/tx/5f3235cc72dd7091d72fc652ecc7bbcfe4599db0663d75a2105e53da19461793) |
| Fee-sponsored payment | user signs with fee 0, sponsor wraps it in a fee bump | [`027cd20c…cd979397`](https://stellar.expert/explorer/public/tx/027cd20c2b04230ad8cfcb94962269bd815c51c29d175b40c3693f2fcd979397) |

## Screenshots

**Landing** — live at [kageai.me](https://kageai.me), captured October 2026.

![Kage landing page on mainnet](docs/screenshots/mainnet-landing.webp)

**Network status** — `/status` re-checks the mainnet RPC, the latest ledger and both contracts on every load (ledger 64976415, protocol v29 at capture).

![Kage network status page showing mainnet RPC healthy](docs/screenshots/mainnet-status.webp)

## What Kage is NOT

- **Not a custodial wallet.** No server holds a key that can move user funds. The fabric's relayer key pays network fees; the SessionAccount policy decides what value can move.
- **Not a mixer you send money through and hope.** The pool's state transitions are each checked by a proof on chain. A deposit that does not prove a correct tree append is rejected; a withdrawal that does not prove membership is rejected.
- **Not encryption on top of a server.** "Encrypt it and trust our backend" still trusts a backend. Here, scope lives in the account contract and unlinkability lives in the proof.

## The problem I set out to solve

| Hand an agent a raw key on a public chain… | Kage's answer |
|---|---|
| The agent, or whoever compromises it, can move **all** your funds | A SessionAccount: only `deposit`, only into the configured pool, up to a cap, before an expiry |
| Every payment publishes **counterparty and amount** | The agent→payee link is broken by a ZK membership proof at withdrawal |
| Paying the same payee twice links them forever | Each payment goes to a fresh one-time stealth address derived by ECDH |
| "Trust our server" | Scope enforced by `__check_auth`; the tree enforced by proofs the contract verifies |

## What I built

- **Veil pool** (`contracts/solvency/contracts/veil`) — a Soroban shielded pool. `deposit` verifies a Groth16 *insert* proof that the new Merkle root correctly appends the commitment and binds the deposited amount; `withdraw` verifies a Groth16 *membership* proof and spends a nullifier.
- **SessionAccount** (`contracts/solvency/contracts/session`) — a custom Soroban account. Its `__check_auth` accepts the agent's ed25519 signature only for `Veil.deposit` and a token transfer into the pool, under the remaining cap, before expiry. The owner can `extend` or `revoke`.
- **Two circuits** (`circuits/`) — `veil_insert.circom` (append proof with amount binding) and `veil_withdraw.circom` (membership, nullifier, amount range, recipient binding).
- **SDK** (`sdk/`) — stealth notes over X25519, the Poseidon tree, snarkjs → Soroban BN254 byte conversion, and `payThroughSession`, which builds the proof and signs the Soroban auth entry with the agent's session key.
- **Agent fabric** (`agent/`) — an MCP server agents connect to. Tools include `kage_pool_status`, `kage_quote`, `kage_budget`, `kage_pay`, `workflow_list` and `workflow_run`; paid tools are gated by an x402-style Stellar payment.
- **Web app** (`frontend/`) — landing, live pool dashboard, API/MCP/workflow builder, status page, and a client-side stealth address tool.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ OWNER — funds the SessionAccount, sets the policy, can revoke            │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ delegates ONE ed25519 session key
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SESSIONACCOUNT (Soroban custom account)                                   │
│   __check_auth: agent may ONLY                                            │
│     · call deposit on the configured pool        else ContextNotAllowed   │
│     · move the token, into that pool only        else BadPayout           │
│     · up to the remaining cap                    else CapExceeded         │
│     · before expiry                              else Expired             │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ agent signs the Soroban auth entry
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ VEIL POOL — mainnet CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV │
│   deposit(C, R, amount, proof)          withdraw(proof, root, nf, payout)  │
│     · old_root == current else #6         · root seen before else #8       │
│     · leaf_index == count else #7         · nullifier unused else #9       │
│     · insert proof (BN254) else #5        · membership proof else #5       │
│     · pull XLM via SAC                    · pay one-time stealth address   │
│   chain stores: commitments · R · roots · nullifier hashes                 │
└──────────────────────────────────────────────────────────────────────────┘
```

| Component | Where | Role |
|---|---|---|
| Veil pool | `contracts/solvency/contracts/veil/src/lib.rs` | tree root, root history, nullifier set, on-chain Groth16 verification |
| SessionAccount | `contracts/solvency/contracts/session/src/lib.rs` | policy-gated auth for the agent key |
| Insert circuit | `circuits/veil_insert.circom` | proves `old_root → new_root` appends `commitment` at `leaf_index`, binds `amount` |
| Withdraw circuit | `circuits/veil_withdraw.circom` | proves membership, derives the nullifier, binds recipient and amount |
| On-chain engine | `sdk/kage-onchain.ts` | proof generation, auth-entry signing, submission |
| Network config | `sdk/network.ts` | one switch for passphrase, RPC, Horizon and deployment IDs (default mainnet) |
| Fabric server | `agent/fabric-server.ts` | MCP over Streamable HTTP, provisioning, workflow runs |

**HTTP surface** (all on `kageai.me`):

| Route | What it does |
|---|---|
| `POST /fabric/mcp` | MCP endpoint for agents (public; settling still needs a per-agent bearer token) |
| `GET /fabric/health` | fabric liveness + the pool it is bound to |
| `GET /api/stats` | live pool read (leaf count) + builder totals |
| `GET /api/wallet-status?address=G…` | native XLM balance from Horizon mainnet |
| `GET /status` | RPC, ledger and contract health, re-checked per load |

## The payment loop, step by step

1. **Publish.** The payee publishes a scan key `V` once (the `/tools/stealth` page generates one in the browser).
2. **Derive.** The agent picks a random `r`, computes `shared = r·V`, and derives the note secrets and commitment from `shared`. Only the ephemeral `R = r·G` is announced.
3. **Prove the append.** The agent builds the new Merkle root off chain and a Groth16 insert proof over `[old_root, new_root, commitment, leaf_index, amount]`.
4. **Deposit through the session.** The agent signs the Soroban auth entry with its session key. `__check_auth` on the SessionAccount checks method, destination, cap and expiry; the pool checks the proof with the BN254 host functions and pulls the XLM.
5. **Recognise.** The payee scans announced `R` values, recomputes `shared = v·R`, and finds the leaves that are theirs.
6. **Withdraw unlinkably.** The payee proves membership of *some* leaf under a known root, reveals only a nullifier hash, and binds a fresh one-time payout address into the proof.

## Where the guarantee is enforced

| Guarantee | Enforced in | Covered by |
|---|---|---|
| Agent can only deposit into the pool | `contracts/solvency/contracts/session/src/lib.rs` `__check_auth` → `ContextNotAllowed`, `BadPayout` | `init_and_policy` |
| Agent cannot exceed its cap or outlive its expiry | `__check_auth` → `CapExceeded`, `Expired` | `extend_updates_cap_and_expiry`, `revoke_zeros_expiry` |
| Policy cannot be re-initialised by someone else | `init` → `AlreadyInitialized` | `init_is_idempotent` (session) |
| Tree only advances by a correct append | `contracts/solvency/contracts/veil/src/lib.rs` `deposit` → `StaleRoot`, `BadLeafIndex`, `InvalidProof` | `deposit_rejects_bad_leaf_index` |
| No proof verification without a registered key | `deposit` → `NoVerificationKey` | `deposit_without_vk_fails` |
| Withdrawals only against a real past root | `withdraw` → `UnknownRoot` | `withdraw_rejects_unknown_root` |
| A note is spent once | `withdraw` → `NullifierUsed (#9)` | mainnet: every withdraw in the proof file spends a distinct nullifier |
| What is deposited is exactly what can be withdrawn | amount is a public input of the insert proof | under-funded deposits fail to prove (constraint violation) |

## Why the ZK is load-bearing

- **Remove the membership proof** and each withdrawal has to name the deposit it spends. The agent's whole payment graph becomes public.
- **Remove the nullifier** and a note can be claimed twice, which drains the pool.
- **Remove the recipient binding** and anyone watching the mempool can copy a payee's proof and redirect the payout.
- **Remove the insert proof** and someone has to be trusted to compute the tree. Stellar's host Poseidon2 uses different constants from circomlib's Poseidon, so the contract cannot recompute the circuit's root itself; the insert proof is how it stays trustless anyway.

## Engineering decisions & the traps that taught me something

- **No on-chain Poseidon, so the tree is proven instead of recomputed.** The contract checks `old_root == current`, runs one pairing check, and advances. It costs a second circuit, and it removes the custodian.
- **The amount had to go into the insert proof.** An early version accepted a commitment and an amount separately, which meant the pool's balance and the notes inside it could drift apart. Binding `amount` as a public input made "deposited = withdrawable" arithmetic rather than bookkeeping.
- **Custom-account signatures are built by hand.** The SessionAccount takes a `BytesN<64>` ed25519 signature over the auth payload, so `sdk/kage-onchain.ts` constructs the signature `ScVal` to match the contract exactly. This was the hop that took longest to get right.
- **RPC event retention is not a database.** Public RPC drops deposit events after a window, which broke tree reconstruction for the next depositor. The SDK keeps a local leaf store and seeds from the known genesis leaf when events have aged out.
- **The public fabric cannot be a faucet.** Provisioning and workflow runs spend the relayer's XLM, so the reverse proxy only forwards them with a gateway token the web app holds; the MCP endpoint itself stays public, and settling still requires a per-agent bearer token.

## Attack → test

| The abuse | What answers it |
|---|---|
| Agent tries to send funds anywhere but the pool | `__check_auth` → `BadPayout` / `ContextNotAllowed` (`init_and_policy`) |
| Agent keeps spending after the owner revokes | `revoke` zeroes expiry → `Expired` (`revoke_zeros_expiry`) |
| Attacker re-initialises the policy with their own key | `AlreadyInitialized` (`init_is_idempotent`) |
| Depositor submits a root that skips or overwrites a leaf | `BadLeafIndex` / `StaleRoot` / `InvalidProof` (`deposit_rejects_bad_leaf_index`) |
| Withdrawal against a fabricated root | `UnknownRoot` (`withdraw_rejects_unknown_root`) |
| Same note withdrawn twice | `NullifierUsed (#9)` |
| Mempool watcher copies a withdrawal proof to redirect it | recipient is a public input of the proof → `RecipientMismatch` / `InvalidProof` |
| Stranger calls `/fabric/provision` to burn relayer XLM | reverse proxy returns 403 without the gateway token (checked live) |

## The app

[kageai.me](https://kageai.me) is the landing page, a live pool dashboard (`/dashboard`) with Freighter connect and a browser-generated session wallet, a builder for x402-priced APIs, MCP servers and workflows, a network status page (`/status`), an API reference (`/docs`), and a client-side stealth address tool (`/tools/stealth`). Freighter must be set to Mainnet; the connect flow refuses any other network.

## Security

The contracts have been through a maintainer self-review covering ZK soundness (verification uses Soroban's native BN254 host functions: `g1_msm`, `g1_add`, `pairing_check`), double-spend protection, ordering of state writes before token transfers, and the SessionAccount policy. No critical issues were found. Report issues privately through GitHub security advisories on this repository.

## Tech stack

- **Contracts:** Soroban (Rust, `soroban-sdk` 26)
- **Zero knowledge:** Circom + snarkjs, Groth16 over BN254, circomlib Poseidon
- **Stealth notes:** X25519 ECDH one-time addresses
- **SDK / agent:** Bun, TypeScript, `@stellar/stellar-sdk`, `@noble/curves`, Model Context Protocol
- **Web:** Next.js 16, React 19, Tailwind v4, Freighter, Neon Postgres
- **Hosting:** Vercel (web), pm2 + Caddy on a VPS (fabric)

## Project layout

```
kagezks/
├── circuits/            veil_insert.circom · veil_withdraw.circom · build/ (vks, sample proofs)
├── contracts/solvency/  Soroban workspace: veil (pool) + session (scoped account), with tests
├── sdk/                 kage.ts (notes, tree) · kage-onchain.ts · kage-convert.ts · network.ts
├── agent/               fabric-server.ts (MCP) · fabric/ (auth, catalog, provision, steps) · x402.ts
├── frontend/            Next.js app served at kageai.me
├── scripts/             deploy-mainnet.sh · verify-mainnet.sh · mainnet proof files
├── deploy/              Caddyfile · pm2 ecosystem · .env.example
└── docs/                SPRINT-SCOPE.md · screenshots/
```

## Run it yourself

```bash
git clone https://github.com/Venkat5599/kagezks.git && cd kagezks
bun install

# contracts + tests
cd contracts/solvency && cargo test && cd ../..

# circuits (needs circom; reuses the pot14 powers of tau)
bun run circuit:withdraw && bun run circuit:insert
bun run convert                      # snarkjs vk/proof -> Soroban BN254 bytes

# agent fabric against mainnet (fee payer secret in deploy/.env, see deploy/.env.example)
set -a; . deploy/.env; set +a
bun run fabric:serve                 # http://localhost:8403/mcp

# web app
cd frontend && npm install && npm run dev
```

## How it's deployed

- **Web:** `frontend/` on Vercel, with `DATABASE_URL` (Neon), `KAGE_FABRIC_URL=https://kageai.me/fabric` and `KAGE_FABRIC_GATEWAY_TOKEN`.
- **Fabric:** `bun run agent/fabric-server.ts` under pm2 on a VPS, env from `deploy/.env`.
- **Edge:** Caddy terminates `kageai.me`, sends `/fabric/mcp` and `/fabric/health` to the fabric, gates the rest of `/fabric/*` on the gateway token, and proxies everything else to Vercel. The block is in [`deploy/Caddyfile`](deploy/Caddyfile).

## Roadmap

The next 30 days, each item with a check anyone can run, are in [`docs/SPRINT-SCOPE.md`](docs/SPRINT-SCOPE.md).

| Phase | Focus | Status |
|---|---|---|
| 1 | ZK pool, SessionAccount, stealth notes | ✅ done |
| 2 | CI, tests, hardening, onboarding | ✅ done |
| 3 | Mainnet pool ✅ · mainnet agent settlement · fixed denominations · multi-party setup | 🟡 in progress |
| 4 | External audit, view/spend key split, more assets | ⬜ planned |
| 5 | One-command agent SDK, outside integrations | ⬜ planned |

## Tests

```bash
cd contracts/solvency && cargo test
```

| Suite | Tests |
|---|---|
| `veil` | `init_and_empty_state`, `init_is_idempotent`, `deposit_rejects_bad_leaf_index`, `deposit_without_vk_fails`, `withdraw_rejects_unknown_root` |
| `session_account` | `init_and_policy`, `init_is_idempotent`, `revoke_zeros_expiry`, `extend_updates_cap_and_expiry` |

Real output from the last run (October 2026):

```
test test::init_and_policy ... ok
test test::extend_updates_cap_and_expiry ... ok
test test::init_is_idempotent ... ok
test test::revoke_zeros_expiry ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s
test test::deposit_without_vk_fails ... ok
test test::deposit_rejects_bad_leaf_index ... ok
test test::init_and_empty_state ... ok
test test::init_is_idempotent ... ok
test test::withdraw_rejects_unknown_root ... ok
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s
```

9 contract tests. CI runs them on every push, then type-checks and builds the web app.

## License

MIT — see [LICENSE](LICENSE).
