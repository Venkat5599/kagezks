pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Veil withdraw circuit.
//
// Proves, in zero knowledge, the right to spend ONE note in the shielded pool
// WITHOUT revealing which one, and binds the payout to a chosen recipient.
//
// Private (witness):  secret, nullifier, pathElements[DEPTH], pathIndices[DEPTH]
// Public inputs:      root, nullifierHash, recipient, amount
//
// Constraints:
//   1. Range       : amount in [0, 2^64).
//   2. Commitment  : leaf = Poseidon(amount, secret, nullifier).
//   3. Nullifier   : nullifierHash == Poseidon(nullifier)  (1-time spend tag).
//   4. Membership  : hashing leaf up the path with Poseidon(2) yields `root`.
//   5. Binding     : recipient is forced into the constraint system so the
//                    payout address cannot be swapped after proving.

// Poseidon(left, right) for an internal Merkle node.
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// If s == 0 keep (in[0], in[1]); if s == 1 swap. s is constrained boolean.
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];
    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

// Recompute a Merkle root from a leaf, its sibling path, and left/right bits.
template MerkleProof(DEPTH) {
    signal input leaf;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH]; // 0 => current is left child, 1 => right
    signal output root;

    component mux[DEPTH];
    component hash[DEPTH];
    signal cur[DEPTH + 1];
    cur[0] <== leaf;

    for (var i = 0; i < DEPTH; i++) {
        mux[i] = DualMux();
        mux[i].in[0] <== cur[i];
        mux[i].in[1] <== pathElements[i];
        mux[i].s     <== pathIndices[i];

        hash[i] = HashLeftRight();
        hash[i].left  <== mux[i].out[0];
        hash[i].right <== mux[i].out[1];
        cur[i + 1] <== hash[i].hash;
    }
    root <== cur[DEPTH];
}

template Withdraw(DEPTH) {
    // public
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input amount;

    // private
    signal input secret;
    signal input nullifier;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // 1. Range-check the amount.
    component rng = Num2Bits(64);
    rng.in <== amount;

    // 2. Commitment = Poseidon(amount, secret, nullifier).
    component cm = Poseidon(3);
    cm.inputs[0] <== amount;
    cm.inputs[1] <== secret;
    cm.inputs[2] <== nullifier;

    // 3. Nullifier hash binds the public spend-tag to the private nullifier.
    component nh = Poseidon(1);
    nh.inputs[0] <== nullifier;
    nullifierHash === nh.out;

    // 4. Merkle membership of the commitment under `root`.
    component mp = MerkleProof(DEPTH);
    mp.leaf <== cm.out;
    for (var i = 0; i < DEPTH; i++) {
        mp.pathElements[i] <== pathElements[i];
        mp.pathIndices[i]  <== pathIndices[i];
    }
    root === mp.root;

    // 5. Anti-malleability: force `recipient` into the system. A relayer who
    //    re-broadcasts the proof cannot change the payout without invalidating it.
    signal recipientSq;
    recipientSq <== recipient * recipient;
}

// DEPTH=10 -> 1024 notes, fits the existing pot14 ptau. Bump to 20 for prod.
component main { public [root, nullifierHash, recipient, amount] } = Withdraw(10);
