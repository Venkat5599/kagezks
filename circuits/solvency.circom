pragma circom 2.1.6;

include "merkle_sum.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// Ledgerproof solvency circuit.
//
// Proves, in zero knowledge, that an issuer's total customer liabilities are
// fully backed by its reserves WITHOUT revealing any individual balance.
//
// Private (witness):  ids[N], balances[N], salts[N]   -- the internal ledger
// Public inputs:      liabilities_root, total_reserves
//
// Constraints:
//   1. Range  : every balance in [0, 2^64)  -> no negative / overflow tricks.
//   2. Tree   : Poseidon Merkle-sum tree over the leaves reproduces
//               liabilities_root, and its root.sum is total_liabilities.
//   3. Solvent: total_liabilities <= total_reserves.
//
// `total_reserves` is bound on-chain by the Soroban contract to the REAL
// reserve balance it reads itself, so the issuer cannot inflate it.
template Solvency(LEVELS) {
    var N = 1 << LEVELS;

    // private
    signal input ids[N];
    signal input balances[N];
    signal input salts[N];

    // public
    signal input liabilities_root;
    signal input total_reserves;

    // 1. Range-check every balance to [0, 2^64).
    component rng[N];
    for (var i = 0; i < N; i++) {
        rng[i] = Num2Bits(64);
        rng[i].in <== balances[i];
    }

    // 2. Recompute the Merkle-sum tree.
    component tree = MerkleSumTree(LEVELS);
    for (var i = 0; i < N; i++) {
        tree.ids[i]      <== ids[i];
        tree.balances[i] <== balances[i];
        tree.salts[i]    <== salts[i];
    }

    // Root must match the published liabilities root.
    liabilities_root === tree.root;

    // 3. total_liabilities <= total_reserves.
    // 128 bits comfortably covers N * 2^64 liabilities and i128 reserves.
    component le = LessEqThan(128);
    le.in[0] <== tree.sum;       // total liabilities
    le.in[1] <== total_reserves; // reserves verified on-chain
    le.out === 1;
}

// LEVELS=3 -> 8 leaves for fast local iteration; bump to 10 (1024) for the demo.
component main { public [liabilities_root, total_reserves] } = Solvency(3);
