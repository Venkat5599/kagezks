pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Poseidon Merkle-SUM tree.
//
// Each leaf carries a (hash, sum) pair:
//   leaf.hash = Poseidon(id, balance, salt)
//   leaf.sum  = balance
//
// Each internal node carries:
//   node.hash = Poseidon(leftHash, rightHash, leftSum + rightSum)
//   node.sum  = leftSum + rightSum
//
// The root therefore commits to BOTH the full set of leaves (hash) and the
// total of every balance (sum) simultaneously. An issuer cannot drop or shrink
// a liability without changing the root, and `root.sum` is the provable
// total liabilities used by the solvency inequality.
//
// Heap layout over a flat array of TOT = 2N-1 nodes (0-based):
//   leaves   -> indices [N-1 .. 2N-2]
//   internal -> indices [0 .. N-2], children of i are (2i+1, 2i+2)
template MerkleSumTree(LEVELS) {
    var N   = 1 << LEVELS;
    var TOT = 2 * N - 1;

    signal input ids[N];
    signal input balances[N];
    signal input salts[N];

    signal output root; // root hash  == liabilities_root
    signal output sum;  // root sum   == total_liabilities

    signal h[TOT];
    signal s[TOT];

    // Leaves
    component leaf[N];
    for (var i = 0; i < N; i++) {
        leaf[i] = Poseidon(3);
        leaf[i].inputs[0] <== ids[i];
        leaf[i].inputs[1] <== balances[i];
        leaf[i].inputs[2] <== salts[i];
        h[N - 1 + i] <== leaf[i].out;
        s[N - 1 + i] <== balances[i];
    }

    // Internal nodes, built bottom-up
    component par[N - 1];
    for (var i = N - 2; i >= 0; i--) {
        par[i] = Poseidon(3);
        par[i].inputs[0] <== h[2 * i + 1];
        par[i].inputs[1] <== h[2 * i + 2];
        par[i].inputs[2] <== s[2 * i + 1] + s[2 * i + 2];
        h[i] <== par[i].out;
        s[i] <== s[2 * i + 1] + s[2 * i + 2];
    }

    root <== h[0];
    sum  <== s[0];
}
