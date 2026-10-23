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

const need = (args: Record<string, string>, k: string, label = k): string => {
  const v = (args[k] ?? "").trim();
  if (!v) throw new CatalogError(400, `${label} is required`);
  return v;
};

const netArg = (args: Record<string, string>) => NETWORKS[parseNetwork(args.network)];
const xlmFromStroops = (s: string | number) => Number(s) / 1e7;

const networkVar: BuiltinVar = { name: "network", label: "Network", in: "query", required: false, description: "Real money (Mainnet) or the free test network (Testnet).", options: [{ value: "mainnet", label: "Mainnet" }, { value: "testnet", label: "Testnet" }] };

// ---- Stellar tokens ---------------------------------------------------------------
// Horizon lists every token anyone has issued, including copies with the same name.
// These are the official issuers (checked against Horizon: holders, supply, stellar.toml).
type Token = { code: string; issuer: string | null; org: string };
const TOKENS: Record<"mainnet" | "testnet", Token[]> = {
  mainnet: [
    { code: "XLM", issuer: null, org: "Stellar (native)" },
    { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", org: "Circle" },
    { code: "EURC", issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2", org: "Circle" },
    { code: "AQUA", issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA", org: "Aquarius" },
    { code: "yXLM", issuer: "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55", org: "Ultra Capital" },
  ],
  testnet: [
    { code: "XLM", issuer: null, org: "Stellar (native)" },
    { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", org: "Circle (testnet)" },
  ],
};
const tokenOptions = TOKENS.mainnet.map((t) => ({ value: t.code, label: t.code }));

// "USDC" → the official USDC; "CODE:GISSUER" → that exact token.
function resolveToken(input: string, net: "mainnet" | "testnet"): Token {
  const raw = input.trim();
  if (raw.includes(":")) {
    const [code, issuer] = raw.split(":");
    if (!code || !issuer || !StrKey.isValidEd25519PublicKey(issuer)) throw new CatalogError(400, "custom tokens look like CODE:G…ISSUER");
    return { code, issuer, org: "custom" };
  }
  const t = TOKENS[net].find((x) => x.code.toLowerCase() === raw.toLowerCase());
  if (!t) throw new CatalogError(400, `unknown token '${raw}' on ${net}. Use one of ${TOKENS[net].map((x) => x.code).join(", ")} or CODE:ISSUER`);
  return t;
}
const assetParams = (prefix: string, t: Token) =>
  t.issuer
    ? `${prefix}_asset_type=${t.code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12"}&${prefix}_asset_code=${t.code}&${prefix}_asset_issuer=${t.issuer}`
    : `${prefix}_asset_type=native`;
const assetId = (t: Token) => (t.issuer ? `${t.code}:${t.issuer}` : "native");

type PathRecord = { destination_amount: string; path: { asset_type: string; asset_code?: string }[] };
async function quote(net: (typeof NETWORKS)["mainnet"], from: Token, to: Token, amount: number): Promise<{ receive: number; via: string[] } | null> {
  const { status, body } = await getJson(`${net.horizon}/paths/strict-send?${assetParams("source", from)}&source_amount=${amount}&destination_assets=${assetId(to)}`);
  if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
  const recs = ((body as { _embedded?: { records?: PathRecord[] } })._embedded?.records ?? []).sort((a, b) => Number(b.destination_amount) - Number(a.destination_amount));
  const best = recs[0];
  if (!best) return null;
  return { receive: Number(best.destination_amount), via: best.path.map((p) => (p.asset_type === "native" ? "XLM" : (p.asset_code ?? "?"))) };
}

type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };
type HorizonOp = {
  type: string;
  created_at: string;
  transaction_successful: boolean;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  source_account?: string;
  account?: string;
  funder?: string;
  starting_balance?: string;
  into?: string;
  source_amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  function?: string;
  transaction_hash: string;
};
const assetName = (type?: string, code?: string) => (type === "native" ? "XLM" : (code ?? "?"));

// One Horizon operation → a plain sentence (null for operation types we don't describe).
function describeOp(op: HorizonOp): { what: string; from: string | null; to: string | null; amount: number | null; token: string | null } | null {
  switch (op.type) {
    case "payment":
      return { what: "payment", from: op.from ?? null, to: op.to ?? null, amount: Number(op.amount), token: assetName(op.asset_type, op.asset_code) };
    case "create_account":
      return { what: "new wallet funded", from: op.funder ?? null, to: op.account ?? null, amount: Number(op.starting_balance), token: "XLM" };
    case "account_merge":
      return { what: "wallet closed and merged", from: op.account ?? op.source_account ?? null, to: op.into ?? null, amount: null, token: "XLM" };
    case "path_payment_strict_send":
    case "path_payment_strict_receive":
      return { what: `swap-payment (${assetName(op.source_asset_type, op.source_asset_code)} → ${assetName(op.asset_type, op.asset_code)})`, from: op.from ?? null, to: op.to ?? null, amount: Number(op.amount), token: assetName(op.asset_type, op.asset_code) };
    case "invoke_host_function":
      return { what: "smart contract call", from: op.source_account ?? null, to: null, amount: null, token: null };
    default:
      return { what: op.type.replace(/_/g, " "), from: op.source_account ?? null, to: null, amount: null, token: null };
  }
}

export const BUILTIN_APIS: BuiltinApi[] = [
  // ---- wallets ----
  {
    slug: "stellar-account",
    name: "Wallet balances",
    description: "See what any Stellar wallet holds: its XLM and every token balance.",
    category: "Wallets",
    tags: ["stellar", "wallet", "balances"],
    variables: [{ name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address. It starts with G.", placeholder: "G…" }, networkVar],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    ask: "How much XLM does wallet GCNF…TXX6 hold?",
    run: async (args) => {
      const address = need(args, "address", "Wallet address");
      if (!StrKey.isValidEd25519PublicKey(address)) throw new CatalogError(400, "That isn't a valid Stellar wallet address (G…).");
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/accounts/${address}`);
      if (status === 404) return { network: net.name, address, active: false, note: "This wallet has never received any XLM, so it doesn't exist on the network yet.", balances: [] };
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const a = body as { balances: HorizonBalance[]; subentry_count: number };
      const xlm = Number(a.balances.find((b) => b.asset_type === "native")?.balance ?? 0);
      const mustKeep = 1 + 0.5 * a.subentry_count;
      return {
        network: net.name,
        address,
        active: true,
        balances: a.balances.map((b) => ({
          token: b.asset_type === "native" ? "XLM" : (b.asset_code ?? "?"),
          amount: Number(b.balance),
          ...(b.asset_issuer ? { issuedBy: b.asset_issuer } : {}),
        })),
        spendableXlm: Number(Math.max(0, xlm - mustKeep).toFixed(7)),
        mustKeepXlm: mustKeep,
      };
    },
  },
  {
    slug: "stellar-payments",
    name: "Recent payments",
    description: "The latest money in and out of a Stellar wallet: who sent what, to whom, and when.",
    category: "Wallets",
    tags: ["stellar", "wallet", "history"],
    variables: [
      { name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address. It starts with G.", placeholder: "G…" },
      { name: "limit", label: "How many", in: "query", required: false, description: "Number of recent payments to show (1 to 20).", placeholder: "5" },
      networkVar,
    ],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", limit: "5", network: "mainnet" },
    ask: "What were the last 5 payments of wallet GCNF…TXX6?",
    run: async (args) => {
      const address = need(args, "address", "Wallet address");
      if (!StrKey.isValidEd25519PublicKey(address)) throw new CatalogError(400, "That isn't a valid Stellar wallet address (G…).");
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/accounts/${address}/payments?order=desc&limit=${limit}`);
      if (status === 404) return { network: net.name, address, payments: [], note: "This wallet doesn't exist on the network yet." };
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const ops = ((body as { _embedded: { records: HorizonOp[] } })._embedded.records ?? []).filter((o) => o.transaction_successful);
      return {
        network: net.name,
        address,
        payments: ops.map((o) => {
          const d = describeOp(o);
          const incoming = d?.to === address;
          return {
            when: o.created_at,
            direction: incoming ? "in" : "out",
            what: d?.what ?? o.type,
            amount: d?.amount ?? null,
            token: d?.token ?? null,
            counterparty: incoming ? d?.from : d?.to,
            viewOnExplorer: `${net.explorer}/tx/${o.transaction_hash}`,
          };
        }),
      };
    },
  },
  // ---- transactions & network ----
  {
    slug: "stellar-transaction",
    name: "Transaction lookup",
    description: "Check whether a Stellar transaction went through, when, what it did and what it cost.",
    category: "Network",
    tags: ["stellar", "transactions", "explorer"],
    variables: [{ name: "hash", label: "Transaction ID", in: "query", required: true, description: "The 64-character ID shown after a transaction.", placeholder: "bd2de9fa…" }, networkVar],
    example: { hash: "bd2de9fa7612fbc1b8ac775cd29dcd13907ad1c29520c485363d295a9cd0d379", network: "mainnet" },
    ask: "Did transaction bd2de9fa… succeed, and what did it do?",
    run: async (args) => {
      const hash = need(args, "hash", "Transaction ID").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new CatalogError(400, "A transaction ID is 64 characters of 0-9 and a-f.");
      const net = netArg(args);
      const [tx, ops] = await Promise.all([getJson(`${net.horizon}/transactions/${hash}`), getJson(`${net.horizon}/transactions/${hash}/operations?limit=20`)]);
      if (tx.status === 404) throw new CatalogError(404, `No transaction with that ID on ${net.name}.`);
      if (tx.status !== 200) throw new CatalogError(502, `horizon ${tx.status}`);
      const t = tx.body as { successful: boolean; created_at: string; fee_charged: string; operation_count: number; memo_type: string; memo?: string; source_account: string };
      const steps = ops.status === 200 ? ((ops.body as { _embedded: { records: HorizonOp[] } })._embedded.records ?? []).map(describeOp).filter(Boolean) : [];
      return {
        network: net.name,
        succeeded: t.successful,
        when: t.created_at,
        sentBy: t.source_account,
        feePaidXlm: xlmFromStroops(t.fee_charged),
        whatItDid: steps,
        memo: t.memo_type === "none" ? null : (t.memo ?? null),
        viewOnExplorer: `${net.explorer}/tx/${hash}`,
      };
    },
  },
  {
    slug: "stellar-fees",
    name: "Network fees",
    description: "What sending a Stellar transaction costs right now, and how busy the network is.",
    category: "Network",
    tags: ["stellar", "fees"],
    variables: [networkVar],
    example: { network: "mainnet" },
    ask: "How much does a Stellar transaction cost right now?",
    run: async (args) => {
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/fee_stats`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const f = body as { last_ledger_base_fee: string; ledger_capacity_usage: string; fee_charged: Record<string, string> };
      const usage = Number(f.ledger_capacity_usage);
      return {
        network: net.name,
        howBusy: usage > 0.9 ? "Very busy" : usage > 0.5 ? "Busy" : "Quiet",
        capacityUsedPct: Math.round(usage * 100),
        minimumFeeXlm: xlmFromStroops(f.last_ledger_base_fee),
        typicalFeeXlm: xlmFromStroops(f.fee_charged.p50 ?? 0),
        fastFeeXlm: xlmFromStroops(f.fee_charged.p90 ?? 0),
      };
    },
  },
  {
    slug: "stellar-network",
    name: "Network status",
    description: "Is Stellar healthy right now? The latest block, how many transactions it carried, and the protocol version.",
    category: "Network",
    tags: ["stellar", "status"],
    variables: [networkVar],
    example: { network: "mainnet" },
    ask: "Is the Stellar network running normally?",
    run: async (args) => {
      const net = netArg(args);
      const { status, body } = await getJson(`${net.horizon}/ledgers?order=desc&limit=1`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const l = (body as { _embedded: { records: { sequence: number; closed_at: string; successful_transaction_count: number; failed_transaction_count: number; operation_count: number; protocol_version: number; total_coins: string; base_reserve_in_stroops: number }[] } })._embedded.records[0];
      if (!l) throw new CatalogError(502, "no ledger returned");
      const ageSec = Math.round((Date.now() - new Date(l.closed_at).getTime()) / 1000);
      return {
        network: net.name,
        healthy: ageSec < 60,
        latestBlock: l.sequence,
        closedSecondsAgo: ageSec,
        transactionsInBlock: l.successful_transaction_count,
        failedInBlock: l.failed_transaction_count,
        protocolVersion: l.protocol_version,
        minimumWalletBalanceXlm: xlmFromStroops(l.base_reserve_in_stroops) * 2,
        totalXlmInExistence: Math.round(Number(l.total_coins)),
      };
    },
  },
  // ---- markets ----
  {
    slug: "stellar-price",
    name: "Token price",
    description: "The live price of one Stellar token in another (XLM, USDC, EURC, AQUA, yXLM), from Stellar's built-in exchange.",
    category: "Markets",
    tags: ["stellar", "dex", "price"],
    variables: [
      { name: "token", label: "Token", in: "query", required: true, description: "What you want the price of.", options: tokenOptions },
      { name: "in", label: "Priced in", in: "query", required: false, description: "The currency to show the price in.", options: tokenOptions.filter((o) => o.value !== "AQUA" && o.value !== "yXLM") },
      networkVar,
    ],
    example: { token: "XLM", in: "USDC", network: "mainnet" },
    ask: "What is XLM trading at in USDC right now?",
    run: async (args) => {
      const net = netArg(args);
      const token = resolveToken(need(args, "token", "Token"), net.name);
      const quoteIn = resolveToken(args.in || "USDC", net.name);
      if (assetId(token) === assetId(quoteIn)) throw new CatalogError(400, "Pick two different tokens.");
      const { status, body } = await getJson(`${net.horizon}/order_book?${assetParams("selling", token)}&${assetParams("buying", quoteIn)}&limit=1`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const ob = body as { bids: { price: string }[]; asks: { price: string }[] };
      const bid = ob.bids[0] ? Number(ob.bids[0].price) : null;
      const ask = ob.asks[0] ? Number(ob.asks[0].price) : null;
      // Thin direct books: fall back to the best multi-hop route for 1 unit.
      const route = bid == null || ask == null ? await quote(net, token, quoteIn, 1) : null;
      const price = bid != null && ask != null ? (bid + ask) / 2 : (route?.receive ?? null);
      if (price == null) throw new CatalogError(404, `No market between ${token.code} and ${quoteIn.code} on ${net.name} right now.`);
      return {
        network: net.name,
        pair: `${token.code}/${quoteIn.code}`,
        price: Number(price.toPrecision(7)),
        buyAt: ask,
        sellAt: bid,
        ...(route ? { via: route.via.length ? route.via : ["direct"] } : {}),
        source: "Stellar's built-in exchange",
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    slug: "stellar-convert",
    name: "Swap quote",
    description: "How much of one token you'd get for another right now, using the best route across Stellar's exchange.",
    category: "Markets",
    tags: ["stellar", "dex", "swap"],
    variables: [
      { name: "amount", label: "Amount", in: "query", required: true, description: "How much you're swapping.", placeholder: "100" },
      { name: "from", label: "From", in: "query", required: true, description: "The token you have.", options: tokenOptions },
      { name: "to", label: "To", in: "query", required: true, description: "The token you want.", options: tokenOptions },
      networkVar,
    ],
    example: { amount: "100", from: "XLM", to: "USDC", network: "mainnet" },
    ask: "How much USDC would I get for 100 XLM?",
    run: async (args) => {
      const net = netArg(args);
      const amount = Number(need(args, "amount", "Amount"));
      if (!Number.isFinite(amount) || amount <= 0) throw new CatalogError(400, "Amount must be a positive number.");
      const from = resolveToken(need(args, "from", "From"), net.name);
      const to = resolveToken(need(args, "to", "To"), net.name);
      if (assetId(from) === assetId(to)) throw new CatalogError(400, "Pick two different tokens.");
      const q = await quote(net, from, to, amount);
      if (!q) throw new CatalogError(404, `No route from ${from.code} to ${to.code} on ${net.name} right now.`);
      return {
        network: net.name,
        youSend: `${amount} ${from.code}`,
        youGet: `${Number(q.receive.toFixed(7))} ${to.code}`,
        rate: `1 ${from.code} = ${Number((q.receive / amount).toPrecision(7))} ${to.code}`,
        route: [from.code, ...q.via, to.code].join(" → "),
        note: "A quote, not a trade. Prices move every few seconds.",
      };
    },
  },
  {
    slug: "stellar-token",
    name: "Token info",
    description: "Who issues a Stellar token, how many wallets hold it, how much exists, and whether the issuer can freeze or claw it back.",
    category: "Markets",
    tags: ["stellar", "tokens", "assets"],
    variables: [
      { name: "token", label: "Token", in: "query", required: true, description: "Pick one, or type CODE:ISSUER for any other token.", placeholder: "USDC" },
      networkVar,
    ],
    example: { token: "USDC", network: "mainnet" },
    ask: "How many wallets hold USDC on Stellar, and can Circle freeze it?",
    run: async (args) => {
      const net = netArg(args);
      const t = resolveToken(need(args, "token", "Token"), net.name);
      if (!t.issuer) {
        return { network: net.name, token: "XLM", issuer: "none: XLM is Stellar's own currency", note: "XLM can't be frozen or clawed back by anyone." };
      }
      const { status, body } = await getJson(`${net.horizon}/assets?asset_code=${t.code}&asset_issuer=${t.issuer}`);
      if (status !== 200) throw new CatalogError(502, `horizon ${status}`);
      const a = (body as { _embedded: { records: { accounts: { authorized: number }; balances: { authorized: string }; contracts_amount?: string; contract_id?: string; flags: { auth_required: boolean; auth_revocable: boolean; auth_clawback_enabled: boolean }; _links?: { toml?: { href?: string } } }[] } })._embedded.records[0];
      if (!a) throw new CatalogError(404, `No token ${t.code} from that issuer on ${net.name}.`);
      return {
        network: net.name,
        token: t.code,
        issuedBy: t.org !== "custom" ? t.org : (a._links?.toml?.href?.replace(/^https?:\/\//, "").replace(/\/\.well-known.*/, "") ?? "unknown"),
        issuerAddress: t.issuer,
        walletsHolding: a.accounts.authorized,
        supplyInWallets: Math.round(Number(a.balances.authorized)),
        heldBySmartContracts: a.contracts_amount ? Math.round(Number(a.contracts_amount)) : 0,
        issuerCanFreeze: a.flags.auth_revocable,
        issuerCanClawBack: a.flags.auth_clawback_enabled,
        needsApprovalToHold: a.flags.auth_required,
        smartContractAddress: a.contract_id ?? null,
      };
    },
  },
  // ---- Kage ----
  {
    slug: "kage-pool",
    name: "Kage pool status",
    description: "How many private payments the Kage pool has handled and how much XLM it holds, read live from the chain.",
    category: "Kage",
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
        slotsLeft: 1024 - Number(leafCount),
        xlmInPool: balance != null ? xlmFromStroops(String(balance)) : null,
        poolContract: net.pool,
        viewOnExplorer: `${net.explorer}/contract/${net.pool}`,
      };
    },
  },
];


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
    description: "Everything in one connection: wallets, payments, transactions, prices, swaps, tokens, network health and the Kage pool.",
    tools: ["api__stellar-account", "api__stellar-payments", "api__stellar-transaction", "api__stellar-fees", "api__stellar-network", "api__stellar-price", "api__stellar-convert", "api__stellar-token", "api__kage-pool"],
    workflows: ["wallet-worth", "can-i-pay", "payment-receipt", "wallet-activity", "stellar-snapshot"],
  },
  {
    slug: "stellar-wallets",
    display_name: "Stellar Wallets",
    description: "Lets your AI assistant check any Stellar wallet: balances, recent payments, what it's worth, and whether it can afford a payment.",
    tools: ["api__stellar-account", "api__stellar-payments"],
    workflows: ["wallet-worth", "can-i-pay", "wallet-activity"],
  },
  {
    slug: "stellar-markets",
    display_name: "Stellar Markets",
    description: "Lets your AI assistant read Stellar's built-in exchange: token prices, swap quotes and token facts.",
    tools: ["api__stellar-price", "api__stellar-convert", "api__stellar-token"],
    workflows: ["stellar-snapshot"],
  },
  {
    slug: "stellar-network",
    display_name: "Stellar Network",
    description: "Lets your AI assistant check transactions, fees and network health, explain a payment, and read the Kage pool.",
    tools: ["api__stellar-transaction", "api__stellar-fees", "api__stellar-network", "api__kage-pool"],
    workflows: ["payment-receipt"],
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
