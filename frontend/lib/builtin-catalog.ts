// Built-in catalog: APIs and MCP servers that ship with Kage and are visible to every
// user. They run server-side in this app (no fabric, no database, no API keys), call
// public upstreams, and return trimmed JSON an agent can use directly.
//
// Every built-in API is reachable three ways:
//   GET  /api/catalog/<slug>?arg=value      (plain HTTP, also what `target_url` points at)
//   the dashboard's "Test call" panel
//   an MCP tool `api__<slug>` on any Kage MCP server (built-in or user-created)
import { Address, StrKey } from "@stellar/stellar-sdk";
import { NETWORKS, parseNetwork } from "./networks";
import { readContract, toHex } from "./chain-read";

export type BuiltinVar = { name: string; in: "query"; required: boolean; description: string };

export type BuiltinApi = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  variables: BuiltinVar[];
  example: Record<string, string>;
  run: (args: Record<string, string>) => Promise<unknown>;
};

export class CatalogError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const USDC_MAINNET_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "kage-catalog/1.0 (+https://kageai.me)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await r.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: r.status, body };
}

const need = (args: Record<string, string>, k: string): string => {
  const v = (args[k] ?? "").trim();
  if (!v) throw new CatalogError(400, `missing required argument '${k}'`);
  return v;
};

const netArg = (args: Record<string, string>) => NETWORKS[parseNetwork(args.network)];

const networkVar: BuiltinVar = { name: "network", in: "query", required: false, description: "mainnet (default) or testnet" };

type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };

