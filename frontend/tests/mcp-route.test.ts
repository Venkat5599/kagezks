// The MCP endpoint, driven exactly like an AI assistant drives it: JSON-RPC over HTTP.
import { describe, it, expect, vi } from "vitest";
import { BUILTIN_MCPS, findBuiltinApi } from "@/lib/builtin-catalog";
import { findBuiltinWorkflow } from "@/lib/builtin-workflows";
import { upstream, on, account, page, feeStats, ledger, book, paths, tx, ADMIN, HASH } from "./helpers/upstream";

vi.mock("@/lib/db", () => ({ sql: () => Promise.reject(new Error("no database in tests")) }));
vi.mock("@/lib/chain-read", () => ({ readContract: vi.fn(async (_n: unknown, _c: string, m: string) => (m === "leaf_count" ? 32 : 20_000_000n)) }));
import { POST } from "@/app/mcp/[slug]/route";

let id = 0;
const rpc = async (slug: string, method: string, params: Record<string, unknown> = {}) => {
  const res = await POST(
    new Request(`https://kageai.me/mcp/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }),
    { params: Promise.resolve({ slug }) },
  );
  return { status: res.status, body: (await res.json()) as any };
};
const tools = async (slug: string) => (await rpc(slug, "tools/list")).body.result.tools as { name: string; description: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }[];
const call = async (slug: string, name: string, args: Record<string, unknown>) => {
  const r = (await rpc(slug, "tools/call", { name, arguments: args })).body.result;
  return { isError: !!r.isError, data: JSON.parse(r.content[0].text) };
};

const allUpstreams = () =>
  upstream(
    on(`/accounts/${ADMIN}`, account("2.6954645")),
    on(`/accounts/${ADMIN}/payments`, page([])),
    on(`/transactions/${HASH}`, tx()),
    on(`/transactions/${HASH}/operations`, page([])),
    on("/fee_stats", feeStats()),
    on("/ledgers", ledger(3)),
    on("/order_book", book("0.17", "0.19")),
    on("/paths/strict-send", paths(["17.6", []])),
    on("/assets", page([{ accounts: { authorized: 10 }, balances: { authorized: "5" }, flags: { auth_required: false, auth_revocable: true, auth_clawback_enabled: false } }])),
  );

describe.each(BUILTIN_MCPS)("/mcp/$slug", (m) => {
  it("answers the MCP handshake with its own name", async () => {
    const r = await rpc(m.slug, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(r.status).toBe(200);
    expect(r.body.result.serverInfo.name).toBe(m.slug);
    expect(r.body.result.capabilities.tools).toBeDefined();
  });
  it("lists exactly its tools and workflows", async () => {
    const names = (await tools(m.slug)).map((t) => t.name).sort();
    expect(names).toEqual([...m.tools, ...m.workflows.map((w) => `wf__${w}`)].sort());
  });
  const expected = [...m.tools.map((t) => [t, findBuiltinApi(t.slice(5))!.variables] as const), ...m.workflows.map((w) => [`wf__${w}`, findBuiltinWorkflow(w)!.inputs] as const)];
  it.each(expected)("%s asks for exactly its inputs and is marked free", async (name, vars) => {
    const t = (await tools(m.slug)).find((x) => x.name === name)!;
    expect(Object.keys(t.inputSchema.properties ?? {}).sort()).toEqual(vars.map((v) => v.name).sort());
    expect((t.inputSchema.required ?? []).sort()).toEqual(vars.filter((v) => v.required).map((v) => v.name).sort());
    expect(t.description).toMatch(/\(free\)$/);
  });
});

describe("calling every Stellar Tools tool with its own example", () => {
  const all = BUILTIN_MCPS.find((m) => m.slug === "stellar-tools")!;
  const cases = [
    ...all.tools.map((t) => [t, { ...findBuiltinApi(t.slice(5))!.example, ...(t.includes("transaction") ? { hash: HASH } : {}) }] as const),
    ...all.workflows.map((w) => [`wf__${w}`, { ...findBuiltinWorkflow(w)!.example, ...(w === "payment-receipt" ? { hash: HASH } : {}), ...(w === "can-i-pay" || w === "wallet-worth" || w === "wallet-activity" ? { address: ADMIN } : {}) }] as const),
  ];
  it.each(cases)("%s", async (name, args) => {
    allUpstreams();
    const r = await call("stellar-tools", name, args);
    expect(r.isError, JSON.stringify(r.data)).toBe(false);
    if (name.startsWith("wf__")) expect(typeof r.data.answer).toBe("string");
  });
});

describe("errors an assistant can read", () => {
  it("bad input comes back as a tool error with the reason", async () => {
    upstream();
    const r = await call("stellar-tools", "api__stellar-account", { address: "nope" });
    expect(r.isError).toBe(true);
    expect(r.data).toEqual({ error: "That isn't a valid Stellar wallet address (G…).", status: 400 });
  });
  it("a failed workflow returns its step trace", async () => {
    upstream(on(`/accounts/${ADMIN}`, "x", 500));
    const r = await call("stellar-wallets", "wf__wallet-worth", { address: ADMIN });
    expect(r.isError).toBe(true);
    expect(r.data.steps[0]).toMatchObject({ ok: false });
  });
  it("missing required input is refused before anything runs", async () => {
    const u = upstream();
    const r = (await rpc("stellar-tools", "tools/call", { name: "api__stellar-account", arguments: {} })).body;
    expect(JSON.stringify(r)).toMatch(/address/);
    expect(u.calls).toHaveLength(0);
  });
  it("an unknown server is a 404", async () => {
    const r = await rpc("market-data", "tools/list");
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("no MCP server 'market-data'");
  });
  it("a tool the server doesn't have is refused", async () => {
    const r = (await rpc("stellar-markets", "tools/call", { name: "api__stellar-account", arguments: { address: ADMIN } })).body;
    expect(JSON.stringify(r)).toMatch(/not found/i);
  });
  it("a tool network argument is honoured", async () => {
    const u = allUpstreams();
    await call("stellar-network", "api__stellar-fees", { network: "testnet" });
    expect(u.hosts()).toEqual(["horizon-testnet.stellar.org"]);
  });
});
