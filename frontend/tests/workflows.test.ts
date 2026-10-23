// Each workflow chains the real APIs (Horizon faked) and must produce a correct, plain answer.
import { describe, it, expect, vi } from "vitest";
import { runBuiltinWorkflow } from "@/lib/builtin-workflows";
import { upstream, on, account, page, feeStats, ledger, book, paths, tx, op, addr, ADMIN, USDC_MAIN, EURC_MAIN, HASH } from "./helpers/upstream";

vi.mock("@/lib/chain-read", () => ({ readContract: vi.fn(async (_n: unknown, _c: string, m: string) => (m === "leaf_count" ? 32 : 20_000_000n)) }));

const run = async (slug: string, args: Record<string, unknown>) => {
  const r = await runBuiltinWorkflow(slug, args);
  if (!r.ok) throw new Error(`${r.status} ${r.error}`);
  return r.result;
};

describe("wallet-worth", () => {
  it("an empty wallet is worth nothing", async () => {
    upstream();
    const r = await run("wallet-worth", { address: addr() });
    expect(r.answer).toMatch(/empty/);
    expect(r.details.totalUsd).toBe(0);
  });
  it("prices XLM through Stellar's exchange", async () => {
    upstream(on(`/accounts/${ADMIN}`, account("2.6954645")), on("/paths/strict-send", paths(["0.4766", []])));
    const r = await run("wallet-worth", { address: ADMIN });
    expect(r.answer).toBe("This wallet is worth about $0.48: 2.6955 XLM ($0.48).");
    expect(r.details.totalUsd).toBe(0.48);
  });
  it("counts USDC one to one without a lookup", async () => {
    const u = upstream(on(`/accounts/${ADMIN}`, account("0", { tokens: [{ code: "USDC", issuer: USDC_MAIN, balance: "10" }] })));
    const r = await run("wallet-worth", { address: ADMIN });
    expect(r.details.totalUsd).toBe(10);
    expect(u.calls.filter((c) => c.pathname.includes("paths"))).toHaveLength(0);
  });
  it("adds up several tokens", async () => {
    upstream(on(`/accounts/${ADMIN}`, account("100", { tokens: [{ code: "USDC", issuer: USDC_MAIN, balance: "5" }, { code: "EURC", issuer: EURC_MAIN, balance: "2" }] })),
      on("/paths/strict-send", (u: URL) => paths([u.searchParams.get("source_asset_type") === "native" ? "17.5" : "2.3", []])));
    expect((await run("wallet-worth", { address: ADMIN })).details.totalUsd).toBe(24.8);
  });
  it("names tokens it can't price instead of guessing", async () => {
    upstream(on(`/accounts/${ADMIN}`, account("0", { tokens: [{ code: "SCAM", issuer: addr(), balance: "1000000" }] })));
    const r = await run("wallet-worth", { address: ADMIN });
    expect(r.answer).toContain("Not priced: SCAM");
    expect(r.details.totalUsd).toBe(0);
  });
  it("skips zero balances", async () => {
    upstream(on(`/accounts/${ADMIN}`, account("1", { tokens: [{ code: "USDC", issuer: USDC_MAIN, balance: "0" }] })), on("/paths/strict-send", paths(["0.18", []])));
    expect((await run("wallet-worth", { address: ADMIN })).details.holdings).toHaveLength(1);
  });
  it("on testnet it reads testnet balances but uses mainnet prices, and says so", async () => {
    const u = upstream(on(`/accounts/${ADMIN}`, account("10000")), on("/paths/strict-send", paths(["1770", []])));
    const r = await run("wallet-worth", { address: ADMIN, network: "testnet" });
    expect(u.calls[0]!.host).toBe("horizon-testnet.stellar.org");
    expect(u.calls[1]!.host).toBe("horizon.stellar.org");
    expect(r.answer).toMatch(/Testnet tokens have no real value/);
  });
  it("needs an address", async () => {
    upstream();
    expect(await runBuiltinWorkflow("wallet-worth", {})).toMatchObject({ ok: false, status: 400, error: "Wallet address is required" });
  });
});