export const BUILTIN_APIS: BuiltinApi[] = [
  {
    slug: "stellar-account",
    name: "Stellar account",
    description: "Balances, sequence and signer count for any Stellar address, on mainnet or testnet.",
    category: "Stellar",
    tags: ["stellar", "wallet", "balances"],
    variables: [{ name: "address", in: "query", required: true, description: "G... account address" }, networkVar],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    run: async (args) => {
      const address = need(args, "address");
      if (!StrKey.isValidEd25519PublicKey(address)) throw new CatalogError(400, "address is not a valid G... account");
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/accounts/${address}`);
      if (status === 404) return { network: net.name, address, funded: false, balances: [] };
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const a = body as { sequence: string; subentry_count: number; signers: unknown[]; balances: HorizonBalance[] };
      return {
        network: net.name,
        address,
        funded: true,
        sequence: a.sequence,
        subentries: a.subentry_count,
        signers: a.signers.length,
        balances: a.balances.map((b) => ({
          asset: b.asset_type === "native" ? "XLM" : `${b.asset_code}:${b.asset_issuer}`,
          balance: b.balance,
        })),
      };
    },
  },
  {
    slug: "stellar-transaction",
    name: "Stellar transaction",
    description: "Look up a transaction by hash: success, ledger, time, fee, operation count and memo.",
    category: "Stellar",
    tags: ["stellar", "transactions", "explorer"],
    variables: [{ name: "hash", in: "query", required: true, description: "64-char transaction hash" }, networkVar],
    example: { hash: "bd2de9fa7612fbc1b8ac775cd29dcd13907ad1c29520c485363d295a9cd0d379", network: "mainnet" },
    run: async (args) => {
      const hash = need(args, "hash").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new CatalogError(400, "hash must be 64 hex characters");
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/transactions/${hash}`);
      if (status === 404) throw new CatalogError(404, `transaction not found on ${net.name}`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const t = body as { successful: boolean; ledger: number; created_at: string; fee_charged: string; operation_count: number; memo_type: string; memo?: string; source_account: string };
      return {
        network: net.name,
        hash,
        successful: t.successful,
        ledger: t.ledger,
        createdAt: t.created_at,
        feeChargedStroops: t.fee_charged,
        operations: t.operation_count,
        memo: t.memo_type === "none" ? null : (t.memo ?? null),
        source: t.source_account,
        explorer: `${net.explorer}/tx/${hash}`,
      };
    },
  },
  {
    slug: "stellar-fees",
    name: "Stellar fee stats",
    description: "Current network fee levels (p10 / p50 / p90 / max) and ledger capacity usage — pick a fee before submitting.",
    category: "Stellar",
    tags: ["stellar", "fees"],
    variables: [networkVar],
    example: { network: "mainnet" },
    run: async (args) => {
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/fee_stats`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const f = body as { last_ledger: string; last_ledger_base_fee: string; ledger_capacity_usage: string; fee_charged: Record<string, string> };
      return {
        network: net.name,
        lastLedger: Number(f.last_ledger),
        baseFeeStroops: f.last_ledger_base_fee,
        ledgerCapacityUsage: Number(f.ledger_capacity_usage),
        feeChargedStroops: { p10: f.fee_charged.p10, p50: f.fee_charged.p50, p90: f.fee_charged.p90, max: f.fee_charged.max },
      };
    },
  },
  {
    slug: "xlm-usdc-price",
    name: "XLM / USDC price (Stellar DEX)",
    description: "Best bid, best ask and mid price for XLM in USDC, read live from the Stellar DEX order book.",
    category: "Markets",
    tags: ["stellar", "dex", "price", "usdc"],
    variables: [],
    example: {},
    run: async () => {
      const net = NETWORKS.mainnet;
      const q = `selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${USDC_MAINNET_ISSUER}&limit=5`;
      const { status, body } = await getJson(`${net.horizon}/order_book?${q}`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const ob = body as { bids: { price: string; amount: string }[]; asks: { price: string; amount: string }[] };
      const bid = ob.bids[0] ? Number(ob.bids[0].price) : null;
      const ask = ob.asks[0] ? Number(ob.asks[0].price) : null;
      return {
        pair: "XLM/USDC",
        source: "Stellar DEX (mainnet order book)",
        bestBid: bid,
        bestAsk: ask,
        mid: bid != null && ask != null ? Number(((bid + ask) / 2).toFixed(7)) : null,
        spreadPct: bid && ask ? Number((((ask - bid) / ((ask + bid) / 2)) * 100).toFixed(3)) : null,
        at: new Date().toISOString(),
      };
    },
  },
  {
    slug: "kage-pool",
    name: "Kage pool status",
    description: "Live state of the Kage shielded pool: note count, Merkle root and XLM held, read on-chain.",
    category: "Stellar",
    tags: ["kage", "zk", "pool"],
    variables: [networkVar],
    example: { network: "mainnet" },
    run: async (args) => {
      const net = netArg(args);
      const [leafCount, root, balance] = await Promise.all([
        readContract(net, net.pool, "leaf_count"),
        readContract(net, net.pool, "current_root"),
        readContract(net, net.xlmSac, "balance", new Address(net.pool).toScVal()),
      ]);
      if (leafCount == null) throw new CatalogError(502, `could not read the ${net.name} pool`);
      return {
        network: net.name,
        pool: net.pool,
        notes: Number(leafCount),
        merkleRoot: toHex(root) || null,
        pooledXlm: balance != null ? (Number(balance) / 1e7).toFixed(7) : null,
        explorer: `${net.explorer}/contract/${net.pool}`,
      };
    },
  },
  {
    slug: "crypto-price",
    name: "Crypto prices",
    description: "Spot prices for one or more coins (CoinGecko ids such as stellar, bitcoin, ethereum, usd-coin).",
    category: "Markets",
    tags: ["crypto", "price"],
    variables: [
      { name: "ids", in: "query", required: true, description: "comma-separated CoinGecko ids, e.g. stellar,bitcoin" },
      { name: "vs", in: "query", required: false, description: "quote currency, default usd" },
    ],
    example: { ids: "stellar,bitcoin,ethereum", vs: "usd" },
    run: async (args) => {
      const ids = need(args, "ids").toLowerCase().replace(/[^a-z0-9,-]/g, "");
      const vs = (args.vs || "usd").toLowerCase().replace(/[^a-z]/g, "");
      const { status, body } = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}&include_24hr_change=true`);
      if (status === 429) throw new CatalogError(429, "price source is rate-limiting, retry in a minute");
      if (status !== 200) throw new CatalogError(502, `price source ${status}`);
      const out: Record<string, { price: number; change24hPct: number | null }> = {};
      for (const [id, v] of Object.entries(body as Record<string, Record<string, number>>)) {
        const ch = v[`${vs}_24h_change`];
        out[id] = { price: v[vs] ?? NaN, change24hPct: ch != null ? Number(ch.toFixed(2)) : null };
      }
      if (Object.keys(out).length === 0) throw new CatalogError(404, "no known coin ids in 'ids'");
      return { vs, prices: out, source: "CoinGecko", at: new Date().toISOString() };
    },
  },
  {
    slug: "fx-rates",
    name: "Currency exchange rates",
    description: "Daily reference FX rates (European Central Bank) between fiat currencies.",
    category: "Markets",
    tags: ["fx", "fiat", "rates"],
    variables: [
      { name: "base", in: "query", required: false, description: "base currency, default USD" },
      { name: "symbols", in: "query", required: false, description: "comma-separated targets, e.g. EUR,INR,GBP" },
    ],
    example: { base: "USD", symbols: "EUR,INR,GBP" },
    run: async (args) => {
      const base = (args.base || "USD").toUpperCase().replace(/[^A-Z]/g, "");
      const symbols = (args.symbols || "").toUpperCase().replace(/[^A-Z,]/g, "");
      const { status, body } = await getJson(`https://api.frankfurter.dev/v1/latest?base=${base}${symbols ? `&symbols=${symbols}` : ""}`);
      if (status === 404 || status === 422) throw new CatalogError(400, "unknown currency code");
      if (status !== 200) throw new CatalogError(502, `fx source ${status}`);
      const b = body as { base: string; date: string; rates: Record<string, number> };
      return { base: b.base, date: b.date, rates: b.rates, source: "European Central Bank via Frankfurter" };
    },
  },
  {
    slug: "weather",
    name: "Weather now",
    description: "Current temperature, wind and conditions for any city.",
    category: "Data",
    tags: ["weather"],
    variables: [{ name: "city", in: "query", required: true, description: "city name, e.g. Hyderabad" }],
    example: { city: "Hyderabad" },
    run: async (args) => {
      const city = need(args, "city");
      const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
      const place = (geo.body as { results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string }[] }).results?.[0];
      if (!place) throw new CatalogError(404, `no place called '${city}'`);
      const fc = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
      );
      if (fc.status !== 200) throw new CatalogError(502, `weather source ${fc.status}`);
      const c = (fc.body as { current: Record<string, number | string> }).current;
      return {
        place: `${place.name}${place.country ? `, ${place.country}` : ""}`,
        time: c.time,
        temperatureC: c.temperature_2m,
        feelsLikeC: c.apparent_temperature,
        humidityPct: c.relative_humidity_2m,
        windKmh: c.wind_speed_10m,
        conditions: WEATHER_CODES[Number(c.weather_code)] ?? `code ${c.weather_code}`,
        source: "Open-Meteo",
      };
    },
  },
  {
    slug: "wikipedia",
    name: "Wikipedia summary",
    description: "Plain-text summary and link for a Wikipedia article title.",
    category: "Data",
    tags: ["knowledge", "wikipedia"],
    variables: [{ name: "title", in: "query", required: true, description: "article title, e.g. Zero-knowledge proof" }],
    example: { title: "Zero-knowledge proof" },
    run: async (args) => {
      const title = need(args, "title").replace(/ /g, "_");
      const { status, body } = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
      if (status === 404) throw new CatalogError(404, "no article with that title");
      if (status !== 200) throw new CatalogError(502, `wikipedia ${status}`);
      const w = body as { title: string; description?: string; extract: string; content_urls?: { desktop?: { page?: string } } };
      return { title: w.title, description: w.description ?? null, summary: w.extract, url: w.content_urls?.desktop?.page ?? null };
    },
  },
];

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "dense drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent rain showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};

