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

type Balance = { token: string; amount: number; issuedBy?: string };
type Account = { active: boolean; balances: Balance[]; spendableXlm?: number; mustKeepXlm?: number };
type Price = { price: number };
type Convert = { youGet: string };
type Fees = { howBusy: string; typicalFeeXlm: number; fastFeeXlm: number };
type Net = { healthy: boolean; latestBlock: number; transactionsInBlock: number; protocolVersion: number; closedSecondsAgo: number };
type Pool = { privatePayments: number; xlmInPool: number | null };
type Tx = { succeeded: boolean; when: string; sentBy: string; feePaidXlm: number; whatItDid: { what: string; from: string | null; to: string | null; amount: number | null; token: string | null }[]; memo: string | null };
type Payments = { payments: { when: string; direction: "in" | "out"; what: string; amount: number | null; token: string | null; counterparty: string | null }[] };

const short = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "someone");
const OFFICIAL = new Set(["USDC", "EURC", "AQUA", "yXLM"]);

export const BUILTIN_WORKFLOWS: BuiltinWorkflow[] = [
  {
    slug: "wallet-worth",
    name: "What is this wallet worth?",
    description: "Reads every balance in a Stellar wallet and prices each token in US dollars on Stellar's own exchange.",
    ask: "What is wallet GCNF…TXX6 worth in dollars?",
    inputs: [{ name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address. It starts with G.", placeholder: "G…" }, networkInput],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    steps: [
      { title: "Read the wallet's balances", api: "stellar-account" },
      { title: "Price each token in USDC on Stellar's exchange", api: "stellar-convert" },
      { title: "Add it all up in dollars", api: "" },
    ],
    run: async (args, call) => {
      const address = need(args, "address", "Wallet address");
      const network = args.network || "mainnet";
      const acct = await call<Account>("Read the wallet's balances", "stellar-account", { address, network });
      if (!acct.active) return { answer: "This wallet is empty: it has never received any XLM.", details: { totalUsd: 0 } };
      // Prices always come from mainnet: testnet tokens have no real value.
      const priced: { token: string; amount: number; usd: number | null }[] = [];
      for (const b of acct.balances) {
        if (b.amount === 0) continue;
        if (b.token === "USDC") { priced.push({ token: b.token, amount: b.amount, usd: b.amount }); continue; }
        const official = b.token === "XLM" || (OFFICIAL.has(b.token) && network === "mainnet");
        if (!official) { priced.push({ token: b.token, amount: b.amount, usd: null }); continue; }
        const q = await call<Convert>(`Price ${b.token} in USDC`, "stellar-convert", { amount: String(b.amount), from: b.token, to: "USDC", network: "mainnet" });
        priced.push({ token: b.token, amount: b.amount, usd: Number(q.youGet.split(" ")[0]) });
      }
      const total = priced.reduce((s, p) => s + (p.usd ?? 0), 0);
      const unpriced = priced.filter((p) => p.usd == null).map((p) => p.token);
      const parts = priced.filter((p) => p.usd != null).map((p) => `${fmt(p.amount, 4)} ${p.token} ($${fmt(p.usd ?? 0)})`);
      const testnote = network === "testnet" ? " Testnet tokens have no real value; this uses mainnet prices for reference." : "";
      return {
        answer: `This wallet is worth about $${fmt(total)}: ${parts.join(", ") || "nothing priced"}.${unpriced.length ? ` Not priced: ${unpriced.join(", ")}.` : ""}${testnote}`,
        details: { totalUsd: Number(total.toFixed(2)), holdings: priced },
      };
    },
  },
  {
    slug: "can-i-pay",
    name: "Can this wallet make a payment?",
    description: "Checks a wallet's balance, Stellar's minimum-balance rule and today's fee, then says yes or no before you try to send.",
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
      { title: "Compare balance with amount + fee + the minimum it must keep", api: "" },
    ],
    run: async (args, call) => {
      const address = need(args, "address", "Wallet address");
      const amount = Number(need(args, "amount", "Amount"));
      if (!Number.isFinite(amount) || amount <= 0) throw new StepFailed("Amount must be a positive number");
      const network = args.network || "mainnet";
      const acct = await call<Account>("Read the wallet's balance", "stellar-account", { address, network });
      const fees = await call<Fees>("Check today's network fee", "stellar-fees", { network });
      if (!acct.active) return { answer: "No. This wallet doesn't exist on the network yet, so it can't send anything.", details: { canPay: false } };
      const xlm = acct.balances.find((b) => b.token === "XLM")?.amount ?? 0;
      const reserve = acct.mustKeepXlm ?? 1;
      const spendable = Math.max(0, xlm - reserve - fees.fastFeeXlm);
      const yes = spendable >= amount;
      return {
        answer: yes
          ? `Yes. It holds ${fmt(xlm, 4)} XLM and can send ${fmt(amount, 4)} XLM while keeping the ${fmt(reserve, 1)} XLM Stellar requires it to hold.`
          : `No. It holds ${fmt(xlm, 4)} XLM but must keep ${fmt(reserve, 1)} XLM, so the most it can send right now is ${fmt(spendable, 4)} XLM.`,
        details: { canPay: yes, balanceXlm: xlm, mustKeepXlm: reserve, feeXlm: fees.fastFeeXlm, maxYouCanSendXlm: Number(spendable.toFixed(7)) },
      };
    },
  },
  {
    slug: "payment-receipt",
    name: "Explain this transaction",
    description: "Turns a Stellar transaction ID into a plain receipt: who paid whom, how much (with the dollar value), when, and the fee.",
    ask: "Explain transaction 5f3235cc… in plain words.",
    inputs: [{ name: "hash", label: "Transaction ID", in: "query", required: true, description: "The 64-character ID shown after a transaction.", placeholder: "5f3235cc…" }, networkInput],
    example: { hash: "5f3235cc72dd7091d72fc652ecc7bbcfe4599db0663d75a2105e53da19461793", network: "mainnet" },
    steps: [
      { title: "Look up the transaction", api: "stellar-transaction" },
      { title: "Get the XLM price for the dollar value", api: "stellar-price" },
      { title: "Write the receipt", api: "" },
    ],
    run: async (args, call) => {
      const hash = need(args, "hash", "Transaction ID");
      const network = args.network || "mainnet";
      const tx = await call<Tx>("Look up the transaction", "stellar-transaction", { hash, network });
      const px = await call<Price>("Get the XLM price for the dollar value", "stellar-price", { token: "XLM", in: "USDC", network: "mainnet" });
      const when = new Date(tx.when).toUTCString().replace(" GMT", " UTC");
      const lines = tx.whatItDid.map((s) => {
        const usd = s.amount != null && s.token === "XLM" ? ` (about $${fmt(s.amount * px.price)})` : s.amount != null && s.token === "USDC" ? ` ($${fmt(s.amount)})` : "";
        if (s.what === "payment" || s.what.startsWith("swap")) return `${short(s.from)} sent ${fmt(s.amount ?? 0, 7)} ${s.token}${usd} to ${short(s.to)}`;
        if (s.what === "new wallet funded") return `${short(s.from)} opened wallet ${short(s.to)} with ${fmt(s.amount ?? 0, 7)} XLM${usd}`;
        if (s.what === "wallet closed and merged") return `${short(s.from)} closed and moved everything into ${short(s.to)}`;
        if (s.what === "smart contract call") return `${short(s.from)} called a smart contract`;
        return `${short(s.from)}: ${s.what}`;
      });
      return {
        answer: `${tx.succeeded ? "Succeeded" : "Failed"} on ${when}. ${lines.join("; ") || "No actions"}. Fee paid: ${tx.feePaidXlm} XLM.${tx.memo ? ` Memo: "${tx.memo}".` : ""}`,
        details: { succeeded: tx.succeeded, when: tx.when, sentBy: tx.sentBy, feePaidXlm: tx.feePaidXlm, actions: tx.whatItDid.length },
      };
    },
  },
  {
    slug: "wallet-activity",
    name: "Wallet activity summary",
    description: "Sums up a wallet's recent payments: how much came in, how much went out, and who it dealt with most.",
    ask: "Summarise the recent activity of wallet GCNF…TXX6.",
    inputs: [{ name: "address", label: "Wallet address", in: "query", required: true, description: "A Stellar wallet address. It starts with G.", placeholder: "G…" }, networkInput],
    example: { address: "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6", network: "mainnet" },
    steps: [
      { title: "Read the last 20 payments", api: "stellar-payments" },
      { title: "Total what came in and went out", api: "" },
    ],
    run: async (args, call) => {
      const address = need(args, "address", "Wallet address");
      const network = args.network || "mainnet";
      const p = await call<Payments>("Read the last 20 payments", "stellar-payments", { address, network, limit: "20" });
      if (p.payments.length === 0) return { answer: "No payments found for this wallet.", details: { payments: 0 } };
      const tally = (dir: "in" | "out") => {
        const m: Record<string, number> = {};
        for (const x of p.payments) if (x.direction === dir && x.amount != null && x.token) m[x.token] = (m[x.token] ?? 0) + x.amount;
        return m;
      };
      const fmtTally = (m: Record<string, number>) => Object.entries(m).map(([t, v]) => `${fmt(v, 4)} ${t}`).join(" and ") || "nothing";
      const inn = tally("in");
      const out = tally("out");
      const mergedIn = p.payments.filter((x) => x.direction === "in" && x.what === "wallet closed and merged").length;
      const merged = mergedIn ? `the leftover XLM of ${mergedIn} wallet${mergedIn > 1 ? "s" : ""} closed into it` : "";
      const received = Object.keys(inn).length ? `received ${fmtTally(inn)}${merged ? ` plus ${merged}` : ""}` : merged ? `received ${merged}` : "received nothing";
      const counts: Record<string, number> = {};
      for (const x of p.payments) if (x.counterparty) counts[x.counterparty] = (counts[x.counterparty] ?? 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const first = p.payments[p.payments.length - 1]!.when;
      const last = p.payments[0]!.when;
      return {
        answer: `In its last ${p.payments.length} payments (${new Date(first).toDateString()} to ${new Date(last).toDateString()}) this wallet ${received}, and sent ${fmtTally(out)}.${top ? ` It dealt most with ${short(top[0])} (${top[1]} times).` : ""}`,
        details: { payments: p.payments.length, received: inn, walletsMergedIn: mergedIn, sent: out, mostFrequent: top?.[0] ?? null, lastActivity: last },
      };
    },
  },
  {
    slug: "stellar-snapshot",
    name: "Stellar right now",
    description: "One update on Stellar: XLM's price, network health and fees, and the Kage pool.",
    ask: "Give me a quick update on Stellar right now.",
    inputs: [],
    example: {},
    steps: [
      { title: "Get XLM's price on Stellar's exchange", api: "stellar-price" },
      { title: "Check network health", api: "stellar-network" },
      { title: "Check fees", api: "stellar-fees" },
      { title: "Read the Kage pool", api: "kage-pool" },
    ],
    run: async (_args, call) => {
      const px = await call<Price>("Get XLM's price on Stellar's exchange", "stellar-price", { token: "XLM", in: "USDC", network: "mainnet" });
      const net = await call<Net>("Check network health", "stellar-network", { network: "mainnet" });
      const fees = await call<Fees>("Check fees", "stellar-fees", { network: "mainnet" });
      const pool = await call<Pool>("Read the Kage pool", "kage-pool", { network: "mainnet" });
      return {
        answer: `XLM is $${fmt(px.price, 4)}. Stellar is ${net.healthy ? "running normally" : "slow right now"} (block ${net.latestBlock.toLocaleString("en-US")}, ${net.transactionsInBlock} transactions, protocol ${net.protocolVersion}) and ${fees.howBusy.toLowerCase()}; a typical fee is ${fees.typicalFeeXlm} XLM. The Kage pool holds ${pool.privatePayments} private payments.`,
        details: { xlmUsd: px.price, healthy: net.healthy, latestBlock: net.latestBlock, howBusy: fees.howBusy, typicalFeeXlm: fees.typicalFeeXlm, kagePayments: pool.privatePayments, kagePoolXlm: pool.xlmInPool },
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
