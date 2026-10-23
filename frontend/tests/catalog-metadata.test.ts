// What every user sees in the catalog must be complete and consistent: each API has a
// plain description, a working example, labelled inputs and a home on an MCP server.
import { describe, it, expect } from "vitest";
import { BUILTIN_APIS, BUILTIN_MCPS, findBuiltinApi, findBuiltinMcp, builtinApiRows, builtinMcpRows } from "@/lib/builtin-catalog";
import { BUILTIN_WORKFLOWS, findBuiltinWorkflow, builtinWorkflowRows, builtinMcpRowsFull } from "@/lib/builtin-workflows";

const CATEGORIES = new Set(["Wallets", "Network", "Markets", "Kage"]);

describe.each(BUILTIN_APIS)("API $slug", (api) => {
  it("has a url-safe slug", () => expect(api.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  it("has a name and a full-sentence description", () => {
    expect(api.name.length).toBeGreaterThan(3);
    expect(api.description).toMatch(/^[A-Z].{20,}\.$/);
  });
  it("uses no em dashes in user-facing text", () => {
    for (const s of [api.name, api.description, api.ask, ...api.variables.map((v) => v.description)]) expect(s).not.toContain("—");
  });
  it("has an example question ending in ?", () => expect(api.ask).toMatch(/\?$/));
  it("belongs to a known category", () => expect(CATEGORIES.has(api.category)).toBe(true));
  it("is tagged stellar or kage", () => expect(api.tags.some((t) => t === "stellar" || t === "kage")).toBe(true));
  it("labels and explains every input", () => {
    for (const v of api.variables) {
      expect(v.label.length).toBeGreaterThan(1);
      expect(v.description.length).toBeGreaterThan(5);
    }
  });
  it("lets the caller pick mainnet or testnet", () => {
    const n = api.variables.find((v) => v.name === "network");
    expect(n?.options?.map((o) => o.value)).toEqual(["mainnet", "testnet"]);
  });
  it("example fills every required input", () => {
    for (const v of api.variables.filter((x) => x.required)) expect(api.example[v.name]?.length ?? 0).toBeGreaterThan(0);
  });
  it("example uses only listed options", () => {
    for (const v of api.variables.filter((x) => x.options)) {
      const ex = api.example[v.name];
      if (ex !== undefined) expect(v.options!.map((o) => o.value)).toContain(ex);
    }
  });
  it("is served by at least one MCP server", () => {
    expect(BUILTIN_MCPS.some((m) => m.tools.includes(`api__${api.slug}`))).toBe(true);
  });
  it("can be found by slug", () => expect(findBuiltinApi(api.slug)).toBe(api));
});

it("API slugs are unique", () => {
  const s = BUILTIN_APIS.map((a) => a.slug);
  expect(new Set(s).size).toBe(s.length);
});
it("there are 9 built-in APIs", () => expect(BUILTIN_APIS).toHaveLength(9));
it("unknown slugs find nothing", () => {
  expect(findBuiltinApi("weather")).toBeUndefined();
  expect(findBuiltinMcp("market-data")).toBeUndefined();
  expect(findBuiltinWorkflow("travel-brief")).toBeUndefined();
});

describe.each(BUILTIN_WORKFLOWS)("workflow $slug", (wf) => {
  it("has a url-safe slug", () => expect(wf.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  it("has a name and a full-sentence description", () => {
    expect(wf.name.length).toBeGreaterThan(3);
    expect(wf.description).toMatch(/^[A-Z].{20,}\.$/);
  });
  it("uses no em dashes in user-facing text", () => {
    for (const s of [wf.name, wf.description, wf.ask, ...wf.steps.map((x) => x.title)]) expect(s).not.toContain("—");
  });
  it("has an example question", () => expect(wf.ask).toMatch(/[?.]$/));
  it("every step uses a real API (or is the final summary)", () => {
    for (const s of wf.steps) if (s.api) expect(findBuiltinApi(s.api), s.api).toBeDefined();
  });
  it("ends with at least one step", () => expect(wf.steps.length).toBeGreaterThan(0));
  it("example fills every required input", () => {
    for (const v of wf.inputs.filter((x) => x.required)) expect(wf.example[v.name]?.length ?? 0).toBeGreaterThan(0);
  });
  it("labels and explains every input", () => {
    for (const v of wf.inputs) {
      expect(v.label.length).toBeGreaterThan(1);
      expect(v.description.length).toBeGreaterThan(5);
    }
  });
  it("is served by at least one MCP server", () => expect(BUILTIN_MCPS.some((m) => m.workflows.includes(wf.slug))).toBe(true));
});

it("workflow slugs are unique and never clash with API slugs", () => {
  const w = BUILTIN_WORKFLOWS.map((x) => x.slug);
  expect(new Set(w).size).toBe(w.length);
  for (const s of w) expect(findBuiltinApi(s)).toBeUndefined();
});
it("there are 5 built-in workflows", () => expect(BUILTIN_WORKFLOWS).toHaveLength(5));

describe.each(BUILTIN_MCPS)("MCP server $slug", (m) => {
  it("every tool is a real built-in API", () => {
    for (const t of m.tools) {
      expect(t.startsWith("api__")).toBe(true);
      expect(findBuiltinApi(t.slice(5)), t).toBeDefined();
    }
  });
  it("every workflow is a real built-in workflow", () => {
    for (const w of m.workflows) expect(findBuiltinWorkflow(w), w).toBeDefined();
  });
  it("lists no tool twice", () => {
    expect(new Set(m.tools).size).toBe(m.tools.length);
    expect(new Set(m.workflows).size).toBe(m.workflows.length);
  });
  it("describes itself in plain words", () => {
    expect(m.description).toMatch(/^[A-Z].{20,}\.$/);
    expect(m.description).not.toContain("—");
  });
  it("is a subset of Stellar Tools", () => {
    const all = findBuiltinMcp("stellar-tools")!;
    for (const t of m.tools) expect(all.tools).toContain(t);
    for (const w of m.workflows) expect(all.workflows).toContain(w);
  });
});

it("Stellar Tools carries every API and every workflow", () => {
  const all = findBuiltinMcp("stellar-tools")!;
  expect(all.tools.sort()).toEqual(BUILTIN_APIS.map((a) => `api__${a.slug}`).sort());
  expect(all.workflows.sort()).toEqual(BUILTIN_WORKFLOWS.map((w) => w.slug).sort());
});

describe("rows the dashboard lists", () => {
  it("API rows are public, free, built-in and point at /api/catalog", () => {
    for (const r of builtinApiRows()) {
      expect(r).toMatchObject({ is_public: true, price: "0", builtin: true, owner_address: null, http_method: "GET" });
      expect(r.target_url).toBe(`https://kageai.me/api/catalog/${r.slug}`);
      expect(r.id).toBe(`builtin:${r.slug}`);
    }
  });
  it("API rows name the servers that carry them", () => {
    const acct = builtinApiRows().find((r) => r.slug === "stellar-account")!;
    expect(acct.servers.map((s) => s.slug).sort()).toEqual(["stellar-tools", "stellar-wallets"]);
  });
  it("API rows map every variable into the query template", () => {
    for (const r of builtinApiRows()) for (const v of r.variables) expect(r.query_params).toContain(`${v.name}={${v.name}}`);
  });
  it("MCP rows are public and built-in", () => {
    for (const r of builtinMcpRows()) expect(r).toMatchObject({ is_public: true, builtin: true, owner_address: null });
  });
  it("workflow rows number their steps", () => {
    for (const r of builtinWorkflowRows()) r.steps.forEach((s, i) => expect(s.id).toBe(`step${i + 1}`));
  });
  it.each(BUILTIN_MCPS.map((m) => [m.slug, m.tools.length + m.workflows.length]))("%s page shows %i tool cards", (slug, n) => {
    const row = builtinMcpRowsFull().find((r) => r.slug === slug)!;
    expect(row.cards).toHaveLength(n);
    expect(row.cards.every((c) => c.ask.length > 0 && c.description.length > 0)).toBe(true);
  });
  it("Stellar Tools exposes 14 tools", () => {
    expect(builtinMcpRowsFull().find((r) => r.slug === "stellar-tools")!.cards).toHaveLength(14);
  });
});
