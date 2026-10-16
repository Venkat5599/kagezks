# Kage — 30-Day Sprint Scope

**Goal:** take Kage from "the pool works on mainnet" to "an agent developer can plug it in and
trust it": settle the first agent payments through a SessionAccount on mainnet, close the two
limits our own review lists (public deposit amounts, single-party trusted setup), and make the
agent integration one command.

**Starting point (day 0, verifiable today):**

| Item | State |
|---|---|
| Web app | Live at https://kageai.me (Vercel + Neon) |
| Mainnet pool | `CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV` (native XLM), 32 notes |
| Mainnet activity | 20 wallets driven by our onboarding run, 101 transactions, all successful on Horizon (`scripts/verify-mainnet.sh`) |
| Agent path | Fabric MCP live at `kageai.me/fabric/mcp`, bound to the mainnet pool; no mainnet SessionAccount yet |
| Known limits | README → Limitations: amount in the deposit event, single-party phase-2 setup, unbounded root/nullifier sets |

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

## Out of scope for this sprint

- Third-party audit (prepared for here: the ceremony and the review fixes are its prerequisites).
- Assets beyond native XLM.
- Separate view and spend keys for stealth notes.

## Definition of done

Every row above has a link, a tx hash, or a test name next to it in the README.
Nothing is marked done on a description alone.
