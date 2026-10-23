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

## Frontend upgrade (runs alongside weeks 1–4)

The protocol work above only matters if someone who has never used a crypto wallet can
give their AI agent a Stellar account and see what it did. This track makes the website
that path. Rows marked ✅ are already live or verified; the rest land inside the 30 days.

| Week | Deliverable | Acceptance (how anyone can check it) |
|---|---|---|
| ✅ | **Dashboard shows the chain, not empty counters**: private payments in and out, XLM held, slots used, free tools, and the latest pool events with explorer links | `/dashboard` reads 32 payments in / 30 out on mainnet and switches with the network toggle |
| ✅ | **Plain-language pages for every API, workflow and MCP server**, each with a form that runs it and a readable answer | Marketplace cards open a page; "Run" returns a live answer on mainnet and testnet |
| ✅ | **Agent account setup signed in the browser**: the page shows what the user is approving in plain words, checks it, signs it locally, and sends only the signatures | 11 refusal checks + 1 honest setup pass on testnet (`scripts/provision-check.ts`); 24 browser-side refusal tests in `frontend/tests/session-sign.test.ts` (27 tests in the file) |
| ✅ | **MCP server URLs open as a readable page** with connect steps and a direct link per tool | `https://kageai.me/mcp/stellar-tools` in a browser shows 14 tools |
| 1 | **Agent account page**: the live limit, amount spent and expiry read from the contract, with Revoke and Extend buttons signed in the browser | A revoke tx hash; the agent's next payment fails with `Expired` |
| 1 | **Freighter creates agent accounts too**, by signing the same two approvals in the extension | A provision made from a Freighter wallet, with its tx hash |
| 2 | **Secret key encrypted at rest in the browser** with a passphrase (WebCrypto AES-GCM); removed only after the 4-character check | A test shows local storage holds no plaintext secret; unlocking with a wrong passphrase fails |
| 2 | **First-run guide on testnet**: generate a wallet, get free test XLM, create an agent account, watch one private payment land | A new user finishes it without reading docs; a screen recording linked in the README |
| 3 | **Mobile layout pass** for the landing page and dashboard | Screenshots at 390 px wide with no horizontal scroll; every button reachable |
| 3 | **Accessibility and speed** | Lighthouse ≥ 90 for accessibility and performance on `/` and `/dashboard`, report committed |
| 4 | **Activity per agent**: each agent account lists its own payments with plain receipts (who, how much in XLM and dollars, when) | The receipt for a real mainnet agent payment matches stellar.expert |

---

## Next milestone — product track

The sprint above hardens the protocol. This milestone turns Kage into a product an agent
developer signs up for, connects in one click, and pays real services through. Same rule:
nothing is done without a link, a tx hash, or a test name.

| Deliverable | Acceptance (how anyone can check it) |
|---|---|
| **Non-custodial provisioning** ✅ built — the owner signs both setup approvals in the browser; the server never receives an owner secret | Verified on testnet: a request carrying a secret is refused, 11 attack checks refused (`scripts/provision-check.ts`). Still to show: a mainnet provision signed client-side |
| **Accounts** — Google sign-in that stores only the public address and SessionAccount ID; the key stays encrypted on the user's device | DB schema has no key column; signing in on a second device restores the dashboard without exposing a key |
| **Network switch** ✅ shipped — one-click mainnet / testnet toggle across the dashboard | Testnet pool `CCQWGM…GJXC` in the README; testnet payment `f2255956…3786a2d` sent from the dashboard |
| **Stellar agent toolkit** ✅ shipped — 4 MCP servers, 9 read APIs, 5 workflows | `kageai.me/mcp/stellar-tools` lists 14 tools; README shows real output |
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
