# Veil — Soroban contracts

Two Soroban contracts behind [Veil](../../README.md): private payments for
autonomous agents on Stellar (agent_fabric's "autonomy without custody", ported
to Stellar and made ZK-private).

```text
contracts/
├── veil/          # the ZK shielded pool
│   └── src/lib.rs #   deposit (insert-proof + amount binding), withdraw (membership + nullifier)
└── session/       # the scoped agent account ("autonomy without custody")
    └── src/lib.rs #   __check_auth policy: only Veil.deposit, USDC -> pool, under cap, before expiry
```

> Directory name is `solvency` for historical reasons (an earlier build); the
> contracts inside are Veil's `veil` pool and `session` account.

## veil — ZK shielded pool

- `init(admin, usdc, empty_root)` — one-time config.
- `set_vks(insert_vk, withdraw_vk)` — install the Groth16 verification keys (admin).
- `deposit(from, commitment, ephemeral_pubkey, amount, new_root, leaf_index, proof)` —
  verify the BN254 **insert** proof `[old_root, new_root, commitment, leaf_index, amount]`
  (appends the commitment to the incremental Merkle tree AND binds
  `commitment == Poseidon(amount, secret, nullifier)` so the pulled USDC equals the
  note's committed value), then pull USDC and advance the root.
- `withdraw(proof, root, nullifier_hash, to, amount)` — verify the **membership**
  proof `[root, nullifier_hash, recipient, amount]`, reject unknown roots and reused
  nullifiers, bind the payout address into the proof, pay out USDC.

No on-chain Poseidon (the host's Poseidon2 constants differ from circomlib's) — the
contract only runs the BN254 pairing check and trusts no root it didn't verify.

## session — scoped agent account (autonomy without custody)

A custom account (`CustomAccountInterface`). The owner delegates one agent session
key; `__check_auth` permits **only** `Veil.deposit` on the configured pool and USDC
`transfer` into that pool, **under a cap** and **before an expiry**. Anything else
reverts (`BadPayout` / `CapExceeded` / `Expired` / `ContextNotAllowed`). The agent
acts autonomously and can never drain or redirect funds.

## Build & test

```bash
stellar contract build          # -> target/wasm32v1-none/release/{veil,session_account}.wasm
cargo test --workspace          # guard-path + policy-transition unit tests
```

BN254 host functions and custom-account auth aren't in the local test env, so the
proof-gated and signature-gated paths are exercised off-chain (SDK) and on testnet;
the unit tests cover the deterministic guard and policy-state logic.
