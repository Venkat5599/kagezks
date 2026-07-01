# Veil

**Private payments for autonomous agents on Stellar.** An AI agent pays in USDC
under a **scoped key it can't drain**, with the **amount, the recipient, and the
agent→payee link hidden in zero-knowledge.**

> Stellar Hacks · Real-World ZK. Inspired by
> [`nschwermann/agent_fabric`](https://github.com/nschwermann/agent_fabric)'s
> thesis — let an AI agent execute on-chain *without holding your key* — ported
> to Stellar and made **private**. Their version is Cronos EVM with public swaps;
> Veil is Stellar with **ZK-private settlement**. ZK is load-bearing: remove it
> and every agent payment — who, how much, the whole treasury map — is public.

### The problem

Give an autonomous agent a key and let it pay on a transparent chain, and you
publish **every counterparty, every amount, and a map of everything your treasury
touches.** "Just give it a hot wallet" also means the agent (or whoever
compromises it) can **drain you**. Veil fixes both: the agent is *scoped* so it
can never drain or redirect funds, and each payment is *sealed* so no observer
learns who it paid or how much.

| Hand an agent a raw key on a transparent chain… | Veil fixes it with… |
|---|---|
| The agent (or an attacker) can move **all** your funds | A scoped session key: only `Veil.deposit`, only USDC → pool, up to a cap, before an expiry |
| Every payment publishes **counterparty + amount** | Amounts and the agent→payee link are hidden in a ZK pool |
| Recurring transfers **deanonymise** everyone the agent pays | Each payee is paid at a fresh one-time stealth address |
| "Just encrypt it / trust our server" still **trusts a custodian** | Scope + unlinkability are enforced by math and the chain, not a custodian |

Built on a proven ZK stack (Circom + snarkjs Groth16, Poseidon, Soroban
**BN254** verifier), reusing crypto from an earlier build, repointed at agent
payment privacy.

---

## Agent Fabric — autonomy without custody

Inspired by [agent_fabric](https://github.com/nschwermann/agent_fabric)'s thesis
(let AI agents execute on-chain *without* holding your key), ported to Stellar
and made **private** with the ZK pool.

EVM does this with ERC-7702 session keys. Stellar's equivalent is a **custom
account contract** (`contracts/.../session/`). An owner funds it and delegates one
**agent session key** under a policy enforced in `__check_auth`:

- the agent may call **only `Veil.deposit`** on the configured pool,
- move **only USDC**, **only into that pool**,
- up to a **spend cap**, and **before an expiry**.

Any other contract, method, over-cap amount, or wrong payout reverts
(`BadPayout` / `CapExceeded` / `Expired` / `ContextNotAllowed`). So the agent
acts autonomously, can never drain or redirect funds (no custody), and — because
its one allowed action routes through Veil — its payment graph is **ZK-private**:
the chain never sees who the agent paid or how much.

```bash
bun run agent:fabric   # deploy session account, delegate agent key, set policy + cap, fund it
```

`session_account.wasm` builds clean (~7.2 KB); the policy is enforced on-chain in
`__check_auth`. The agent signs the Soroban auth entry with its session key — the
shared engine (`sdk/veil-onchain.ts::payThroughSession`) drives the whole hop.

## The two privacy layers

| Layer | Hides | How |
|-------|-------|-----|
| **Stealth notes** (Umbra-style) | *which payee* the agent paid | A payee publishes a scan key `V` once. The agent does ECDH (`shared = r·V`), derives the note secrets from `shared`, announces only the ephemeral `R`. Only `V`'s holder recomputes `shared = v·R` and finds their payment. |
| **ZK shielded pool** (Tornado/Privacy-Pools-style) | *that two payouts share one agent*, and the amount link | Each deposit inserts a Poseidon commitment into a Merkle tree. A payee's withdrawal proves in zero knowledge it owns *some* unspent leaf — without revealing which — plus a fresh nullifier (no double-claim). |

The chain only ever sees: commitments, random `R` values, a Merkle root, and
nullifier hashes. Never a payee's identity, an amount tied to a person, or a link
from the agent's deposit to a payee's withdrawal.

## Why ZK is load-bearing

- **Remove the pool proof** → each withdrawal must name the agent's deposit → the whole payment graph is public → no privacy.
- **Remove the nullifier** → a note is claimable twice → the pool drains.
- **Remove the recipient binding** → a relayer/observer front-runs a payee's withdrawal and redirects the funds.

## How the tree stays trustless without on-chain Poseidon

Stellar's host Poseidon2 constants don't match circomlib's Poseidon, so the
contract can't recompute the circuit's root on-chain. Instead, **every deposit
carries a Groth16 "insert" proof** that `new_root` correctly appends
`commitment` to the tree at the contract's current root. The contract checks
`old_root == current`, runs only the BN254 pairing check, and advances the root.
All hashing stays in circomlib-Poseidon land; the contract trusts no root it
didn't verify.

The insert proof **also binds the deposited `amount` to the commitment**: it
proves `commitment == Poseidon(amount, secret, nullifier)` for the exact USDC
amount the contract pulls (passed as a public input). Without this, a depositor
could commit a large-value note while transferring little USDC and later
over-withdraw — draining the pool (an accounting desync). The same `amount` is
what the withdraw circuit binds, so **what is deposited is exactly what can be
withdrawn.**

## Components

```
circuits/
  veil_withdraw.circom   membership + nullifier + amount range + recipient bind
  veil_insert.circom     old_root -> new_root append proof + amount binding (per deposit)
sdk/
  veil.ts                X25519 ECDH stealth notes, Poseidon Merkle tree, stealth Stellar addr
  veil-onchain.ts        payThroughSession: the agent's scoped, ZK-private deposit (no browser dep)
  veil-convert.ts        snarkjs -> Soroban BN254 byte layout
contracts/.../veil/      Soroban pool: deposit (insert-verify), withdraw (membership-verify + nullifier)
contracts/.../session/   scoped session account (__check_auth policy): agent autonomy without custody
scripts/
  agent-fabric.ts        deploy a scoped session, delegate an agent key, fund it
  veil-flow.ts           full off-chain flow: derive -> tree -> recognise -> prove
  veil-e2e-gen.ts        build a consistent on-chain deposit->withdraw scenario
  veil-gen-insert.ts     build an insert witness
```

Public-input layouts (contract mirrors circuits exactly):
- insert: `[old_root, new_root, commitment, leaf_index, amount]`
- withdraw: `[root, nullifier_hash, recipient, amount]`

## Proven end-to-end (real testnet transactions)

- **Contract (testnet):** [`CCM4HXQH…23YD`](https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD)
- **Deposit** — the on-chain **insert proof** verified (BN254), USDC pulled into the pool, commitment + ephemeral pubkey announced.
- **Withdraw** — the **membership proof** verified, payout paid to a **stealth address** bound into the proof (keccak(ScAddress) matched cross-language). No deposit↔withdrawal link on chain.
- **Double-spend rejected** — replaying the same nullifier reverts with `NullifierUsed (#9)`.

> Note: the contract above was deployed before the deposit **amount-binding** fix.
> Re-deploy the current `veil.wasm` + `set_vks` with the new insert VK before
> running live deposits again (the insert proof now carries a 5th public input).

### Local (real Groth16)

- Withdraw circuit: 3005 constraints, proves + `snarkjs verify` OK.
- Insert circuit: 5238 constraints, proves + `snarkjs verify` OK (now also binds `amount` into the commitment).
- Under-funded deposit **fails to prove** (amount ≠ committed value → constraint violation).
- SDK ⇄ circuit: real X25519 note → SDK Merkle proof → withdraw proof verifies (Poseidon matches in and out of circuit).
- Payee recognises its own ECDH note; one-time stealth Stellar address derived.

## Run it

Prereqs: `bun`, `circom`, `snarkjs`, Rust (GNU toolchain on Windows), `stellar` CLI, a funded testnet identity.

```bash
bun install

# circuits (reuses the existing pot14 ptau)
bun run circuit:withdraw && bun run circuit:insert
# (one-time) snarkjs groth16 setup + zkey contribute + export verificationkey for each

# off-chain end-to-end (derive -> tree -> recognise -> prove)
bun run flow
snarkjs groth16 verify circuits/build/veil_vk.json \
  circuits/build/veil_flow_public.json circuits/build/veil_flow_proof.json

# contract
cd contracts/solvency && stellar contract build && cd ../..
bun run convert     # snarkjs vk/proof -> Soroban bytes

# scoped agent session (autonomy without custody)
bun run agent:fabric
```

## Honesty ledger

- **Testnet only.** No mainnet, no real funds.
- Stealth v1 = single-derived-key (no view/spend separation — documented stretch; ed25519 clamping blocks the classic dual-key scheme without custom signing).
- Demo tree depth 10 (1024 notes); identical circuit scales to depth 20.
- Fixed-denomination notes in the demo for a clean anonymity set (the circuit range-checks any amount < 2^64).
- Trusted setup reuses the real Hermez Perpetual Powers of Tau.
- The ZK and every transaction are real; only the parties are ours.

See `VEIL.md` for the full architecture.
