# Plan — Veil agent-facing layer (MCP + x402 + workflow + demo agent), ZK on Stellar

## Context

Veil already has the **on-chain primitives** for "autonomy without custody + ZK-private settlement"
on Stellar: a Soroban `SessionAccount` custom account (scoped agent key, `__check_auth`
policy), a Groth16/BN254 ZK shielded pool, stealth notes, and a proven testnet e2e
(deposit → withdraw → double-spend reject).

What it is **missing** is the **agent-facing surface** that the reference project
`nschwermann/agent_fabric` has (theirs is Cronos EVM, public swaps; ours is Stellar, ZK-private):

| Layer | agent_fabric | Veil today |
|---|---|---|
| MCP server (tools an LLM agent calls) | ✅ | ❌ |
| x402 usage-based metering (pay-per-call) | ✅ | ❌ |
| Workflow composition (multi-step + conditional) | ✅ | ❌ |
| Scoped on-chain account | ✅ ERC-7702 | ✅ SessionAccount |
| Settlement | public swap | ✅ **ZK-private pool** |

Decisions (confirmed with user): **build on the proven core** (do NOT wipe the working ZK
pool / SessionAccount), and build **all four** layers — MCP server, x402 metering, workflow
composition, and a live demo agent.

Outcome: an LLM agent (Claude) discovers Veil tools over MCP, is metered per call via x402,
runs a reusable workflow, and autonomously makes a payment that is **scoped (can't drain) and
ZK-private (who/amount/agent↔payee link hidden)** — all on Stellar.

---

## Architecture (target)

```
 LLM agent (Claude)                  Veil MCP server (Express + @modelcontextprotocol/sdk)
   │  discover tools  ───────────►   tools: veil_quote, veil_pay, veil_pool_status, veil_budget
   │                                      │
   │  call veil_pay  ──(x402 402)──►  x402 middleware: challenge → verify payment → allow
   │                                      │
   │                                 workflow engine: [check budget] → [pay] → [confirm]
   │                                      │
   │                                 veil-onchain engine (shared TS):
   │                                   derive note (sdk/veil.ts)
   │                                   groth16 insert proof (snarkjs)
   │                                   deposit(from = SessionAccount), agent-key signs auth
   ▼                                      │
 result {commitment, tx}            SessionAccount.__check_auth gates → Veil ZK pool (Soroban)
```

The MCP server enforces **nothing** about spend itself — the chain (`SessionAccount.__check_auth`)
is the trust anchor. MCP/x402/workflow are convenience + economic + discovery layers on top.

---

## What to build

### 1. Shared on-chain engine — `sdk/veil-onchain.ts` (NEW, the keystone)
Extract the programmatic logic that already exists in `frontend/lib/veil-chain.ts`
(`deposit()`, `withdraw()`, tree rebuild from events, `snarkjs.groth16.fullProve`) into a
Node/bun-usable module with **no browser/Freighter dependency**, so both the frontend and the
MCP server import the same code.
- `payThroughSession({ sessionId, agentSecret, recipientScanKey, amount })`:
  1. read pool state (root, leaf_count) via RPC (reuse pattern in `frontend/app/api/veil/route.ts`).
  2. derive note — `deriveNoteForRecipient` (`sdk/veil.ts`).
  3. compute new root + leaf index — `MerkleTree` (`sdk/veil.ts`).
  4. generate insert proof — snarkjs `groth16.fullProve` against `circuits/build` artifacts
     (reuse the wasm/zkey already served at `frontend/public/zk/`).
  5. build `deposit(from = SessionAccount, …)` invocation; sign the **Soroban auth entry**
     with the **agent session key** (ed25519) — mirrors `scripts/agent-fabric.ts` intent and
     `SessionAccount` signature type `BytesN<64>`.
  6. submit; return `{ commitment, ephemeralPub, tx }`.
- `poolStatus()` and `remainingBudget(sessionId)` (reads `SessionAccount.remaining`).
Reuse, do not reinvent: `sdk/veil.ts` (notes/tree/nullifier/recipientField/stealthSeed),
the deposit arg shape from `scripts/veil-deploy.ts:50`, SessionAccount API in
`contracts/solvency/contracts/session/src/lib.rs`.

### 2. MCP server — `agent/mcp-server.ts` (NEW)
Express + `@modelcontextprotocol/sdk` (Streamable HTTP transport). Tools:
- `veil_pool_status` — live root, leaf_count, USDC pooled (read-only).
- `veil_budget` — remaining cap on the agent's SessionAccount.
- `veil_quote` — given amount, return x402 price for the call + pool readiness.
- `veil_pay` — `{ recipientScanKey, amount }` → calls engine `payThroughSession` → ZK-private
  deposit through SessionAccount → returns `{ commitment, tx }`. **This is the agent's action.**
Config via `.env` (session id, agent secret, RPC, contract ids). One source of truth:
read `sdk/build/agent_fabric.json` + `veil_deployment.json` if present.

### 3. x402 metering (wrap `veil_pay`)
HTTP 402 challenge → payment proof in header → verify → execute, giving pay-per-call economics.
- Implement x402 semantics over **Stellar USDC** settlement (the call fee is a tiny USDC
  payment to the operator), since native x402 is EVM-oriented.
- `agent/x402.ts` middleware: issue `402 Payment Required` with a quote; on retry, verify the
  Stellar payment tx (or signed payment intent) before allowing the tool call.
- Honest scope: verification can be a documented stub for the demo if time-boxed; the 402
  handshake + quote + retry path must be real.

### 4. Workflow composition — `agent/workflow.ts` (NEW)
Declarative, reusable, agent-readable steps = `{ tool | onchain | condition }`.
- Ship one flagship workflow `pay-if-budget`: `veil_budget` → (if remaining ≥ amount) →
  `veil_pay` → `veil_pool_status` confirm. Mirrors agent_fabric's compositions but the
  on-chain step is the **ZK deposit**.
- Expose workflows themselves as MCP tools (`workflow_run`, `workflow_list`).

### 5. Demo agent — `agent/demo-agent.ts` (NEW)
An MCP **client** driving Claude: connects to the MCP server, lists tools, and on a natural-
language instruction ("pay this payee 5 USDC privately") selects + runs the `pay-if-budget`
workflow autonomously. Prints the discovered tools, the chosen steps, and the resulting
`commitment` + testnet tx link. This is the live demo.

### 6. Frontend — `frontend/app/agent/page.tsx` (NEW, optional-but-recommended)
A page that shows the agent loop live: tools discovered, x402 quote, workflow steps, and the
resulting ZK-private payment appearing in the pool ledger (reuse `frontend/app/api/veil/route.ts`
+ existing dashboard components). Ties the new layer into the already-reframed agent narrative.

---

## Reuse map (do not rebuild)
- `sdk/veil.ts` — all crypto/notes/tree/recipientField.
- `frontend/lib/veil-chain.ts` — programmatic `deposit`/`withdraw` + `groth16.fullProve` →
  source to extract into `sdk/veil-onchain.ts`.
- `scripts/agent-fabric.ts` — SessionAccount deploy / delegate / fund (run once to provision).
- `contracts/solvency/contracts/session/src/lib.rs` — SessionAccount; **no change** (already
  gates `deposit` + USDC `transfer`→pool, cap, expiry).
- `circuits/build/*` + `frontend/public/zk/*` — proving artifacts.

## Tooling constraints
- bun / bunx only; TypeScript only (per repo rules).
- MCP via official `@modelcontextprotocol/sdk`. Demo agent uses an MCP-capable Claude client.

---

## Verification (end-to-end)
1. Provision once: `bun run agent:fabric` → writes `sdk/build/agent_fabric.json` (session id,
   agent secret, cap, expiry).
2. Start MCP server: `bun run agent/mcp-server.ts`; hit `veil_pool_status` → live testnet root.
3. x402: call `veil_pay` without payment → `402` + quote; retry with payment → proceeds.
4. Engine: `veil_pay` returns a real `commitment` + tx; confirm on
   stellar.expert/testnet and that `leaf_count` incremented and USDC moved into the pool.
5. Scope proof (the differentiator): attempt an off-policy action through the SessionAccount
   (e.g. transfer to a non-pool address, or amount > cap) → reverts in `__check_auth`
   (`BadPayout` / `CapExceeded`). Confirms "can't drain".
6. Privacy proof: show the chain row (commitment / random R / nullifier) reveals no payee,
   amount-to-identity, or agent↔payee link.
7. Demo agent: `bun run agent/demo-agent.ts "pay <scanKey> 5 USDC privately"` → agent discovers
   tools, runs `pay-if-budget`, prints commitment + tx. (Optional) verify on `/agent` page.

## Risks / honest scope
- Agent-signed Soroban auth entry through SessionAccount is the one **untested hop** today
  (memory `veil-agent-fabric`); building the engine (#1) is what finally exercises it on testnet.
- x402 payment **verification** may be stubbed for the demo (handshake real, settlement
  verification documented as stretch) to stay time-boxed.
- Testnet only; demo tree depth 10; fixed-denomination notes for a clean anonymity set.
- Regenerate the CMC/API keys noted in memory after the hackathon (plaintext in repo).