export const findBuiltinApi = (slug: string): BuiltinApi | undefined => BUILTIN_APIS.find((a) => a.slug === slug);

export async function runBuiltinApi(slug: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const api = findBuiltinApi(slug);
  if (!api) return { ok: false, status: 404, error: `no built-in API '${slug}'` };
  const strArgs = Object.fromEntries(Object.entries(args).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  try {
    return { ok: true, data: await api.run(strArgs) };
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, status: e.status, error: e.message };
    const msg = (e as Error).name === "TimeoutError" ? "upstream timed out" : String((e as Error).message ?? e);
    return { ok: false, status: 502, error: msg };
  }
}

// Row shape the dashboard + fabric already understand (same columns as the `apis` table).
const ORIGIN = "https://kageai.me";
export function builtinApiRows() {
  return BUILTIN_APIS.map((a) => ({
    id: `builtin:${a.slug}`,
    name: a.name,
    slug: a.slug,
    description: a.description,
    category: a.category,
    tags: a.tags,
    payment_address: null,
    target_url: `${ORIGIN}/api/catalog/${a.slug}`,
    http_method: "GET",
    content_type: "application/json",
    query_params: a.variables.map((v) => `${v.name}={${v.name}}`).join("&") || null,
    variables: a.variables,
    example_response: null,
    example_args: a.example,
    price: "0",
    auth_headers: [],
    is_public: true,
    owner_address: null,
    request_count: 0,
    success_count: 0,
    earnings: "0",
    created_at: "2026-10-23T00:00:00.000Z",
    builtin: true,
  }));
}

// ---- built-in MCP servers -----------------------------------------------------------

export type BuiltinMcp = { slug: string; display_name: string; description: string; tools: string[] };

export const BUILTIN_MCPS: BuiltinMcp[] = [
  {
    slug: "stellar-tools",
    display_name: "Stellar Tools",
    description: "Read Stellar for your agent: account balances, transaction lookups, fee levels, the XLM/USDC DEX price and the Kage pool — mainnet or testnet.",
    tools: ["api__stellar-account", "api__stellar-transaction", "api__stellar-fees", "api__xlm-usdc-price", "api__kage-pool"],
  },
  {
    slug: "market-data",
    display_name: "Market Data",
    description: "Crypto spot prices, fiat FX reference rates and the Stellar DEX XLM/USDC price in one server.",
    tools: ["api__crypto-price", "api__fx-rates", "api__xlm-usdc-price"],
  },
  {
    slug: "agent-essentials",
    display_name: "Agent Essentials",
    description: "General-purpose lookups every agent needs: current weather for a city and Wikipedia summaries.",
    tools: ["api__weather", "api__wikipedia"],
  },
];

export const findBuiltinMcp = (slug: string): BuiltinMcp | undefined => BUILTIN_MCPS.find((m) => m.slug === slug);

export function builtinMcpRows() {
  return BUILTIN_MCPS.map((m) => ({
    id: `builtin:${m.slug}`,
    slug: m.slug,
    display_name: m.display_name,
    description: m.description,
    is_public: true,
    tools: m.tools,
    workflows: [],
    owner_address: null,
    created_at: "2026-10-23T00:00:00.000Z",
    builtin: true,
  }));
}
