// The plain-HTTP routes behind the catalog and the landing page.
import { describe, it, expect, vi } from "vitest";
import { upstream, on, feeStats, ADMIN } from "./helpers/upstream";
import { GET as catalogGET } from "@/app/api/catalog/[slug]/route";
import { GET as flowsGET } from "@/app/api/flows/[slug]/route";
import { GET as poolGET } from "@/app/api/pool-activity/route";

vi.mock("@/lib/chain-read", () => ({ readContract: vi.fn(async () => null) }));
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("GET /api/catalog/<api>", () => {
  it("returns the data with open CORS", async () => {
    upstream(on("/fee_stats", feeStats()));
    const r = await catalogGET(new Request("https://kageai.me/api/catalog/stellar-fees"), ctx("stellar-fees"));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.json()).toMatchObject({ ok: true, data: { network: "mainnet", howBusy: "Quiet" } });
  });
  it("passes query parameters as arguments", async () => {
    const u = upstream(on("/fee_stats", feeStats()));
    await catalogGET(new Request("https://kageai.me/api/catalog/stellar-fees?network=testnet"), ctx("stellar-fees"));
    expect(u.hosts()).toEqual(["horizon-testnet.stellar.org"]);
  });
  it.each([
    ["weather", "", 404],
    ["stellar-account", "?address=bad", 400],
    ["stellar-convert", "?amount=1&from=XLM&to=XLM", 400],
  ])("%s%s -> %i with ok:false", async (slug, q, status) => {
    upstream();
    const r = await catalogGET(new Request(`https://kageai.me/api/catalog/${slug}${q}`), ctx(slug));
    expect(r.status).toBe(status);
    expect((await r.json()).ok).toBe(false);
  });
});

describe("GET /api/flows/<workflow>", () => {
  it("unknown workflow is a 404", async () => {
    const r = await flowsGET(new Request("https://kageai.me/api/flows/nope"), ctx("nope"));
    expect(r.status).toBe(404);
  });
  it("an error includes the step trace", async () => {
    upstream(on(`/accounts/${ADMIN}`, "x", 500));
    const r = await flowsGET(new Request(`https://kageai.me/api/flows/wallet-worth?address=${ADMIN}`), ctx("wallet-worth"));
    const b = await r.json();
    expect(r.status).toBe(400);
    expect(b.steps).toHaveLength(1);
  });
  it("a missing input is a 400 with no steps", async () => {
    const r = await flowsGET(new Request("https://kageai.me/api/flows/can-i-pay"), ctx("can-i-pay"));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, steps: [] });
  });
});

describe("GET /api/pool-activity", () => {
  // A real mainnet deposit event (leaf 31, 1 XLM) as Stellar Expert returns it.
  const DEPOSIT = { id: "275367919763628033-0001", ts: 1787639857, topics: ["veil", "deposit"], bodyXdr: "AAAAEAAAAAEAAAAEAAAADQAAACAvPemQdWGBGsjZvYzDoZPYnA9zt+w7ExGgpMAY0xpp/wAAAA0AAAAgllT5/btxQoP/J0kvlgv4Yj61+VHyDEF5rQsO5c+3PRwAAAAKAAAAAAAAAAAAAAAAAJiWgAAAAAMAAAAf" };
  const ev = (i: number, kind: "deposit" | "withdraw") => ({ id: `${1000 + i}-0001`, ts: 1787600000 + i, topics: ["veil", kind], bodyXdr: "" });
  const pageOf = (recs: unknown[], next?: string) => ({ _embedded: { records: recs }, _links: next ? { next: { href: next } } : {} });
  const get = (q = "") => poolGET(new Request(`https://kageai.me/api/pool-activity${q}`));

  it("decodes the commitment out of a real deposit event", async () => {
    upstream(on(/events/, pageOf([DEPOSIT])));
    const b = await (await get()).json();
    expect(b).toMatchObject({ ok: true, deposits: 1, withdrawals: 0 });
    expect(b.recent[0]).toEqual({ type: "deposit", at: "2026-08-25T06:37:37.000Z", ref: "2f3de9907561811ac8d9bd8cc3a193d89c0f73b7ec3b1311a0a4c018d31a69ff", link: "https://stellar.expert/explorer/public/op/275367919763628033" });
  });
  it("counts deposits and withdrawals across every page", async () => {
    const first = [...Array.from({ length: 150 }, (_, i) => ev(i, "deposit")), ...Array.from({ length: 50 }, (_, i) => ev(200 + i, "withdraw"))];
    const second = [...Array.from({ length: 30 }, (_, i) => ev(400 + i, "withdraw"))];
    const u = upstream(on(/events/, (url: URL) => (url.searchParams.get("cursor") ? pageOf(second) : pageOf(first, "/explorer/public/contract/X/events?cursor=abc&limit=200"))));
    const b = await (await get()).json();
    expect(b).toMatchObject({ deposits: 150, withdrawals: 80 });
    expect(u.calls).toHaveLength(2);
  });
  it("stops after 20 pages", async () => {
    const full = Array.from({ length: 200 }, (_, i) => ev(i, "deposit"));
    const u = upstream(on(/events/, pageOf(full, "/explorer/public/contract/X/events?cursor=more")));
    await get();
    expect(u.calls).toHaveLength(20);
  });
  it("shows at most the latest 5 and ignores other events", async () => {
    upstream(on(/events/, pageOf([{ ...ev(0, "deposit"), topics: ["veil", "init"] }, ...Array.from({ length: 8 }, (_, i) => ev(i + 1, "withdraw"))])));
    const b = await (await get()).json();
    expect(b.recent).toHaveLength(5);
    expect(b.withdrawals).toBe(8);
    expect(b.recent.every((r: { type: string }) => r.type === "withdraw")).toBe(true);
  });
  it("reads the testnet pool on testnet", async () => {
    const u = upstream(on(/events/, pageOf([])));
    const b = await (await get("?network=testnet")).json();
    expect(u.calls[0]!.pathname).toBe("/explorer/testnet/contract/CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC/events");
    expect(b.network).toBe("testnet");
  });
  it("an unreadable event keeps its type with an empty reference", async () => {
    upstream(on(/events/, pageOf([{ ...ev(1, "deposit"), bodyXdr: "not-xdr" }])));
    expect((await (await get()).json()).recent[0]).toMatchObject({ type: "deposit", ref: "" });
  });
  it("an indexer outage is a 502, never fake numbers", async () => {
    upstream(on(/events/, "down", 503));
    const r = await get();
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ ok: false, error: "stellar.expert 503" });
  });
});
