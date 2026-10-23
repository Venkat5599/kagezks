// Built-in workflows: small recipes that chain the built-in APIs and turn the results
// into one plain answer. Like the built-in APIs they run in this app, need no keys,
// are free, and are visible to every user.
//
// Reachable as GET /api/flows/<slug>?input=value, from the Workflows page, and as the
// MCP tool `wf__<slug>` on the built-in MCP servers.
import { runBuiltinApi, findBuiltinApi, builtinMcpRows, type BuiltinVar } from "./builtin-catalog";

export type FlowStep = { title: string; api: string };
export type FlowTrace = { title: string; ok: boolean; ms: number; error?: string };
export type FlowResult = { answer: string; details: Record<string, unknown>; steps: FlowTrace[] };

export type BuiltinWorkflow = {
  slug: string;
  name: string;
  description: string;
  ask: string;
  inputs: BuiltinVar[];
  example: Record<string, string>;
  steps: FlowStep[];
  run: (args: Record<string, string>, call: Caller) => Promise<{ answer: string; details: Record<string, unknown> }>;
};

class StepFailed extends Error {}

// Runs one API step and records it in the trace; a failed step stops the workflow.
type Caller = <T>(title: string, api: string, args: Record<string, string>) => Promise<T>;

const networkInput: BuiltinVar = {
  name: "network",
  label: "Network",
  in: "query",
  required: false,
  description: "Real money (Mainnet) or the free test network (Testnet).",
  options: [
    { value: "mainnet", label: "Mainnet" },
    { value: "testnet", label: "Testnet" },
  ],
};

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const need = (args: Record<string, string>, k: string, label: string) => {
  const v = (args[k] ?? "").trim();
  if (!v) throw new StepFailed(`${label} is required`);
  return v;
};

type Account = { active: boolean; balances: { token: string; amount: number }[] };
type Price = { priceUsd: number | null };
type Fees = { howBusy: string; typicalFeeXlm: number; fastFeeXlm: number };
type Weather = { place: string; conditions: string; temperatureC: number; feelsLikeC: number; humidityPct: number; windKmh: number };
type Fx = { from: string; oneUnitEquals: Record<string, number> };
type Coins = { prices: Record<string, { price: number; dayChangePct: number | null }> };

