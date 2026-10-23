// Every built-in API, workflow and MCP server against the real networks, through the
// deployed app. Assertions are about shape and invariants, not about values that move.
import { describe, it, expect } from "vitest";
import { BUILTIN_APIS, BUILTIN_MCPS } from "@/lib/builtin-catalog";
import { BUILTIN_WORKFLOWS } from "@/lib/builtin-workflows";

const BASE = (process.env.KAGE_URL || "https://kageai.me").replace(/\/$/, "");
const ADMIN = "GCNFKDC4S3T3DOQ5FUBNUQSDOEQB74FGY7U6HGRSXZ3G7346JGOETXX6";
const MAINNET_TX = "5f3235cc72dd7091d72fc652ecc7bbcfe4599db0663d75a2105e53da19461793";
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

const testnetArgs = (slug: string, ex: Record<string, string>): Record<string, string> | null => {
  if (slug === "stellar-transaction" || slug === "payment-receipt") return null; // the example hash is a mainnet tx
  const a = { ...ex, network: "testnet" };
  if (["stellar-price", "stellar-convert"].includes(slug)) return { ...a, token: "XLM", from: "XLM", to: "USDC", in: "USDC" };
  if (slug === "stellar-token") return { ...a, token: "USDC" };
  return a;
};

describe.each(BUILTIN_APIS)(`GET ${BASE}/api/catalog/$slug`, (api) => {
  it("mainnet example answers", async () => {
    const r = await fetch(`${BASE}/api/catalog/${api.slug}?${qs({ ...api.example, ...(api.slug === "stellar-transaction" ? { hash: MAINNET_TX } : {}) })}`);
    const b = await r.json();
    expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.data.network).toBe("mainnet");
  });
  const t = testnetArgs(api.slug, api.example);
  it.skipIf(!t)("testnet answers", async () => {
    const r = await fetch(`${BASE}/api/catalog/${api.slug}?${qs(t!)}`);
    const b = await r.json();
    expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.data.network).toBe("testnet");
  });
});

describe.each(BUILTIN_WORKFLOWS)(`GET ${BASE}/api/flows/$slug`, (wf) => {
  // payment-receipt's example transaction only exists on mainnet.
  it.each(wf.slug === "payment-receipt" ? ["mainnet"] : ["mainnet", "testnet"])("%s gives one plain answer", async (network) => {
    const args = { ...wf.example, ...(wf.inputs.some((i) => i.name === "network") ? { network } : {}) };
    const r = await fetch(`${BASE}/api/flows/${wf.slug}?${qs(args)}`);
    const b = await r.json();
    expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.answer.length).toBeGreaterThan(10);
    expect(b.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);
  });
});

describe.each(BUILTIN_MCPS)(`${BASE}/mcp/$slug`, (m) => {
  const rpc = async (method: string, params: unknown = {}) =>
    (await (await fetch(`${BASE}/mcp/${m.slug}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()) as any;
  it("lists its tools", async () => {
    expect((await rpc("tools/list")).result.tools).toHaveLength(m.tools.length + m.workflows.length);
  });
  it("answers a real call", async () => {
    const name = m.tools.includes("api__stellar-account") ? "api__stellar-account" : m.tools.includes("api__stellar-price") ? "api__stellar-price" : "api__stellar-fees";
    const args = name === "api__stellar-account" ? { address: ADMIN } : name === "api__stellar-price" ? { token: "XLM" } : {};
    const r = (await rpc("tools/call", { name, arguments: args })).result;
    expect(r.isError ?? false, r.content[0].text).toBe(false);
  });
});

describe(`${BASE}/api/pool-activity`, () => {
  it.each(["mainnet", "testnet"])("%s history adds up with the pool's own counter", async (network) => {
    const [act, pool] = await Promise.all([
      fetch(`${BASE}/api/pool-activity?network=${network}`).then((r) => r.json()),
      fetch(`${BASE}/api/catalog/kage-pool?network=${network}`).then((r) => r.json()),
    ]);
    expect(act.ok).toBe(true);
    expect(act.deposits).toBe(pool.data.privatePayments);
    expect(act.withdrawals).toBeLessThanOrEqual(act.deposits);
  });
});
