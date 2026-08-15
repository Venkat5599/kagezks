#!/usr/bin/env bash
# Kage mainnet deploy — Veil ZK pool + SessionAccount (account abstraction).
# Reads the admin secret from $VEIL_ADMIN_SECRET (never commit it).
set -euo pipefail

: "${VEIL_ADMIN_SECRET:?set VEIL_ADMIN_SECRET to the admin S... secret}"

ADMIN_SECRET="$VEIL_ADMIN_SECRET"
XLM_SAC="CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
EMPTY_ROOT="1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2"
NET="mainnet"
RPC="https://mainnet.sorobanrpc.com"
PASSPHRASE="Public Global Stellar Network ; September 2015"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VEIL_WASM="$ROOT/contracts/solvency/target/wasm32v1-none/release/veil.wasm"
SESSION_WASM="$ROOT/contracts/solvency/target/wasm32v1-none/release/session_account.wasm"

ADMIN_PUB=$(node -e 'const s=require("@stellar/stellar-sdk");console.log(s.Keypair.fromSecret(process.argv[1]).publicKey())' "$ADMIN_SECRET")
echo "admin: $ADMIN_PUB"

inv() { stellar contract invoke --id "$1" --source-account "$ADMIN_SECRET" --network-passphrase "$PASSPHRASE" --rpc-url "$RPC" -- "${@:2}"; }

# Capture a contract ID from CLI output (stdout+stderr), then validate it.
deploy() {
  local out id
  out=$(stellar contract deploy --wasm "$1" --source-account "$ADMIN_SECRET" --network-passphrase "$PASSPHRASE" --rpc-url "$RPC" 2>&1)
  id=$(printf '%s\n' "$out" | grep -oE 'C[A-Z2-7]{55}' | tail -1)
  if [ -z "$id" ]; then
    echo "DEPLOY FAILED — no contract id in output:" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  printf '%s\n' "$id"
}

# --- 1. Deploy Veil ---
echo "==> deploy veil.wasm"
VEIL_ID=$(deploy "$VEIL_WASM")
echo "veil = $VEIL_ID"

# --- 2. init(admin, usdc=XLM SAC, empty_root) ---
echo "==> veil init"
inv "$VEIL_ID" init --admin "$ADMIN_PUB" --usdc "$XLM_SAC" --empty_root "$EMPTY_ROOT"

# --- 3. set_vks ---
echo "==> veil set_vks"
stellar contract invoke --id "$VEIL_ID" --source-account "$ADMIN_SECRET" --network-passphrase "$PASSPHRASE" --rpc-url "$RPC" -- \
  set_vks --insert_vk-file-path "$ROOT/sdk/build/insert_vk.json" --withdraw_vk-file-path "$ROOT/sdk/build/withdraw_vk.json"

# --- 4. Deploy SessionAccount ---
echo "==> deploy session_account.wasm"
SESSION_ID=$(deploy "$SESSION_WASM")
echo "session = $SESSION_ID"

echo ""
echo "DEPLOYED:"
echo "  admin   = $ADMIN_PUB"
echo "  veil    = $VEIL_ID"
echo "  session = $SESSION_ID"
echo "  xlm_sac = $XLM_SAC"

# Persist (local, gitignored) so onboarding + frontend can read the IDs.
cat > "$ROOT/sdk/build/veil_deployment_mainnet.json" <<EOF
{"network":"mainnet","contract_id":"$VEIL_ID","session_id":"$SESSION_ID","xlm_sac":"$XLM_SAC","admin":"$ADMIN_PUB"}
EOF
echo "saved -> sdk/build/veil_deployment_mainnet.json"
