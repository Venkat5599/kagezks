#!/usr/bin/env bash
# Re-read every mainnet claim in the README from public Stellar infrastructure. No keys needed.
#   bash scripts/verify-mainnet.sh
# 1. every tx hash in scripts/20-users-mainnet-proof.txt + fee-sponsor-proof.txt -> Horizon `successful`
# 2. the pool contract's live leaf count (simulated read against mainnet Soroban RPC)
set -euo pipefail
cd "$(dirname "$0")/.."

HORIZON="https://horizon.stellar.org"
RPC="https://mainnet.sorobanrpc.com"
POOL="CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV"

hashes=$(grep -ohE 'explorer/public/tx/[0-9a-f]{64}' scripts/20-users-mainnet-proof.txt scripts/fee-sponsor-proof.txt | sed 's#.*/##' | sort -u)
total=$(echo "$hashes" | wc -l | tr -d ' ')
ok=0; bad=0
for h in $hashes; do
  s=$(curl -s -m 20 "$HORIZON/transactions/$h" | grep -o '"successful": *[a-z]*' | grep -o '[a-z]*$' || true)
  if [ "$s" = "true" ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "  NOT successful: $h ($s)"; fi
done
echo "mainnet txs: $ok/$total successful on Horizon ($bad failed or missing)"

echo "pool $POOL"
POOL="$POOL" RPC="$RPC" bun -e '
import { rpc, Contract, TransactionBuilder, Networks, BASE_FEE, scValToNative } from "@stellar/stellar-sdk";
const s = new rpc.Server(process.env.RPC);
const acct = await s.getAccount("GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6");
const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
  .addOperation(new Contract(process.env.POOL).call("leaf_count")).setTimeout(30).build();
const sim = await s.simulateTransaction(tx);
const ledger = (await s.getLatestLedger()).sequence;
console.log(`  leaf_count = ${rpc.Api.isSimulationSuccess(sim) ? scValToNative(sim.result.retval) : "read failed"}  (ledger ${ledger})`);
'
