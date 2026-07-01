pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Veil insert circuit.
//
// Proves a deposit correctly appends `commitment` to the pool's incremental
// Merkle tree: the SAME sibling path turns the empty leaf (0) into `oldRoot`
// and the commitment leaf into `newRoot`. The contract checks `oldRoot` equals
// its current root and runs only the BN254 pairing check — no on-chain Poseidon
// (the host's Poseidon2 constants differ from circomlib's; see VEIL.md §4).
//
// It ALSO binds the deposited `amount` to the commitment: the circuit proves
// `commitment == Poseidon(amount, secret, nullifier)`. The contract passes the
// USDC amount it actually pulled as the public `amount`, so a depositor cannot
// commit a large note while under-funding the pool (accounting desync → drain).
// The same amount is what the withdraw circuit binds, so deposited == withdrawn.
//
// Public:  oldRoot, newRoot, commitment, leafIndex, amount
// Private: secret, nullifier, pathElements[DEPTH]

template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// Hash `leaf` up `DEPTH` levels using siblings `pe[]` and left/right bits `bit[]`.
template RootFromPath(DEPTH) {
    signal input leaf;
    signal input pe[DEPTH];
    signal input bit[DEPTH]; // 0 => current is left child, 1 => right
    signal output root;

    component hash[DEPTH];
    signal left[DEPTH];
    signal right[DEPTH];
    signal cur[DEPTH + 1];
    cur[0] <== leaf;

    for (var i = 0; i < DEPTH; i++) {
        // bit constrained boolean by Num2Bits upstream.
        left[i]  <== (pe[i] - cur[i]) * bit[i] + cur[i];   // bit=0 -> cur, bit=1 -> pe
        right[i] <== (cur[i] - pe[i]) * bit[i] + pe[i];     // bit=0 -> pe,  bit=1 -> cur
        hash[i] = HashLeftRight();
        hash[i].left  <== left[i];
        hash[i].right <== right[i];
        cur[i + 1] <== hash[i].hash;
    }
    root <== cur[DEPTH];
}

template Insert(DEPTH) {
    // public
    signal input oldRoot;
    signal input newRoot;
    signal input commitment;
    signal input leafIndex;
    signal input amount;
    // private
    signal input secret;
    signal input nullifier;
    signal input pathElements[DEPTH];

    // Bind the deposited amount to the commitment. The contract feeds the USDC
    // amount it pulls as the public `amount`; this constraint forces the note's
    // committed value to equal it, so the pool can never be under-funded.
    component rng = Num2Bits(64);          // amount in [0, 2^64)
    rng.in <== amount;
    component cm = Poseidon(3);
    cm.inputs[0] <== amount;
    cm.inputs[1] <== secret;
    cm.inputs[2] <== nullifier;
    commitment === cm.out;

    // leafIndex -> path bits.
    component idx = Num2Bits(DEPTH);
    idx.in <== leafIndex;

    // Empty leaf (0) along the path must reproduce oldRoot.
    component oldR = RootFromPath(DEPTH);
    oldR.leaf <== 0;
    for (var i = 0; i < DEPTH; i++) {
        oldR.pe[i]  <== pathElements[i];
        oldR.bit[i] <== idx.out[i];
    }
    oldRoot === oldR.root;

    // Commitment leaf along the SAME path must reproduce newRoot.
    component newR = RootFromPath(DEPTH);
    newR.leaf <== commitment;
    for (var i = 0; i < DEPTH; i++) {
        newR.pe[i]  <== pathElements[i];
        newR.bit[i] <== idx.out[i];
    }
    newRoot === newR.root;
}

component main { public [oldRoot, newRoot, commitment, leafIndex, amount] } = Insert(10);
