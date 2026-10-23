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
import { readContract } from "./chain-read";

export type BuiltinVar = { name: string; label: string; in: "query"; required: boolean; description: string; placeholder?: string; options?: { value: string; label: string }[] };

export type BuiltinApi = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  variables: BuiltinVar[];
  example: Record<string, string>;
  ask: string; // what you'd type to an AI agent that has this tool
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

const networkVar: BuiltinVar = { name: "network", label: "Network", in: "query", required: false, description: "Real money (Mainnet) or the free test network (Testnet).", options: [{ value: "mainnet", label: "Mainnet" }, { value: "testnet", label: "Testnet" }] };

type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };

export const BUILTIN_APIS: BuiltinApi[] = [
  {
    slug: "stellar-account",
    name: "Stellar account",
    description: "See what any Stellar wallet holds: its XLM and every token balance.",
    category: "Stellar",
    tags: ["stellar", "wallet", "balances"],
    variables: [{ name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address — starts with G.", placeholder: "G…" }, networkVar],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    ask: "How much XLM does wallet GCNF…TXX6 hold?",
    run: async (args) => {
      const address = need(args, "address");
      if (!StrKey.isValidEd25519PublicKey(address)) throw new CatalogError(400, "address is not a valid G... account");
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/accounts/${address}`);
      if (status === 404) return { network: net.name, address, active: false, note: "This wallet has never received any XLM, so it doesn't exist on the network yet.", balances: [] };
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const a = body as { balances: HorizonBalance[] };
      return {
        network: net.name,
        address,
        active: true,
        balances: a.balances.map((b) => ({
          token: b.asset_type === "native" ? "XLM" : (b.asset_code ?? "?"),
          amount: Number(b.balance),
          ...(b.asset_issuer ? { issuedBy: b.asset_issuer } : {}),
        })),
      };
    },
  },
  {
    slug: "stellar-transaction",
    name: "Stellar transaction",
    description: "Check whether a Stellar payment went through, when it happened and what it cost.",
    category: "Stellar",
    tags: ["stellar", "transactions", "explorer"],
    variables: [{ name: "hash", label: "Transaction ID", in: "query", required: true, description: "The 64-character ID shown after a payment.", placeholder: "bd2de9fa…" }, networkVar],
    example: { hash: "bd2de9fa7612fbc1b8ac775cd29dcd13907ad1c29520c485363d295a9cd0d379", network: "mainnet" },
    ask: "Did transaction bd2de9fa… succeed?",
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
        succeeded: t.successful,
        when: t.created_at,
        sentFrom: t.source_account,
        feePaidXlm: Number(t.fee_charged) / 1e7,
        actions: t.operation_count,
        memo: t.memo_type === "none" ? null : (t.memo ?? null),
        viewOnExplorer: `${net.explorer}/tx/${hash}`,
      };
    },
  },
  {
    slug: "stellar-fees",
    name: "Stellar network fees",
    description: "What sending a Stellar transaction costs right now, and how busy the network is.",
    category: "Stellar",
    tags: ["stellar", "fees"],
    variables: [networkVar],
    example: { network: "mainnet" },
    ask: "How busy is the Stellar network right now?",
    run: async (args) => {
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/fee_stats`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const f = body as { last_ledger: string; last_ledger_base_fee: string; ledger_capacity_usage: string; fee_charged: Record<string, string> };
      const usage = Number(f.ledger_capacity_usage);
      const xlm = (stroops?: string) => Number(stroops ?? 0) / 1e7;
      return {
        network: net.name,
        howBusy: usage > 0.9 ? "Very busy" : usage > 0.5 ? "Busy" : "Quiet",
        capacityUsedPct: Math.round(usage * 100),
        minimumFeeXlm: xlm(f.last_ledger_base_fee),
        typicalFeeXlm: xlm(f.fee_charged.p50),
        fastFeeXlm: xlm(f.fee_charged.p90),
      };
    },
  },
  {
    slug: "xlm-usdc-price",
    name: "XLM / USDC price (Stellar DEX)",
    description: "The live price of XLM in US dollars (USDC), straight from Stellar's own exchange.",
    category: "Markets",
    tags: ["stellar", "dex", "price", "usdc"],
    variables: [],
    example: {},
    ask: "What is XLM trading at right now?",
    run: async () => {
      const net = NETWORKS.mainnet;
      const q = `selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${USDC_MAINNET_ISSUER}&limit=5`;
      const { status, body } = await getJson(`${net.horizon}/order_book?${q}`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const ob = body as { bids: { price: string; amount: string }[]; asks: { price: string; amount: string }[] };
      const bid = ob.bids[0] ? Number(ob.bids[0].price) : null;
      const ask = ob.asks[0] ? Number(ob.asks[0].price) : null;
      return {
        priceUsd: bid != null && ask != null ? Number(((bid + ask) / 2).toFixed(5)) : null,
        buyAtUsd: ask,
        sellAtUsd: bid,
        source: "Stellar's built-in exchange (XLM/USDC)",
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    slug: "kage-pool",
    name: "Kage pool status",
    description: "How many private payments the Kage pool holds and how much XLM is in it, read live from the chain.",
    category: "Stellar",
    tags: ["kage", "zk", "pool"],
    variables: [networkVar],
    example: { network: "mainnet" },
    ask: "How many payments are in the Kage pool?",
    run: async (args) => {
      const net = netArg(args);
      const [leafCount, balance] = await Promise.all([
        readContract(net, net.pool, "leaf_count"),
        readContract(net, net.xlmSac, "balance", new Address(net.pool).toScVal()),
      ]);
      if (leafCount == null) throw new CatalogError(502, `could not read the ${net.name} pool`);
      return {
        network: net.name,
        privatePayments: Number(leafCount),
        xlmInPool: balance != null ? Number(balance) / 1e7 : null,
        poolContract: net.pool,
        viewOnExplorer: `${net.explorer}/contract/${net.pool}`,
      };
    },
  },
  {
    slug: "crypto-price",
    name: "Crypto prices",
    description: "Current price and 24-hour change for any coins — Bitcoin, Ethereum, Stellar and thousands more.",
    category: "Markets",
    tags: ["crypto", "price"],
    variables: [
      { name: "ids", label: "Coins", in: "query", required: true, description: "Coin names separated by commas.", placeholder: "bitcoin, ethereum, stellar" },
      { name: "vs", label: "Price in", in: "query", required: false, description: "Currency to show prices in.", placeholder: "usd" },
    ],
    example: { ids: "bitcoin,ethereum,stellar", vs: "usd" },
    ask: "What are Bitcoin and Ethereum worth right now?",
    run: async (args) => {
      const ids = need(args, "ids").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9,-]/g, "");
      const vs = (args.vs || "usd").toLowerCase().replace(/[^a-z]/g, "");
      const { status, body } = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}&include_24hr_change=true`);
      if (status === 429) throw new CatalogError(429, "price source is rate-limiting, retry in a minute");
      if (status !== 200) throw new CatalogError(502, `price source ${status}`);
      const out: Record<string, { price: number; dayChangePct: number | null }> = {};
      // keyed by coin id, e.g. { bitcoin: { price, dayChangePct } }
      for (const [id, v] of Object.entries(body as Record<string, Record<string, number>>)) {
        const ch = v[`${vs}_24h_change`];
        out[id] = { price: v[vs] ?? NaN, dayChangePct: ch != null ? Number(ch.toFixed(2)) : null };
      }
      if (Object.keys(out).length === 0) throw new CatalogError(404, "no known coin ids in 'ids'");
      return { currency: vs.toUpperCase(), prices: out, source: "CoinGecko", checkedAt: new Date().toISOString() };
    },
  },
  {
    slug: "fx-rates",
    name: "Currency exchange rates",
    description: "Today's exchange rates between regular currencies like USD, EUR and INR.",
    category: "Markets",
    tags: ["fx", "fiat", "rates"],
    variables: [
      { name: "base", label: "From", in: "query", required: false, description: "The currency you have.", placeholder: "USD" },
      { name: "symbols", label: "To", in: "query", required: false, description: "Currencies to convert into, separated by commas. Leave empty for all.", placeholder: "EUR, INR, GBP" },
    ],
    example: { base: "USD", symbols: "EUR,INR,GBP" },
    ask: "How many rupees is one US dollar today?",
    run: async (args) => {
      const base = (args.base || "USD").toUpperCase().replace(/[^A-Z]/g, "");
      const symbols = (args.symbols || "").toUpperCase().replace(/[^A-Z,]/g, "");
      const { status, body } = await getJson(`https://api.frankfurter.dev/v1/latest?base=${base}${symbols ? `&symbols=${symbols}` : ""}`);
      if (status === 404 || status === 422) throw new CatalogError(400, "unknown currency code");
      if (status !== 200) throw new CatalogError(502, `fx source ${status}`);
      const b = body as { base: string; date: string; rates: Record<string, number> };
      return { from: b.base, date: b.date, oneUnitEquals: b.rates, source: "European Central Bank" };
    },
  },
  {
    slug: "weather",
    name: "Weather now",
    description: "Current temperature, humidity, wind and conditions for any city.",
    category: "Data",
    tags: ["weather"],
    variables: [{ name: "city", label: "City", in: "query", required: true, description: "Any city name.", placeholder: "Hyderabad" }],
    example: { city: "Hyderabad" },
    ask: "What's the weather in Hyderabad?",
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
        conditions: WEATHER_CODES[Number(c.weather_code)] ?? `code ${c.weather_code}`,
        localTime: String(c.time).replace("T", " "),
        temperatureC: c.temperature_2m,
        feelsLikeC: c.apparent_temperature,
        humidityPct: c.relative_humidity_2m,
        windKmh: c.wind_speed_10m,
        source: "Open-Meteo",
      };
    },
  },
  {
    slug: "wikipedia",
    name: "Wikipedia summary",
    description: "A short, plain-text summary of any topic from Wikipedia.",
    category: "Data",
    tags: ["knowledge", "wikipedia"],
    variables: [{ name: "title", label: "Topic", in: "query", required: true, description: "What you want to know about.", placeholder: "Zero-knowledge proof" }],
    example: { title: "Zero-knowledge proof" },
    ask: "Explain zero-knowledge proofs in two lines.",
    run: async (args) => {
      const title = need(args, "title").replace(/ /g, "_");
      const { status, body } = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
      if (status === 404) throw new CatalogError(404, "no article with that title");
      if (status !== 200) throw new CatalogError(502, `wikipedia ${status}`);
      const w = body as { title: string; description?: string; extract: string; content_urls?: { desktop?: { page?: string } } };
      return { title: w.title, about: w.description ?? null, summary: w.extract, readMore: w.content_urls?.desktop?.page ?? null };
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
    ask: a.ask,
    servers: BUILTIN_MCPS.filter((m) => m.tools.includes(`api__${a.slug}`)).map((m) => ({ slug: m.slug, name: m.display_name })),
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

export type BuiltinMcp = { slug: string; display_name: string; description: string; tools: string[]; workflows: string[] };

export const BUILTIN_MCPS: BuiltinMcp[] = [
  {
    slug: "stellar-tools",
    display_name: "Stellar Tools",
    description: "Lets your AI assistant check Stellar wallets, payments, fees, the XLM price and the Kage pool — and answer \"what is this wallet worth?\" or \"can it pay?\".",
    tools: ["api__stellar-account", "api__stellar-transaction", "api__stellar-fees", "api__xlm-usdc-price", "api__kage-pool"],
    workflows: ["wallet-worth", "can-i-pay"],
  },
  {
    slug: "market-data",
    display_name: "Market Data",
    description: "Lets your AI assistant look up crypto prices, currency exchange rates and give a quick market update.",
    tools: ["api__crypto-price", "api__fx-rates", "api__xlm-usdc-price"],
    workflows: ["market-snapshot"],
  },
  {
    slug: "agent-essentials",
    display_name: "Agent Essentials",
    description: "Everyday lookups for your AI assistant: weather anywhere, Wikipedia summaries and a travel brief.",
    tools: ["api__weather", "api__wikipedia"],
    workflows: ["travel-brief"],
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
    workflows: m.workflows,
    owner_address: null,
    created_at: "2026-10-23T00:00:00.000Z",
    builtin: true,
  }));
}
