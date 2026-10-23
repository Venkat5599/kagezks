// Behaviour of each built-in API against canned Horizon / Soroban answers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { runBuiltinApi } from "@/lib/builtin-catalog";
import { NETWORKS } from "@/lib/networks";
import { upstream, failingFetch, on, account, page, feeStats, ledger, book, paths, tx, op, addr, ADMIN, USDC_MAIN, EURC_MAIN, HASH } from "./helpers/upstream";

vi.mock("@/lib/chain-read", () => ({ readContract: vi.fn() }));
import { readContract } from "@/lib/chain-read";
const read = vi.mocked(readContract);

const ok = async (slug: string, args: Record<string, unknown>) => {
  const r = await runBuiltinApi(slug, args);
  if (!r.ok) throw new Error(`${r.status} ${r.error}`);
  return r.data as Record<string, any>;
};
const fail = async (slug: string, args: Record<string, unknown>) => {
  const r = await runBuiltinApi(slug, args);
  if (r.ok) throw new Error("expected an error");
  return r;
};

const BAD_ADDRESSES = [
  ["empty", ""],
  ["spaces", "   "],
  ["too short", "G123"],
  ["secret key", Keypair.random().secret()],
  ["contract", "CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV"],
  ["lowercase", ADMIN.toLowerCase()],
  ["one char off", ADMIN.slice(0, -1) + "7"],
  ["truncated", ADMIN.slice(0, 40)],
  ["space inside", ADMIN.slice(0, 20) + " " + ADMIN.slice(20)],
  ["muxed", "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ"],
];

describe("stellar-account", () => {
  it("lists XLM and tokens with their issuer", async () => {
    upstream(on(`/accounts/${ADMIN}`, account("12.5", { subentries: 1, tokens: [{ code: "USDC", issuer: USDC_MAIN, balance: "3.25" }] })));
    const d = await ok("stellar-account", { address: ADMIN });
    expect(d.active).toBe(true);
    expect(d.balances).toEqual([{ token: "USDC", amount: 3.25, issuedBy: USDC_MAIN }, { token: "XLM", amount: 12.5 }]);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 8, 10, 20])("with %i trustlines/offers the wallet must keep 1 + 0.5 each", async (n) => {
    upstream(on(`/accounts/${ADMIN}`, account("6", { subentries: n })));
    const d = await ok("stellar-account", { address: ADMIN });
    expect(d.mustKeepXlm).toBe(1 + 0.5 * n);
    expect(d.spendableXlm).toBe(Math.max(0, Number((6 - (1 + 0.5 * n)).toFixed(7))));
  });
  it("an address that was never funded is 'not active', not an error", async () => {
    upstream();
    const d = await ok("stellar-account", { address: addr() });
    expect(d).toMatchObject({ active: false, balances: [] });
    expect(d.note).toMatch(/never received any XLM/);
  });
  it.each([500, 503, 429])("Horizon %i becomes a 502", async (status) => {
    upstream(on(`/accounts/${ADMIN}`, "oops", status));
    expect(await fail("stellar-account", { address: ADMIN })).toMatchObject({ status: 502, error: `horizon ${status}` });
  });
  it.each(BAD_ADDRESSES)("refuses a %s address without calling Horizon", async (_n, a) => {
    const u = upstream();
    const r = await fail("stellar-account", { address: a });
    expect(r.status).toBe(400);
    expect(u.calls).toHaveLength(0);
  });
  it.each([
    ["mainnet", "horizon.stellar.org"],
    ["testnet", "horizon-testnet.stellar.org"],
    ["Testnet", "horizon-testnet.stellar.org"],
    ["", "horizon.stellar.org"],
    ["nonsense", "horizon.stellar.org"],
  ])("network %j reads %s", async (network, host) => {
    const u = upstream(on(`/accounts/${ADMIN}`, account("1")));
    const d = await ok("stellar-account", { address: ADMIN, network });
    expect(u.hosts()).toEqual([host]);
    expect(d.network).toBe(host.includes("testnet") ? "testnet" : "mainnet");
  });
});

