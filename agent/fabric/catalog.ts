// Fabric catalog — the marketplace's APIs + workflows, read from the running web
// app (Neon-backed). The Bun MCP process stays dependency-light: instead of its
// own Postgres client it fetches the same rows the dashboard shows, so "what an
// agent can call" is always in sync with what an owner published.
//
// KAGE_ORIGIN points at the web app (https://kageai.me in prod, http://localhost:3000
// in dev). Rows are cached briefly so a burst of tool calls doesn't refetch.

export type ApiRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  payment_address: string | null;
  target_url: string;
  http_method: string;
  content_type: string;
  query_params: string | null;
  variables: ApiVar[];
  example_response: string | null;
  price: string; // decimal USDC/XLM, e.g. "0.01"
  auth_headers: AuthHeader[];
  is_public: boolean;
};

export type ApiVar = { name: string; in?: "query" | "path" | "body"; required?: boolean; description?: string };
export type AuthHeader = { name?: string; key?: string; value: string }; // value may be "env:NAME"

// A workflow step. Three kinds — the fabric's whole vocabulary:
//   http      call a published API (x402 metered), thread its body forward
//   onchain   the ZK-private settlement through the SessionAccount  ← the point
//   condition gate the rest of the flow on a comparison
export type WfStep =
  // http: call a published API by slug (`api`) OR an inline URL (`url`). Both x402-aware
  // when they point at a Kage-metered endpoint; inline URLs hit the upstream directly.
  | { id: string; kind: "http"; api?: string; url?: string; method?: string; body?: unknown; with?: Record<string, unknown> }
  | { id: string; kind: "onchain"; action?: "veil_pay"; recipientScanKey: string; amount: string }
  | { id: string; kind: "condition"; left: string; op: CmpOp; right: string };

export type CmpOp = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type WorkflowRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  is_public: boolean;
  input_variables: { name: string; required?: boolean; description?: string }[];
  steps: WfStep[];
  output_mapping: unknown[];
  allowed_contracts: string[]; // on-chain safety allow-list (pool ids the flow may touch)
  tags: string[];
};

const ORIGIN = (process.env.KAGE_ORIGIN ?? "https://kageai.me").replace(/\/$/, "");
const TTL_MS = 15_000;

let cache: { at: number; apis: ApiRow[]; workflows: WorkflowRow[] } | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${ORIGIN}${path}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`catalog ${path} → ${r.status}`);
  return (await r.json()) as T;
}

export async function loadCatalog(force = false): Promise<{ apis: ApiRow[]; workflows: WorkflowRow[] }> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache;
  const [a, w] = await Promise.all([
    fetchJson<{ apis: ApiRow[] }>("/api/apis").catch(() => ({ apis: [] })),
    fetchJson<{ workflows: WorkflowRow[] }>("/api/workflows").catch(() => ({ workflows: [] })),
  ]);
  cache = { at: Date.now(), apis: a.apis ?? [], workflows: w.workflows ?? [] };
  return cache;
}

export async function findApi(slugOrName: string): Promise<ApiRow | null> {
  const { apis } = await loadCatalog();
  const k = slugOrName.toLowerCase();
  return apis.find((a) => a.slug === k || a.name.toLowerCase() === k) ?? null;
}

export async function findWorkflow(slugOrName: string): Promise<WorkflowRow | null> {
  const { workflows } = await loadCatalog();
  const k = slugOrName.toLowerCase();
  return workflows.find((w) => w.slug === k || w.name.toLowerCase() === k) ?? null;
}
