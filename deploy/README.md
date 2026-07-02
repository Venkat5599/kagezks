# Deploy Veil on a VPS

Brings up two always-on processes behind nginx:

- **veil-web** — the Next app (landing · `/agent` · `/dashboard`) on `:3000`
- **veil-mcp** — the MCP server agents connect to on `:8402`

## 0. Prereqs on the VPS

```bash
# Node 20+ and npm (for the Next app)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
# Bun (for the MCP server + agent engine)
curl -fsSL https://bun.sh/install | bash
# Stellar CLI (to manage the `issuer` key), pm2, nginx
cargo install --locked stellar-cli || sudo snap install stellar
sudo npm i -g pm2
sudo apt-get install -y nginx
```

Import the funded testnet identity used to pay fees:

```bash
stellar keys add issuer --secret-key   # paste the S... secret; or `stellar keys generate issuer` + friendbot
```

## 1. Clone + configure

```bash
git clone https://github.com/Venkat5599/stellar.git veil && cd veil
bun install
cd frontend && npm install && cd ..

# Secrets (never committed):
cp deploy/.env.example deploy/.env      # fill VEIL_FEE_SECRET etc.
#   VEIL_FEE_SECRET=$(stellar keys secret issuer)
echo "DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require" > frontend/.env.local
```

## 2. Build the web app

```bash
cd frontend && npm run build && cd ..
```

## 3. Start with pm2

```bash
set -a; . deploy/.env; set +a          # load secrets into the shell
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup                 # survive reboots
pm2 logs                                # watch
```

Health checks:

```bash
curl localhost:3000/api/stats           # web + Neon + on-chain
curl localhost:8402/health              # MCP server (shows pool + session ids)
```

## 4. nginx + TLS

```bash
sudo cp deploy/nginx-veil.conf /etc/nginx/sites-available/veil
sudo ln -s /etc/nginx/sites-available/veil /etc/nginx/sites-enabled/
# edit server_name to your domain, then:
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain     # HTTPS
```

## 5. Verify end to end

- `https://your-domain/` — landing, `/agent` (live agent demo), `/dashboard` (marketplace).
- Agents point at `https://your-domain/mcp`.
- Drive a real payment from anywhere:
  ```bash
  VEIL_FEE_SECRET=$(stellar keys secret issuer) \
    bun run scripts/agent-pay.ts <payeeScanKeyHex> 2000000
  ```

## Notes

- **Secrets**: `deploy/.env` and `frontend/.env.local` are gitignored — keep them off git.
  Regenerate the Neon password + rotate `issuer` after the event.
- **Session expiry**: policies auto-extend when the fee source is the owner (built in);
  otherwise `stellar contract invoke --id <session> -- extend --cap <n> --expiry <ts>`.
- **Redeploy after code changes**: `git pull && cd frontend && npm run build && cd .. && pm2 reload all`.