describe("stellar-payments", () => {
  const OTHER = addr();
  it.each([
    [undefined, 5],
    ["1", 1],
    ["5", 5],
    ["20", 20],
    ["21", 20],
    ["500", 20],
    ["-3", 1],
    ["0", 5],
    ["abc", 5],
    ["7.9", 7],
  ])("limit %j asks Horizon for %i", async (limit, want) => {
    const u = upstream(on(`/accounts/${ADMIN}/payments`, page([])));
    await ok("stellar-payments", { address: ADMIN, ...(limit === undefined ? {} : { limit }) });
    expect(u.calls[0]!.searchParams.get("limit")).toBe(String(want));
    expect(u.calls[0]!.searchParams.get("order")).toBe("desc");
  });
  it("marks direction and counterparty from this wallet's point of view", async () => {
    upstream(on(`/accounts/${ADMIN}/payments`, page([
      op({ type: "payment", from: OTHER, to: ADMIN, amount: "4", asset_type: "native" }),
      op({ type: "payment", from: ADMIN, to: OTHER, amount: "1.5", asset_type: "credit_alphanum4", asset_code: "USDC" }),
    ])));
    const d = await ok("stellar-payments", { address: ADMIN });
    expect(d.payments.map((p: any) => [p.direction, p.amount, p.token, p.counterparty])).toEqual([
      ["in", 4, "XLM", OTHER],
      ["out", 1.5, "USDC", OTHER],
    ]);
  });
  it("hides failed transactions", async () => {
    upstream(on(`/accounts/${ADMIN}/payments`, page([op({ type: "payment", from: OTHER, to: ADMIN, amount: "4", asset_type: "native", transaction_successful: false })])));
    expect((await ok("stellar-payments", { address: ADMIN })).payments).toEqual([]);
  });
  it("counts a wallet merged into this one as incoming", async () => {
    upstream(on(`/accounts/${ADMIN}/payments`, page([op({ type: "account_merge", account: OTHER, into: ADMIN })])));
    const [p] = (await ok("stellar-payments", { address: ADMIN })).payments;
    expect(p).toMatchObject({ direction: "in", what: "wallet closed and merged", counterparty: OTHER });
  });
  it("counts funding a new wallet as outgoing", async () => {
    upstream(on(`/accounts/${ADMIN}/payments`, page([op({ type: "create_account", funder: ADMIN, account: OTHER, starting_balance: "2" })])));
    const [p] = (await ok("stellar-payments", { address: ADMIN })).payments;
    expect(p).toMatchObject({ direction: "out", amount: 2, counterparty: OTHER });
  });
  it.each(["mainnet", "testnet"] as const)("links each payment to the %s explorer", async (network) => {
    upstream(on(`/accounts/${ADMIN}/payments`, page([op({ type: "payment", from: OTHER, to: ADMIN, amount: "1", asset_type: "native" })])));
    const [p] = (await ok("stellar-payments", { address: ADMIN, network })).payments;
    expect(p.viewOnExplorer).toBe(`${NETWORKS[network].explorer}/tx/${HASH}`);
  });
  it("an unfunded wallet has no payments", async () => {
    upstream();
    expect(await ok("stellar-payments", { address: OTHER })).toMatchObject({ payments: [] });
  });
  it.each(BAD_ADDRESSES)("refuses a %s address", async (_n, a) => {
    expect((await fail("stellar-payments", { address: a })).status).toBe(400);
  });
});

describe("stellar-transaction", () => {
  const routes = (t: unknown, ops: unknown[] = [], txStatus = 200, opsStatus = 200) => [on(`/transactions/${HASH}`, t, txStatus), on(`/transactions/${HASH}/operations`, page(ops), opsStatus)];
  it.each([
    ["empty", ""],
    ["short", "abc"],
    ["63 chars", HASH.slice(1)],
    ["65 chars", HASH + "a"],
    ["non-hex", HASH.slice(0, 63) + "g"],
    ["0x prefix", "0x" + HASH.slice(2)],
    ["space inside", HASH.slice(0, 30) + " " + HASH.slice(31)],
  ])("refuses a %s ID", async (_n, hash) => {
    const u = upstream();
    expect((await fail("stellar-transaction", { hash })).status).toBe(400);
    expect(u.calls).toHaveLength(0);
  });
  it("accepts an upper-case ID", async () => {
    const u = upstream(...routes(tx()));
    await ok("stellar-transaction", { hash: HASH.toUpperCase() });
    expect(u.calls[0]!.pathname).toBe(`/transactions/${HASH}`);
  });
  it("reports success, sender, fee in XLM and what it did", async () => {
    const B = addr();
    upstream(...routes(tx({ fee_charged: "12345" }), [op({ type: "payment", from: ADMIN, to: B, amount: "1", asset_type: "native" })]));
    const d = await ok("stellar-transaction", { hash: HASH });
    expect(d).toMatchObject({ succeeded: true, sentBy: ADMIN, feePaidXlm: 0.0012345, memo: null });
    expect(d.whatItDid).toEqual([{ what: "payment", from: ADMIN, to: B, amount: 1, token: "XLM" }]);
  });
  it("shows a failed transaction as failed", async () => {
    upstream(...routes(tx({ successful: false })));
    expect((await ok("stellar-transaction", { hash: HASH })).succeeded).toBe(false);
  });
  it.each([
    ["text", "invoice 42", "invoice 42"],
    ["id", "12345", "12345"],
  ])("keeps a %s memo", async (memo_type, memo, want) => {
    upstream(...routes(tx({ memo_type, memo })));
    expect((await ok("stellar-transaction", { hash: HASH })).memo).toBe(want);
  });
  it("still answers when the operation list is unavailable", async () => {
    upstream(...routes(tx(), [], 200, 500));
    expect((await ok("stellar-transaction", { hash: HASH })).whatItDid).toEqual([]);
  });
  it.each(["mainnet", "testnet"])("a missing ID is a 404 that names %s", async (network) => {
    upstream();
    const r = await fail("stellar-transaction", { hash: HASH, network });
    expect(r).toMatchObject({ status: 404 });
    expect(r.error).toContain(network);
  });
  it("Horizon trouble is a 502", async () => {
    upstream(...routes("x", [], 500));
    expect((await fail("stellar-transaction", { hash: HASH })).status).toBe(502);
  });
});