export const BUILTIN_WORKFLOWS: BuiltinWorkflow[] = [
  {
    slug: "wallet-worth",
    name: "What is this wallet worth?",
    description: "Reads every balance in a Stellar wallet and prices it in US dollars using the live XLM price.",
    ask: "What is wallet GCNF…TXX6 worth in dollars?",
    inputs: [{ name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address — starts with G.", placeholder: "G…" }, networkInput],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    steps: [
      { title: "Read the wallet's balances", api: "stellar-account" },
      { title: "Get the live XLM price", api: "xlm-usdc-price" },
      { title: "Add it all up in dollars", api: "" },
    ],
    run: async (args, call) => {
      const address = need(args, "address", "Wallet address");
      const network = args.network || "mainnet";
      const acct = await call<Account>("Read the wallet's balances", "stellar-account", { address, network });
      if (!acct.active) return { answer: "This wallet is empty: it has never received any XLM.", details: { totalUsd: 0 } };
      const price = await call<Price>("Get the live XLM price", "xlm-usdc-price", {});
      const xlm = acct.balances.find((b) => b.token === "XLM")?.amount ?? 0;
      const usdc = acct.balances.filter((b) => b.token === "USDC").reduce((s, b) => s + b.amount, 0);
      const other = acct.balances.filter((b) => b.token !== "XLM" && b.token !== "USDC");
      const xlmUsd = xlm * (price.priceUsd ?? 0);
      const total = xlmUsd + usdc;
      const testnote = network === "testnet" ? " (testnet XLM has no real value; priced at the mainnet rate for reference)" : "";
      return {
        answer: `This wallet holds about $${fmt(total)}: ${fmt(xlm, 4)} XLM ($${fmt(xlmUsd)})${usdc ? ` and ${fmt(usdc)} USDC` : ""}${other.length ? `, plus ${other.length} other token${other.length > 1 ? "s" : ""} not priced here` : ""}${testnote}.`,
        details: { totalUsd: Number(total.toFixed(2)), xlm, xlmPriceUsd: price.priceUsd, usdc, otherTokens: other.map((o) => o.token) },
      };
    },
  },
  {
    slug: "can-i-pay",
    name: "Can this wallet make a payment?",
    description: "Checks a wallet's balance, today's network fee and Stellar's minimum balance rule, then says yes or no before you try to send.",
    ask: "Can wallet GCNF…TXX6 send 5 XLM right now?",
    inputs: [
      { name: "address", label: "Wallet address", in: "query", required: true, description: "The wallet that would send the money.", placeholder: "G…" },
      { name: "amount", label: "Amount (XLM)", in: "query", required: true, description: "How much XLM you want to send.", placeholder: "5" },
      networkInput,
    ],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", amount: "1", network: "mainnet" },
    steps: [
      { title: "Read the wallet's balance", api: "stellar-account" },
      { title: "Check today's network fee", api: "stellar-fees" },
      { title: "Compare balance with amount + fee + 1 XLM minimum", api: "" },
    ],
    run: async (args, call) => {
      const address = need(args, "address", "Wallet address");
      const amount = Number(need(args, "amount", "Amount"));
      if (!Number.isFinite(amount) || amount <= 0) throw new StepFailed("Amount must be a positive number");
      const network = args.network || "mainnet";
      const acct = await call<Account>("Read the wallet's balance", "stellar-account", { address, network });
      const fees = await call<Fees>("Check today's network fee", "stellar-fees", { network });
      const xlm = acct.balances.find((b) => b.token === "XLM")?.amount ?? 0;
      // Every Stellar account must keep a minimum balance (1 XLM base reserve, more per extra token).
      const reserve = 1 + 0.5 * Math.max(0, acct.balances.length - 1);
      const needed = amount + fees.fastFeeXlm + reserve;
      const spendable = Math.max(0, xlm - reserve - fees.fastFeeXlm);
      const yes = acct.active && xlm >= needed;
      return {
        answer: !acct.active
          ? "No. This wallet doesn't exist on the network yet, so it can't send anything."
          : yes
            ? `Yes. It holds ${fmt(xlm, 4)} XLM and can send ${fmt(amount, 4)} XLM, keeping the ${fmt(reserve, 1)} XLM Stellar requires every wallet to hold.`
            : `No. It holds ${fmt(xlm, 4)} XLM but must keep ${fmt(reserve, 1)} XLM, so the most it can send right now is ${fmt(spendable, 4)} XLM.`,
        details: { canPay: yes, balanceXlm: xlm, mustKeepXlm: reserve, feeXlm: fees.fastFeeXlm, maxYouCanSendXlm: Number(spendable.toFixed(7)), network: fees.howBusy === "Very busy" ? "very busy right now" : "normal" },
      };
    },
  },
  {
    slug: "market-snapshot",
    name: "Crypto market snapshot",
    description: "Bitcoin, Ethereum and Stellar prices with their 24-hour moves, plus how busy the Stellar network is, in one summary.",
    ask: "Give me a quick crypto market update.",
    inputs: [],
    example: {},
    steps: [
      { title: "Get Bitcoin, Ethereum and Stellar prices", api: "crypto-price" },
      { title: "Get XLM's price on Stellar's own exchange", api: "xlm-usdc-price" },
      { title: "Check how busy the Stellar network is", api: "stellar-fees" },
    ],
    run: async (_args, call) => {
      const coins = await call<Coins>("Get Bitcoin, Ethereum and Stellar prices", "crypto-price", { ids: "bitcoin,ethereum,stellar", vs: "usd" });
      const dex = await call<Price>("Get XLM's price on Stellar's own exchange", "xlm-usdc-price", {});
      const fees = await call<Fees>("Check how busy the Stellar network is", "stellar-fees", { network: "mainnet" });
      const line = (id: string, name: string, d = 2) => {
        const c = coins.prices[id];
        if (!c) return null;
        const ch = c.dayChangePct;
        return `${name} $${fmt(c.price, d)}${ch != null ? ` (${ch >= 0 ? "+" : ""}${ch}% today)` : ""}`;
      };
      const parts = [line("bitcoin", "Bitcoin", 0), line("ethereum", "Ethereum", 0), line("stellar", "Stellar", 4)].filter(Boolean);
      return {
        answer: `${parts.join(" · ")}. On Stellar's own exchange XLM trades at $${fmt(dex.priceUsd ?? 0, 4)}, and the network is ${fees.howBusy.toLowerCase()}.`,
        details: {
          bitcoinUsd: coins.prices.bitcoin?.price,
          ethereumUsd: coins.prices.ethereum?.price,
          stellarUsd: coins.prices.stellar?.price,
          xlmOnStellarExchangeUsd: dex.priceUsd,
          stellarNetwork: fees.howBusy,
        },
      };
    },
  },
  {
    slug: "travel-brief",
    name: "Travel brief",
    description: "Current weather at your destination and what your money is worth there, in one answer.",
    ask: "I'm going to Tokyo with US dollars — what's the weather and exchange rate?",
    inputs: [
      { name: "city", label: "Destination city", in: "query", required: true, description: "Where you're going.", placeholder: "Tokyo" },
      { name: "from", label: "Your currency", in: "query", required: true, description: "The money you have, as a 3-letter code.", placeholder: "USD" },
      { name: "to", label: "Local currency", in: "query", required: true, description: "The money used there, as a 3-letter code.", placeholder: "JPY" },
    ],
    example: { city: "Tokyo", from: "USD", to: "JPY" },
    steps: [
      { title: "Get the weather at the destination", api: "weather" },
      { title: "Get today's exchange rate", api: "fx-rates" },
    ],
    run: async (args, call) => {
      const city = need(args, "city", "Destination city");
      const from = need(args, "from", "Your currency").toUpperCase();
      const to = need(args, "to", "Local currency").toUpperCase();
      const w = await call<Weather>("Get the weather at the destination", "weather", { city });
      const fx = await call<Fx>("Get today's exchange rate", "fx-rates", { base: from, symbols: to });
      const rate = fx.oneUnitEquals[to];
      return {
        answer: `${w.place}: ${w.conditions}, ${w.temperatureC}°C (feels like ${w.feelsLikeC}°C). ${rate != null ? `1 ${from} = ${fmt(rate, 4)} ${to}, so 100 ${from} is about ${fmt(rate * 100, 0)} ${to}.` : `No exchange rate found for ${from} → ${to}.`}`,
        details: { place: w.place, conditions: w.conditions, temperatureC: w.temperatureC, humidityPct: w.humidityPct, windKmh: w.windKmh, rate: rate ?? null },
      };
    },
  },
];

export const findBuiltinWorkflow = (slug: string) => BUILTIN_WORKFLOWS.find((w) => w.slug === slug);

export async function runBuiltinWorkflow(slug: string, rawArgs: Record<string, unknown>): Promise<{ ok: true; result: FlowResult } | { ok: false; status: number; error: string; steps?: FlowTrace[] }> {
  const wf = findBuiltinWorkflow(slug);
  if (!wf) return { ok: false, status: 404, error: `no built-in workflow '${slug}'` };
  const args = Object.fromEntries(Object.entries(rawArgs).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  const steps: FlowTrace[] = [];
  const call: Caller = async <T,>(title: string, api: string, a: Record<string, string>) => {
    const t0 = Date.now();
    const r = await runBuiltinApi(api, a);
    if (!r.ok) {
      steps.push({ title, ok: false, ms: Date.now() - t0, error: r.error });
      throw new StepFailed(`${title}: ${r.error}`);
    }
    steps.push({ title, ok: true, ms: Date.now() - t0 });
    return r.data as T;
  };
  try {
    const out = await wf.run(args, call);
    return { ok: true, result: { ...out, steps } };
  } catch (e) {
    const msg = e instanceof StepFailed ? e.message : String((e as Error).message ?? e);
    return { ok: false, status: e instanceof StepFailed ? 400 : 500, error: msg, steps };
  }
}

export function builtinWorkflowRows() {
  return BUILTIN_WORKFLOWS.map((w) => ({
    id: `builtin:${w.slug}`,
    name: w.name,
    slug: w.slug,
    description: w.description,
    is_public: true,
    input_variables: w.inputs,
    steps: w.steps.map((s, i) => ({ id: `step${i + 1}`, kind: "builtin", title: s.title, api: s.api || null })),
    output_mapping: [],
    allowed_contracts: [],
    tags: [],
    owner_address: null,
    created_at: "2026-10-23T00:00:00.000Z",
    builtin: true,
    ask: w.ask,
    example_args: w.example,
  }));
}

// Everything a built-in MCP server offers, described for people: each tool with its
// plain description, form fields and an example question. Drives the MCP server page.
export type ToolCard = { tool: string; kind: "api" | "workflow"; name: string; description: string; ask: string; inputs: BuiltinVar[]; example: Record<string, string> };

export function builtinMcpRowsFull() {
  return builtinMcpRows().map((m) => {
    const cards: ToolCard[] = [];
    for (const wslug of m.workflows) {
      const wf = findBuiltinWorkflow(wslug);
      if (wf) cards.push({ tool: `wf__${wf.slug}`, kind: "workflow", name: wf.name, description: wf.description, ask: wf.ask, inputs: wf.inputs, example: wf.example });
    }
    for (const t of m.tools) {
      const api = findBuiltinApi(t.replace(/^api__/, ""));
      if (api) cards.push({ tool: t, kind: "api", name: api.name, description: api.description, ask: api.ask, inputs: api.variables, example: api.example });
    }
    return { ...m, cards };
  });
}
