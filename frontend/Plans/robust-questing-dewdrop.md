# Plan — Veil "Agent Fabric" marketplace app (APIs · MCP Servers · Workflows · Dashboard)

## Context

The current `/dashboard` is a read-only ZK-pool monitor. The user wants the full
**Agent-Fabric-style product app** (per the reference screenshots): a marketplace +
builder for **APIs** (x402 payment-gated proxies), **MCP Servers**, and **Workflows**,
plus a **Dashboard** with stats — but **Veil-branded** (Stellar / Soroban / ZK /
SessionAccount, not EVM/EIP-7702) and using **our existing left side-panel** nav.

Decisions locked with the user:
- **Persistence = Neon Postgres** (real CRUD, persists across reloads).
- **Full replace**: left dock becomes `Dashboard · APIs · MCP Servers · Workflows`.
  The ZK/pool details are shown *inside* cards (e.g. the pool as an x402 "API", ZK
  badges on the dashboard), not as separate sections.

## Already done (before planning)
- Neon project **`steep-rice-41149641`** (db `neondb`) created with 3 tables:
  `apis`, `mcp_servers`, `workflows` (schema incl. stats cols: `request_count`,
  `success_count`, `earnings`). Connection string captured — goes into
  `frontend/.env.local` as `DATABASE_URL` (gitignored, NOT committed).

## Build

### 1. DB access layer — `frontend/lib/db.ts` (NEW)
- Add dep `@neondatabase/serverless`. Export a `sql` tagged-template client from
  `neon(process.env.DATABASE_URL!)`. Small typed helpers per table.
- `.env.local` holds `DATABASE_URL`. Add `.env*.local` to gitignore if not covered
  (root .gitignore has `.env.*`; confirm frontend is covered or add one).

### 2. API routes (CRUD + stats) — `frontend/app/api/*`
- `api/apis/route.ts` — `GET` (list, public + filter), `POST` (create). `api/apis/[id]/route.ts` — `GET` one.
- `api/mcp-servers/route.ts` — `GET`, `POST`.
- `api/workflows/route.ts` — `GET`, `POST`.
- `api/stats/route.ts` — aggregate counts/earnings from DB **plus** live on-chain
  reads (reuse `app/api/agent/status/route.ts` logic: pool notes, session cap/spent).
- Validate input with `zod` (already a dep in root; add to frontend or hand-roll).

### 3. Frontend — rebuild `components/veil-dashboard.tsx` into an app shell
Keep the left dock (from current file) but change sections to
`Dashboard · APIs · MCP Servers · Workflows`. Split views into a new
`components/fabric/` dir (keeps files small):
- `fabric/dashboard-home.tsx` — 4 stat cards (Total APIs, Total Requests, Success
  Rate, Total Earnings) from `/api/stats`; a **"Scoped session key"** panel (Veil's
  answer to EIP-7702 smart account — shows live cap/remaining from
  `/api/agent/status`, "custody: none"); "Manage" cards linking to the 3 sections.
- `fabric/apis-section.tsx` + `fabric/create-api-form.tsx` — marketplace list of
  cards + create form. Veil-adapted fields: name, slug, description, category, tags,
  **Stellar payment address** (was Ethereum 0x), target URL, HTTP method, content
  type, query-params template, variables, example response, **price per request
  (USDC)**, auth headers, make public. Cards show price + method + ZK/x402 badges.
- `fabric/mcp-section.tsx` + `fabric/create-mcp-form.tsx` — list (cards show tools +
  workflows count, owner) + create form (slug, display name, description,
  public/private).
- `fabric/workflows-section.tsx` + `fabric/create-workflow-form.tsx` — list + create
  form: name, slug, description, public, **input variables** (add/remove), **steps**
  (HTTP Request / on-chain, output key, method, URL, body mapping), **output
  mapping**, and **Scope Configuration → allowed Soroban contract addresses** (maps
  to the SessionAccount policy — the ZK/scoped-key twist on the reference's EVM scope).

Branding & adaptation (design taste — match reference's clean dark cards + OUR green
`--accent`, reuse `Card`/`Field`/`Mono` helpers already in `veil-dashboard.tsx`, and
`VeilMark` logo):
- Wordmark "Veil" (green accent on second word style already in hero), not "Agent Fabric".
- Chain = Stellar testnet; amounts in USDC; "EIP-7702 smart account" → "scoped
  SessionAccount key"; keccak/0x addresses → Soroban `C…`/`G…` strkeys.

### 4. Seed real Veil data (SQL insert, one-time)
- `mcp_servers`: **Veil** (slug `veil`, tools: veil_pool_status/budget/quote/pay,
  workflow_list/run; workflows: pay-if-budget; owner = issuer G-addr).
- `workflows`: **pay-if-budget** (steps: budget check → condition → ZK deposit →
  confirm; allowed contract = the pool `CBRM3RK2…`).
- `apis`: **Veil Private Pay** (an x402 API; target = the MCP `veil_pay`; price 0.01;
  payment address = operator `GC3KDBUQ…`).

### 5. Header/links
- `app/dashboard/page.tsx` still renders the shell. Header "Live dashboard" link stays.
- Keep landing + `/agent` page unchanged (still the ZK story + live agent demo).

## Reuse (don't rebuild)
- `components/veil-dashboard.tsx` — `Card`, `Field`, `Mono`, `short`, `usdc`, left-dock markup.
- `app/api/agent/status/route.ts` — on-chain session/pool reads for the Dashboard stats + session panel.
- `components/veil-logo.tsx` (`VeilMark`), `app/globals.css` accent tokens, `motion` helpers.

## Verification
1. `DATABASE_URL` in `frontend/.env.local`; `npm run dev`.
2. `/dashboard` → left dock shows Dashboard/APIs/MCP Servers/Workflows.
3. Create an API / MCP server / workflow via each form → row persists in Neon
   (`mcp__Neon__run_sql` SELECT to confirm) and appears in the list after reload.
4. Dashboard stats reflect DB counts + live on-chain session cap/remaining.
5. Seeded Veil MCP server + pay-if-budget workflow + Veil Private Pay API show in lists.
6. `npm run build` + `tsc --noEmit` + `eslint` clean.