describe("stellar-fees", () => {
  it.each([
    ["0", "Quiet"],
    ["0.3", "Quiet"],
    ["0.5", "Quiet"],
    ["0.51", "Busy"],
    ["0.9", "Busy"],
    ["0.91", "Very busy"],
    ["1", "Very busy"],
  ])("capacity %s reads as %s", async (usage, want) => {
    upstream(on("/fee_stats", feeStats(usage)));
    const d = await ok("stellar-fees", {});
    expect(d.howBusy).toBe(want);
    expect(d.capacityUsedPct).toBe(Math.round(Number(usage) * 100));
  });
  it("converts fees from stroops to XLM", async () => {
    upstream(on("/fee_stats", feeStats("0.1", "150", "10000", "100")));
    expect(await ok("stellar-fees", {})).toMatchObject({ minimumFeeXlm: 0.00001, typicalFeeXlm: 0.000015, fastFeeXlm: 0.001 });
  });
  it("Horizon trouble is a 502", async () => {
    upstream(on("/fee_stats", "x", 500));
    expect((await fail("stellar-fees", {})).status).toBe(502);
  });
});

describe("stellar-network", () => {
  it.each([
    [0, true],
    [5, true],
    [59, true],
    [61, false],
    [300, false],
    [3600, false],
  ])("a block closed %is ago means healthy=%s", async (age, healthy) => {
    upstream(on("/ledgers", ledger(age)));
    const d = await ok("stellar-network", {});
    expect(d.healthy).toBe(healthy);
    expect(Math.abs(d.closedSecondsAgo - age)).toBeLessThanOrEqual(1);
  });
  it("reports block, transactions, protocol and the 1 XLM minimum balance", async () => {
    upstream(on("/ledgers", ledger(3)));
    expect(await ok("stellar-network", {})).toMatchObject({ latestBlock: 60_000_000, transactionsInBlock: 120, failedInBlock: 3, protocolVersion: 23, minimumWalletBalanceXlm: 1, totalXlmInExistence: 105443902087 });
  });
  it("no ledger is a 502", async () => {
    upstream(on("/ledgers", page([])));
    expect((await fail("stellar-network", {})).status).toBe(502);
  });
});

