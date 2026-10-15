# Kage — 30-Day Sprint Scope

**Goal:** take Kage from "works on mainnet for a test cohort" to "an agent developer can
plug it in and trust it" — by closing the three limits our own security review lists
(amount leakage, single-party trusted setup, cohort not finished) and making the agent
integration path one command.

**Starting point (day 0, verifiable today):**

| Item | State |
|---|---|
| Web app | Live on Vercel — https://kagezks.vercel.app (kageai.me DNS cut-over pending) |
| Database | Fresh Neon Postgres, schemas in `frontend/lib/schema-users.sql` + `schema-fabric.sql` |
| Mainnet pool | Veil `CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV` (native XLM) |
| Mainnet cohort | 8 / 50 users complete, 40 tx verified on Horizon (`GROWTH-REPORT.md`) |
| Known limits | `docs/security-review.md` §6 (amount in deposit event), §7.2 (single-party phase-2 setup), §7.3 (unbounded root/nullifier sets) |
| Agent path | Fabric MCP server (`agent/fabric-server.ts`) — offline since VPS loss |

---

## Week 1 — Restore and prove the live system

| Deliverable | Acceptance (how anyone can check it) |
|---|---|
| kageai.me served from Vercel, all pages + DB routes green | `curl` of `/`, `/dashboard`, `/api/stats`, `/api/mcp-servers` returns 200 |
| Fabric MCP back online on an always-on host | `https://kageai.me/fabric/mcp` answers an MCP `initialize`; one paid tool call settles on testnet with a tx hash |
| `/status` page reports real checks (RPC, Horizon, DB, fabric, pool leaf count) | Each check is a live call, not a constant; killing the fabric turns its row red |
| Finish the mainnet cohort: 42 remaining fresh wallets | 50 / 50 users, 250 tx hashes, every one resolving on stellar.expert; proof file committed |

## Week 2 — Hide amounts (closes review §6)

| Deliverable | Acceptance |
|---|---|
| Fixed-denomination notes (e.g. 1 / 10 / 100 XLM) in Veil v2 | Deposit event no longer carries a free-form amount; contract test rejects a non-denominated deposit |
| Agent SDK splits an arbitrary payment into denominations + change note | Unit tests cover split/merge round-trips; a 37 XLM agent payment settles as 3×10 + 7×1 notes on testnet |
| Veil v2 deployed to testnet, then mainnet | Contract IDs in README; 10 cohort users re-run deposit → withdraw on v2 |

## Week 3 — Multi-party trusted setup (closes review §7.2)

| Deliverable | Acceptance |
|---|---|
| Phase-2 ceremony for the withdraw + insert circuits with ≥ 5 independent contributors | Contribution hashes + attestations published in `circuits/ceremony/`; `snarkjs zkey verify` passes on the final zkey |
| Verifying key from the ceremony embedded in Veil v2 | On-chain VK bytes match the exported `verification_key.json` (script in CI) |
| Negative test: a proof made with the old single-party zkey is rejected by v2 | Recorded failing tx / contract test |

## Week 4 — One-command agent integration

| Deliverable | Acceptance |
|---|---|
| `kage` npm package: provision a scoped session account (cap + expiry) and print an MCP config | `npx kage init --cap 20 --expiry 7d` on a clean machine yields a working session on testnet |
| Policy proof in the demo: agent tries to overspend / pay after expiry | Both attempts fail inside `__check_auth`; failing tx hashes shown on `/dashboard` |
| 3 external agent setups (outside the team) settle at least one private payment each | Their session account IDs + tx hashes listed in `GROWTH-REPORT.md` |
| Stretch: TTL/archival for seen roots + spent nullifiers (review §7.3) | Storage growth bounded in a contract test over 10k inserts |

---

## Out of scope for this sprint

- Third-party audit (prepared for, not performed: ceremony + review fixes are the prerequisites).
- Additional assets beyond native XLM.
- Full spend/view two-key stealth model.

## Definition of done

Every row above has a link, a tx hash, or a test name next to it in `GROWTH-REPORT.md`.
Nothing is marked done on a description alone.