describe("can-i-pay", () => {
  const setup = (xlm: string, subentries: number, p90 = "100000") =>
    upstream(on(`/accounts/${ADMIN}`, account(xlm, { subentries })), on("/fee_stats", feeStats("0.2", "100", p90)));
  // fast fee 0.01 XLM; must keep 1 + 0.5 * subentries
  it.each([
    ["10", 0, "5", true, 8.99],
    ["10", 0, "8.99", true, 8.99],
    ["10", 0, "9", false, 8.99],
    ["10", 4, "6.9", true, 6.99],
    ["10", 4, "7", false, 6.99],
    ["1", 0, "0.0001", false, 0],
    ["2.6954645", 0, "1", true, 1.6854645],
    ["2.6954645", 0, "2", false, 1.6854645],
    ["1000", 10, "994", false, 993.99],
    ["1000", 10, "993", true, 993.99],
  ])("balance %s, %i entries, send %s -> %s", async (xlm, subs, amount, yes, max) => {
    setup(xlm, subs);
    const r = await run("can-i-pay", { address: ADMIN, amount });
    expect(r.details.canPay).toBe(yes);
    expect(r.details.maxYouCanSendXlm).toBeCloseTo(max, 6);
    expect(r.answer.startsWith(yes ? "Yes." : "No.")).toBe(true);
  });
  it.each(["0", "-5", "abc", "Infinity"])("refuses amount %j", async (amount) => {
    upstream();
    expect(await runBuiltinWorkflow("can-i-pay", { address: ADMIN, amount })).toMatchObject({ ok: false, status: 400 });
  });
  it("a wallet that doesn't exist can't pay", async () => {
    upstream(on("/fee_stats", feeStats()));
    const r = await run("can-i-pay", { address: addr(), amount: "1" });
    expect(r.details.canPay).toBe(false);
    expect(r.answer).toMatch(/doesn't exist/);
  });
});

describe("payment-receipt", () => {
  const B = addr();
  const setup = (ops: unknown[], t = tx()) => upstream(on(`/transactions/${HASH}`, t), on(`/transactions/${HASH}/operations`, page(ops)), on("/order_book", book("0.17", "0.19")));
  it("an XLM payment with its dollar value", async () => {
    setup([op({ type: "payment", from: ADMIN, to: B, amount: "10", asset_type: "native" })]);
    const r = await run("payment-receipt", { hash: HASH });
    expect(r.answer).toContain(`GCNF…TXX6 sent 10 XLM (about $1.8) to ${B.slice(0, 4)}…${B.slice(-4)}`);
    expect(r.answer).toMatch(/^Succeeded on /);
  });
  it("a USDC payment is its own dollar value", async () => {
    setup([op({ type: "payment", from: ADMIN, to: B, amount: "3", asset_type: "credit_alphanum4", asset_code: "USDC" })]);
    expect((await run("payment-receipt", { hash: HASH })).answer).toContain("sent 3 USDC ($3)");
  });
  it("opening a wallet", async () => {
    setup([op({ type: "create_account", funder: ADMIN, account: B, starting_balance: "2" })]);
    expect((await run("payment-receipt", { hash: HASH })).answer).toContain("opened wallet");
  });
  it("closing a wallet", async () => {
    setup([op({ type: "account_merge", account: ADMIN, into: B })]);
    expect((await run("payment-receipt", { hash: HASH })).answer).toContain("closed and moved everything into");
  });
  it("a smart contract call", async () => {
    setup([op({ type: "invoke_host_function", source_account: ADMIN })]);
    expect((await run("payment-receipt", { hash: HASH })).answer).toContain("called a smart contract");
  });
  it("a failed transaction says Failed", async () => {
    setup([], tx({ successful: false }));
    expect((await run("payment-receipt", { hash: HASH })).answer).toMatch(/^Failed on /);
  });
  it("includes the memo and fee", async () => {
    setup([], tx({ memo_type: "text", memo: "rent", fee_charged: "200" }));
    const a = (await run("payment-receipt", { hash: HASH })).answer;
    expect(a).toContain('Memo: "rent"');
    expect(a).toContain("Fee paid: 0.00002 XLM");
  });
});

describe("wallet-activity", () => {
  const P = addr();
  const Q = addr();
  const setup = (ops: unknown[]) => upstream(on(`/accounts/${ADMIN}/payments`, page(ops)));
  const pay = (from: string, to: string, amount: string, code?: string) => op({ type: "payment", from, to, amount, asset_type: code ? "credit_alphanum4" : "native", ...(code ? { asset_code: code } : {}) });
  it("no payments", async () => {
    setup([]);
    expect((await run("wallet-activity", { address: ADMIN })).answer).toBe("No payments found for this wallet.");
  });
  it("totals what came in and went out, per token", async () => {
    setup([pay(P, ADMIN, "5"), pay(Q, ADMIN, "2.5"), pay(ADMIN, P, "1"), pay(P, ADMIN, "3", "USDC")]);
    const r = await run("wallet-activity", { address: ADMIN });
    expect(r.details.received).toEqual({ XLM: 7.5, USDC: 3 });
    expect(r.details.sent).toEqual({ XLM: 1 });
    expect(r.answer).toContain("received 7.5 XLM and 3 USDC");
  });
  it("names the most frequent counterparty", async () => {
    setup([pay(P, ADMIN, "1"), pay(ADMIN, P, "1"), pay(Q, ADMIN, "1")]);
    const r = await run("wallet-activity", { address: ADMIN });
    expect(r.details.mostFrequent).toBe(P);
    expect(r.answer).toContain("(2 times)");
  });
  it("only merges in: says what it received instead of 'nothing'", async () => {
    setup([op({ type: "account_merge", account: P, into: ADMIN }), op({ type: "account_merge", account: Q, into: ADMIN })]);
    const a = (await run("wallet-activity", { address: ADMIN })).answer;
    expect(a).toContain("received the leftover XLM of 2 wallets closed into it");
    expect(a).not.toContain("received nothing");
  });
  it("payments plus one merge", async () => {
    setup([pay(P, ADMIN, "5"), op({ type: "account_merge", account: Q, into: ADMIN })]);
    expect((await run("wallet-activity", { address: ADMIN })).answer).toContain("received 5 XLM plus the leftover XLM of 1 wallet closed into it");
  });
  it("only outgoing: received nothing", async () => {
    setup([pay(ADMIN, P, "5")]);
    expect((await run("wallet-activity", { address: ADMIN })).answer).toContain("received nothing, and sent 5 XLM");
  });
});

describe("stellar-snapshot", () => {
  it("combines price, health, fees and the pool in one answer", async () => {
    upstream(on("/order_book", book("0.17", "0.19")), on("/ledgers", ledger(3)), on("/fee_stats", feeStats("0.1")));
    const r = await run("stellar-snapshot", {});
    expect(r.answer).toBe("XLM is $0.18. Stellar is running normally (block 60,000,000, 120 transactions, protocol 23) and quiet; a typical fee is 0.00001 XLM. The Kage pool holds 32 private payments.");
    expect(r.steps.map((s) => s.ok)).toEqual([true, true, true, true]);
    expect(r.details.kagePoolXlm).toBe(2);
  });
  it("a slow network reads as slow", async () => {
    upstream(on("/order_book", book("0.17", "0.19")), on("/ledgers", ledger(600)), on("/fee_stats", feeStats("0.95")));
    expect((await run("stellar-snapshot", {})).answer).toContain("slow right now");
  });
});

describe("runBuiltinWorkflow", () => {
  it("unknown workflow is a 404", async () => {
    expect(await runBuiltinWorkflow("travel-brief", {})).toEqual({ ok: false, status: 404, error: "no built-in workflow 'travel-brief'" });
  });
  it("a failing step stops the run and is shown in the trace", async () => {
    upstream(on(`/accounts/${ADMIN}`, "down", 503));
    const r = await runBuiltinWorkflow("wallet-worth", { address: ADMIN });
    expect(r).toMatchObject({ ok: false, status: 400, error: "Read the wallet's balances: horizon 503" });
    if (!r.ok) expect(r.steps).toEqual([expect.objectContaining({ title: "Read the wallet's balances", ok: false, error: "horizon 503" })]);
  });
  it("every successful step is timed", async () => {
    upstream(on("/order_book", book("0.17", "0.19")), on("/ledgers", ledger(3)), on("/fee_stats", feeStats()));
    for (const s of (await run("stellar-snapshot", {})).steps) expect(s.ms).toBeGreaterThanOrEqual(0);
  });
});