describe("stellar-price", () => {
  it("is the midpoint of the best bid and ask", async () => {
    upstream(on("/order_book", book("0.17", "0.19")));
    expect(await ok("stellar-price", { token: "XLM", in: "USDC" })).toMatchObject({ pair: "XLM/USDC", price: 0.18, buyAt: 0.19, sellAt: 0.17 });
  });
  it("prices in USDC when no currency is given", async () => {
    const u = upstream(on("/order_book", book("1", "1.2")));
    await ok("stellar-price", { token: "EURC" });
    expect(u.calls[0]!.searchParams.get("buying_asset_code")).toBe("USDC");
    expect(u.calls[0]!.searchParams.get("selling_asset_issuer")).toBe(EURC_MAIN);
  });
  it.each([
    ["no bids", null, "1"],
    ["no asks", "1", null],
    ["empty book", null, null],
  ])("falls back to the best route when the book has %s", async (_n, bid, ask) => {
    upstream(on("/order_book", book(bid, ask)), on("/paths/strict-send", paths(["0.5", ["XLM"]], ["0.52", ["XLM", "USDC"]])));
    const d = await ok("stellar-price", { token: "AQUA", in: "EURC" });
    expect(d.price).toBe(0.52);
    expect(d.via).toEqual(["XLM", "USDC"]);
  });
  it("says 'no market' when there is no book and no route", async () => {
    upstream(on("/order_book", book(null, null)), on("/paths/strict-send", page([])));
    expect(await fail("stellar-price", { token: "AQUA", in: "EURC" })).toMatchObject({ status: 404 });
  });
  it.each([
    ["XLM", "XLM"],
    ["usdc", "USDC"],
    [`USDC:${USDC_MAIN}`, "USDC"],
  ])("refuses pricing %s in %s", async (token, inn) => {
    upstream();
    expect((await fail("stellar-price", { token, in: inn })).status).toBe(400);
  });
  it("keeps 7 significant digits", async () => {
    upstream(on("/order_book", book("0.123456789", "0.123456789")));
    expect((await ok("stellar-price", { token: "XLM" })).price).toBe(0.1234568);
  });
  it("needs a token", async () => {
    upstream();
    expect(await fail("stellar-price", {})).toMatchObject({ status: 400, error: "Token is required" });
  });
});

