#!/usr/bin/env bash
# One-shot deploy for the Kage VPS. Run FROM the repo root on the server:
#   bash deploy/deploy.sh
#
# Idempotent: pulls, installs, rebuilds the web app, (re)starts all pm2 processes
# (veil-web, veil-mcp, kage-fabric), reloads Caddy. Secrets come from deploy/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> load secrets"
if [ -f deploy/.env ]; then set -a; . deploy/.env; set +a; else echo "!! deploy/.env missing (copy deploy/.env.example)"; exit 1; fi

# Guard: never let anonymous settle on a public host.
if [ "${KAGE_ALLOW_ANON_SETTLE:-}" = "1" ]; then
  echo "!! REFUSING: KAGE_ALLOW_ANON_SETTLE=1 on a deploy target — anyone could drain the default session."; exit 1
fi

echo "==> pull"
git pull --ff-only

echo "==> install (root, bun)"
bun install

echo "==> build web (frontend)"
cd frontend && npm install && npm run build && cd "$ROOT"

echo "==> pm2 (re)start"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "==> reload Caddy"
if command -v caddy >/dev/null 2>&1; then
  caddy reload --config deploy/Caddyfile 2>/dev/null || caddy start --config deploy/Caddyfile
else
  echo "   (caddy not on PATH — reload your reverse proxy manually)"
fi

echo "==> health"
sleep 3
curl -fsS http://localhost:8403/health && echo || echo "!! fabric health check failed"
echo "==> done. fabric: https://kageai.me/fabric/mcp  ·  web: https://kageai.me"
