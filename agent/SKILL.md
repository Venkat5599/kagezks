---
name: veil-private-pay
description: Pay on Stellar privately and without custody. Use when an AI agent needs to send USDC to a payee while keeping the amount, the recipient, and the agent→payee link hidden (zero-knowledge), under a scoped key it cannot drain. Triggers on "pay privately", "private payment", "pay this scan key", "veil pay".
---

# Veil — private payments for autonomous agents

Veil lets an agent pay in USDC on Stellar so **who was paid, how much, and that two
payouts came from the same agent never touch the chain** (a Groth16 ZK proof), while
the agent acts under a **scoped SessionAccount key it cannot drain** (autonomy without
custody). Settlement is a metered x402 call.

## How to use it

The Veil MCP server exposes these tools (connect via the config in
`deploy/veil.mcp.json` — set the URL to your deployment, e.g. `https://<host>/mcp`):

| Tool | Purpose |
|------|---------|
| `veil_pool_status` | live pool root, leaf count, USDC pooled |
| `veil_budget` | remaining scoped cap on the agent's SessionAccount |
| `veil_quote` | x402 price + nonce for a `veil_pay` call |
| `veil_pay` | make a ZK-private payment through the SessionAccount (x402-metered) |
| `workflow_list` / `workflow_run` | run a reusable flow (flagship: `pay-if-budget`) |

## The standard flow (what an agent does)

1. `veil_pool_status` / `veil_budget` — confirm the pool is up and the scoped budget
   covers the amount.
2. `veil_quote { amount }` — get the x402 price + a one-time `nonce`.
3. Pay the x402 fee on-chain (a tiny native payment to the operator, memo = the
   nonce). See `payX402()` in `agent/x402.ts`.
4. `veil_pay { recipientScanKey, amount, payment: { nonce, txHash } }` — the server
   verifies the fee on Horizon, then makes the ZK-private deposit through the
   SessionAccount. Returns `{ commitment, tx }`.

Or do it in one call: `workflow_run { name: "pay-if-budget", recipientScanKey, amount }`
— budget-gate → ZK deposit → confirm.

## Guarantees (why this is safe to give an agent)

- **Can't drain**: the SessionAccount `__check_auth` allows only `Veil.deposit` into
  one pool, only USDC, up to a cap, before an expiry. Anything else reverts on-chain.
- **Can't be seen**: each payment is a Groth16 membership proof over BN254 — the chain
  stores only commitments, a Merkle root, and nullifier hashes.
- **Can't be redirected**: the payout address is bound into the proof.

Testnet only. The reference driver is `scripts/agent-pay.ts`; the LLM-driven client is
`agent/demo-agent.ts`.
