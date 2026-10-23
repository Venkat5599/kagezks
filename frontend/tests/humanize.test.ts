// Labels on the "readable answer" panel: raw JSON keys become plain words.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/network", () => ({ useNetwork: () => ({ net: { name: "mainnet" } }) }));
import { humanize, initialValues } from "@/components/fabric/api-page";

describe("humanize", () => {
  it.each([
    ["spendableXlm", "Spendable XLM"],
    ["mustKeepXlm", "Must keep XLM"],
    ["feePaidXlm", "Fee paid XLM"],
    ["xlmInPool", "XLM in pool"],
    ["walletsHolding", "Wallets holding"],
    ["issuerCanClawBack", "Issuer can claw back"],
    ["totalUsd", "Total (USD)"],
    ["usdc_pooled", "USDC pooled"],
    ["latestBlock", "Latest block"],
    ["closedSecondsAgo", "Closed seconds ago"],
    ["network", "Network"],
    ["USDC", "USDC"],
    ["EURC", "EURC"],
    ["XLM", "XLM"],
    ["AQUA", "AQUA"],
    ["viewOnExplorer", "View on explorer"],
    ["capacityUsedPct", "Capacity used (%)"],
  ])("%s -> %s", (k, want) => expect(humanize(k)).toBe(want));
});

describe("initialValues", () => {
  const vars = [
    { name: "address", in: "query" as const, required: true },
    { name: "limit", in: "query" as const, required: false },
    { name: "network", in: "query" as const, required: false },
  ];
  it("fills the example and takes the network from the switch", () => {
    expect(initialValues(vars as never, { address: "GABC", limit: "5", network: "mainnet" }, "testnet")).toEqual({ address: "GABC", limit: "5", network: "testnet" });
  });
  it("leaves unknown fields empty", () => {
    expect(initialValues(vars as never, undefined, "mainnet")).toEqual({ address: "", limit: "", network: "mainnet" });
  });
});