describe("stellar-convert", () => {
  it.each(["0", "-1", "abc", "Infinity", "NaN", "1e400", "-0.5"])("refuses amount %j", async (amount) => {
    const u = upstream();
    expect((await fail("stellar-convert", { amount, from: "XLM", to: "USDC" })).status).toBe(400);
    expect(u.calls).toHaveLength(0);
  });
  it("picks the route that pays the most", async () => {
    upstream(on("/paths/strict-send", paths(["17.1", []], ["17.6", ["AQUA"]], ["16.9", ["EURC"]])));
    expect(await ok("stellar-convert", { amount: "100", from: "XLM", to: "USDC" })).toMatchObject({ youSend: "100 XLM", youGet: "17.6 USDC", route: "XLM → AQUA → USDC", rate: "1 XLM = 0.176 USDC" });
  });
  it("shows a direct route as two tokens", async () => {
    upstream(on("/paths/strict-send", paths(["17.6841507", []])));
    expect((await ok("stellar-convert", { amount: "100", from: "XLM", to: "USDC" })).route).toBe("XLM → USDC");
  });
  it("asks Horizon to send exactly the amount, from the right asset", async () => {
    const u = upstream(on("/paths/strict-send", paths(["1", []])));
    await ok("stellar-convert", { amount: "2.5", from: "EURC", to: "XLM" });
    const q = u.calls[0]!.searchParams;
    expect([q.get("source_amount"), q.get("source_asset_code"), q.get("destination_assets")]).toEqual(["2.5", "EURC", "native"]);
  });
  it("no route is a 404", async () => {
    upstream(on("/paths/strict-send", page([])));
    expect((await fail("stellar-convert", { amount: "1", from: "AQUA", to: "yXLM" })).status).toBe(404);
  });
  it("Horizon trouble is a 502", async () => {
    upstream(on("/paths/strict-send", "x", 500));
    expect((await fail("stellar-convert", { amount: "1", from: "XLM", to: "USDC" })).status).toBe(502);
  });
  it.each(["amount", "from", "to"])("needs %s", async (k) => {
    const args: Record<string, string> = { amount: "1", from: "XLM", to: "USDC" };
    delete args[k];
    upstream();
    expect((await fail("stellar-convert", args)).status).toBe(400);
  });
  it("same token both sides is refused", async () => {
    upstream();
    expect((await fail("stellar-convert", { amount: "1", from: "USDC", to: "usdc" })).status).toBe(400);
  });
  it("works on testnet with testnet USDC", async () => {
    const u = upstream(on("/paths/strict-send", paths(["9", []])));
    await ok("stellar-convert", { amount: "50", from: "XLM", to: "USDC", network: "testnet" });
    expect(u.calls[0]!.host).toBe("horizon-testnet.stellar.org");
    expect(u.calls[0]!.searchParams.get("destination_assets")).toContain("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  });
});

describe("stellar-token", () => {
  const asset = (flags: { auth_required: boolean; auth_revocable: boolean; auth_clawback_enabled: boolean }, extra: Record<string, unknown> = {}) =>
    page([{ accounts: { authorized: 2495789 }, balances: { authorized: "1234567.89" }, contracts_amount: "9876.5", contract_id: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", flags, _links: { toml: { href: "https://example.org/.well-known/stellar.toml" } }, ...extra }]);
  it("XLM needs no lookup and can't be frozen", async () => {
    const u = upstream();
    const d = await ok("stellar-token", { token: "xlm" });
    expect(d.note).toMatch(/can't be frozen/);
    expect(u.calls).toHaveLength(0);
  });
  it("official USDC: holders, supply, Circle as issuer", async () => {
    upstream(on("/assets", asset({ auth_required: false, auth_revocable: true, auth_clawback_enabled: false })));
    expect(await ok("stellar-token", { token: "USDC" })).toMatchObject({ token: "USDC", issuedBy: "Circle", issuerAddress: USDC_MAIN, walletsHolding: 2495789, supplyInWallets: 1234568, heldBySmartContracts: 9877 });
  });
  it("a custom token names its issuer's domain", async () => {
    upstream(on("/assets", asset({ auth_required: false, auth_revocable: false, auth_clawback_enabled: false })));
    expect((await ok("stellar-token", { token: `BENJI:${addr()}` })).issuedBy).toBe("example.org");
  });
  const combos = [false, true].flatMap((a) => [false, true].flatMap((b) => [false, true].map((c) => [a, b, c] as const)));
  it.each(combos)("flags required=%s revocable=%s clawback=%s are reported as-is", async (r, v, c) => {
    upstream(on("/assets", asset({ auth_required: r, auth_revocable: v, auth_clawback_enabled: c })));
    expect(await ok("stellar-token", { token: "EURC" })).toMatchObject({ needsApprovalToHold: r, issuerCanFreeze: v, issuerCanClawBack: c });
  });
  it("an issuer with no such token is a 404", async () => {
    upstream(on("/assets", page([])));
    expect((await fail("stellar-token", { token: `ZZZ:${addr()}` })).status).toBe(404);
  });
});

describe("kage-pool", () => {
  beforeEach(() => read.mockReset());
  it("reads payments, free slots and XLM held", async () => {
    read.mockResolvedValueOnce(32).mockResolvedValueOnce(20_000_000n);
    expect(await ok("kage-pool", {})).toMatchObject({ privatePayments: 32, slotsLeft: 992, xlmInPool: 2, poolContract: NETWORKS.mainnet.pool });
  });
  it.each(["mainnet", "testnet"] as const)("reads the %s pool and its XLM contract", async (network) => {
    read.mockResolvedValue(8);
    await ok("kage-pool", { network });
    expect(read.mock.calls[0]![1]).toBe(NETWORKS[network].pool);
    expect(read.mock.calls[0]![2]).toBe("leaf_count");
    expect(read.mock.calls[1]![1]).toBe(NETWORKS[network].xlmSac);
    expect(read.mock.calls[1]![2]).toBe("balance");
  });
  it("an unreadable balance is null, not zero", async () => {
    read.mockResolvedValueOnce(5).mockResolvedValueOnce(null);
    expect((await ok("kage-pool", {})).xlmInPool).toBeNull();
  });
  it("an unreadable pool is a 502", async () => {
    read.mockResolvedValue(null);
    expect((await fail("kage-pool", {})).status).toBe(502);
  });
});

describe("runBuiltinApi", () => {
  it("unknown API is a 404", async () => {
    expect(await runBuiltinApi("weather", {})).toEqual({ ok: false, status: 404, error: "no built-in API 'weather'" });
  });
  it("numbers become strings and empty values are dropped", async () => {
    const u = upstream(on("/paths/strict-send", paths(["1", []])));
    await ok("stellar-convert", { amount: 3, from: "XLM", to: "USDC", network: null, extra: undefined });
    expect(u.calls[0]!.searchParams.get("source_amount")).toBe("3");
  });
  it("a timeout says so", async () => {
    failingFetch(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    expect(await fail("stellar-fees", {})).toEqual({ ok: false, status: 502, error: "upstream timed out" });
  });
  it("a network failure is a 502 with the reason", async () => {
    failingFetch(new TypeError("fetch failed"));
    expect(await fail("stellar-fees", {})).toEqual({ ok: false, status: 502, error: "fetch failed" });
  });
  it("sends a user-agent and asks for JSON", async () => {
    const u = upstream(on("/fee_stats", feeStats()));
    await ok("stellar-fees", {});
    const init = u.fn.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).accept).toBe("application/json");
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^kage-catalog/);
  });
});
