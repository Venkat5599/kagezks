# Veil — frontend

The web app for [Veil](../README.md): **private payments for autonomous agents on
Stellar.** A marketing site plus a live shielded-pool dashboard that reads the Veil
contract on testnet and lets a connected wallet deposit into / withdraw from the ZK
pool.

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Motion · Freighter wallet ·
snarkjs (in-browser Groth16 proving).

## What's here

```
app/
  page.tsx           # landing: "Agents that pay. Leak nothing."
  dashboard/page.tsx # live pool dashboard (root, leaf count, deposit/withdraw, agent-fabric)
  api/veil/route.ts  # read-only pool state proxy (RPC)
components/
  hero, how-it-works, feature-showcase, features-bento, convergence, faq, footer
  veil-dashboard.tsx # the dashboard shell (Overview · Connect & pay · Pool ledger ·
                     #   Proven flow · Chain vs private · Agent fabric · The ZK)
  veil-actions.tsx   # connect wallet, deposit, withdraw
lib/
  config.ts          # ⭐ all marketing copy (single source of truth)
  veil-chain.ts      # browser chain layer: pool reads, tree rebuild, prove, submit
  veil-browser.ts    # browser stealth notes + Poseidon Merkle tree (mirrors sdk/veil.ts)
public/
  zk/                # veil_insert.wasm, veil_withdraw.wasm, *_final.zkey, *_vk.json
  veil.json          # deployed contract id + USDC SAC + explorer links
```

## The idea, on screen

- **Landing** frames it: give an AI agent a raw key on a public chain and it leaks
  every payment and can be drained. Veil gives the agent a **scoped key it can't
  drain** and seals each payment in **zero-knowledge**.
- **Dashboard** proves it live: deposit a stealth note (in-browser insert proof),
  watch the pool root advance, withdraw to a fresh stealth address, and see a
  double-spend rejected. The **Agent fabric** section explains autonomy without
  custody (`SessionAccount.__check_auth`).

## Run

```bash
npm install      # (repo root uses bun; the frontend is a standard npm workspace)
npm run dev      # http://localhost:3000
npm run typecheck && npm run lint
```

The dashboard talks to the Veil contract in `public/veil.json` on Stellar testnet.
> The deployed contract predates the deposit **amount-binding** fix — redeploy the
> current `veil.wasm` + `set_vks` and update `public/veil.json` before live deposits
> (the insert proof now carries a 5th public input).

## Editing copy

`lib/config.ts` is the single source of truth for all marketing text (brand, hero,
how-it-works, FAQ, footer). Theme colors live in `app/globals.css`.
