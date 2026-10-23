# Kage — 30-Day Sprint Scope

**Goal:** take Kage from "the pool works on mainnet" to "an agent developer can plug it in and
trust it": settle the first agent payments through a SessionAccount on mainnet, close two
privacy gaps (public deposit amounts, single-party trusted setup), and make the
agent integration one command.

**Starting point (day 0, verifiable today):**

| Item | State |
|---|---|
| Web app | Live at https://kageai.me (Vercel + Neon) |
| Mainnet pool | `CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV` (native XLM), 32 notes |
| Mainnet activity | 20 wallets, 101 transactions, all successful on Horizon (`scripts/verify-mainnet.sh`) |
| Agent path | Fabric MCP live at `kageai.me/fabric/mcp`, bound to the mainnet pool |
| Open items | amount in the deposit event, single-party phase-2 setup, unbounded root/nullifier sets |

---

## Week 1 — First agent payments on mainnet

| Deliverable | Acceptance (how anyone can check it) |
|---|---|
| Mainnet SessionAccount provisioned for the demo agent (cap + expiry) | Contract ID in the README; `policy` and `remaining` readable on stellar.expert |
| An agent connected to `kageai.me/fabric/mcp` pays through `kage_pay` | Mainnet deposit tx hash from the fabric; pool `leaf_count` goes from 32 to 33 |
| `/status` reports fabric and database health as live checks | Stopping the fabric turns its row red |
| `verify-mainnet.sh` covers the new transactions | Script output pasted in the README |

## Week 2 — Hide amounts

| Deliverable | Acceptance |
|---|---|
| Fixed-denomination notes (e.g. 1 / 10 / 100 XLM) in pool v2 | Deposit event no longer carries a free-form amount; a contract test rejects a non-denominated deposit |
| SDK splits an arbitrary payment into denominations + change | Unit tests cover split/merge round-trips; a 37 XLM agent payment settles as 3×10 + 7×1 notes |
| Pool v2 on mainnet | Contract ID in the README; deposit → withdraw re-run on v2 with tx hashes |

## Week 3 — Multi-party trusted setup

| Deliverable | Acceptance |
|---|---|
| Phase-2 ceremony for both circuits with ≥ 5 independent contributors | Contribution hashes + attestations in `circuits/ceremony/`; `snarkjs zkey verify` passes on the final zkeys |
| Ceremony verifying keys registered on pool v2 | On-chain VK bytes match the exported keys (check runs in CI) |
| A proof from the old single-party zkey is rejected by v2 | Failing contract test + recorded failed tx |

## Week 4 — One-command agent integration

| Deliverable | Acceptance |
|---|---|
| `kage` npm package: provision a scoped SessionAccount and print an MCP config | `npx kage init --cap 20 --expiry 7d` on a clean machine yields a working mainnet session |
| Policy proof in the app: agent tries to overspend and to pay after expiry | Both rejected inside `__check_auth` (`CapExceeded`, `Expired`); shown on `/dashboard` |
| 3 agent setups from outside the team settle at least one private payment each | Their SessionAccount IDs + tx hashes listed in the README |
| Stretch: bounded storage for seen roots + spent nullifiers | Contract test over 10k inserts shows bounded growth |

---

## Next milestone — product track

The sprint above hardens the protocol. This milestone turns Kage into a product an agent
developer signs up for, connects in one click, and pays real services through. Same rule:
nothing is done without a link, a tx hash, or a test name.

| Deliverable | Acceptance (how anyone can check it) |
|---|---|
| **Non-custodial provisioning** — the owner signs the SessionAccount deploy in the browser; the server never receives an owner secret | `/api/fabric/provision` rejects any request body carrying a secret (route test); a mainnet provision tx signed client-side |
| **Accounts** — Google sign-in that stores only the public address and SessionAccount ID; the key stays encrypted on the user's device | DB schema has no key column; signing in on a second device restores the dashboard without exposing a key |
| **Network switch** — mainnet / testnet toggle, active network shown on every page | Testnet pool + SessionAccount IDs in the README; a testnet payment and a mainnet payment from the same UI, both with tx hashes |
| **One-click MCP connect** — OAuth on the fabric MCP endpoint plus "Connect" buttons for assistants that support remote MCP connectors (no copy-pasted config) | A fresh assistant account connects from the website and runs `kage_pool_status`; recorded walkthrough in the README |
| **Marketplace with real services** — Kage's own paid tools plus at least 3 external APIs behind x402 | Each listing callable from the marketplace with a settled payment tx hash; no listing without a working endpoint |
| **Private / public MCP servers** — visibility enforced server-side, not only hidden in the UI | Non-owner call to a private server returns 403 (route test); public servers listed in the marketplace |
| **Contract review → external audit** — internal review of `veil` and `session`, fixes landed, then an external audit | Review findings + fixing commits in `docs/`; audit report linked when delivered |
| **USDC pool** — a second pool for the stablecoin agents actually pay in | Mainnet USDC pool ID in the README; deposit → withdraw tx hashes |

---

## Out of scope for this sprint

- Third-party audit inside the 30 days (it is in the next milestone; the ceremony and review fixes here are its prerequisites).
- Assets beyond native XLM (USDC is in the next milestone).
- Separate view and spend keys for stealth notes.

## Definition of done

Every row above has a link, a tx hash, or a test name next to it in the README.
Nothing is marked done on a description alone.
