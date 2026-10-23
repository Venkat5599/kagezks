import { describe, it, expect } from "vitest";
import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import { NETWORKS, parseNetwork, networkFromRequest } from "@/lib/networks";

describe("parseNetwork", () => {
  it.each([
    ["testnet", "testnet"],
    ["Testnet", "testnet"],
    ["TESTNET", "testnet"],
    [" testnet ", "testnet"],
    ["mainnet", "mainnet"],
    ["Mainnet", "mainnet"],
    ["public", "mainnet"],
    ["", "mainnet"],
    [null, "mainnet"],
    [undefined, "mainnet"],
    ["futurenet", "mainnet"],
    ["test", "mainnet"],
  ])("%j -> %s (anything that is not testnet is mainnet)", (input, want) => {
    expect(parseNetwork(input as string | null | undefined)).toBe(want);
  });
});

describe("networkFromRequest", () => {
  it.each([
    ["https://kageai.me/api/stats?network=testnet", "testnet"],
    ["https://kageai.me/api/stats?network=mainnet", "mainnet"],
    ["https://kageai.me/api/stats", "mainnet"],
    ["https://kageai.me/api/stats?network=TESTNET&x=1", "testnet"],
  ])("%s -> %s", (url, want) => {
    expect(networkFromRequest(new Request(url)).name).toBe(want);
  });
});

describe.each(Object.values(NETWORKS))("$name config", (net) => {
  it("pool is a valid contract address", () => expect(StrKey.isValidContract(net.pool)).toBe(true));
  it("XLM contract is the real native-asset contract for this network", () => {
    expect(net.xlmSac).toBe(Asset.native().contractId(net.passphrase));
  });
  it("passphrase is Stellar's official one", () => {
    expect(net.passphrase).toBe(net.name === "mainnet" ? Networks.PUBLIC : Networks.TESTNET);
  });
  it("Horizon and RPC are https", () => {
    expect(net.horizon).toMatch(/^https:\/\//);
    expect(net.rpc).toMatch(/^https:\/\//);
  });
  it("explorer points at the matching stellar.expert network", () => {
    expect(net.explorer).toBe(`https://stellar.expert/explorer/${net.name === "mainnet" ? "public" : "testnet"}`);
  });
  it("Freighter label matches what Freighter reports", () => {
    expect(net.freighter).toBe(net.name === "mainnet" ? "PUBLIC" : "TESTNET");
  });
  it("free test XLM only exists on testnet", () => {
    if (net.name === "mainnet") expect(net.friendbot).toBeNull();
    else expect(net.friendbot).toMatch(/^https:\/\/friendbot/);
  });
});

it("mainnet and testnet never share a contract", () => {
  expect(NETWORKS.mainnet.pool).not.toBe(NETWORKS.testnet.pool);
  expect(NETWORKS.mainnet.xlmSac).not.toBe(NETWORKS.testnet.xlmSac);
});
