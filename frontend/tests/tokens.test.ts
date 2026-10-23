import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { TOKENS, resolveToken, assetParams, assetId, describeOp, xlmFromStroops, CatalogError, type HorizonOp } from "@/lib/builtin-catalog";
import { USDC_MAIN, USDC_TEST, addr } from "./helpers/upstream";

const variants = (code: string) => [code, code.toLowerCase(), code.toUpperCase(), `  ${code}  `];

describe("official tokens resolve to their real issuers", () => {
  for (const net of ["mainnet", "testnet"] as const) {
    for (const t of TOKENS[net]) {
      it.each(variants(t.code))(`${net}: %j -> ${t.code}`, (input) => {
        expect(resolveToken(input, net)).toEqual(t);
      });
    }
  }
});

describe("issuer addresses are valid Stellar accounts", () => {
  const all = [...TOKENS.mainnet, ...TOKENS.testnet].filter((t) => t.issuer);
  it.each(all.map((t) => [t.code, t.org, t.issuer]))("%s (%s)", (_c, _o, issuer) => {
    expect(StrKey.isValidEd25519PublicKey(issuer as string)).toBe(true);
  });
  it("mainnet USDC is Circle's", () => expect(resolveToken("USDC", "mainnet").issuer).toBe(USDC_MAIN));
  it("testnet USDC is Circle's testnet issuer", () => expect(resolveToken("USDC", "testnet").issuer).toBe(USDC_TEST));
  it("each code appears once per network (no look-alikes)", () => {
    for (const net of ["mainnet", "testnet"] as const) {
      const codes = TOKENS[net].map((t) => t.code.toLowerCase());
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe("unknown tokens are refused, not guessed", () => {
  const unknown = ["USD", "BTC", "USDT", "XLMM", "US DC", "ETH"];
  for (const net of ["mainnet", "testnet"] as const) {
    it.each(unknown)(`${net}: %j`, (input) => {
      expect(() => resolveToken(input, net)).toThrow(CatalogError);
    });
  }
  it.each(["EURC", "AQUA", "yXLM"])("testnet has no official %s", (code) => {
    expect(() => resolveToken(code, "testnet")).toThrow(/unknown token/);
  });
  it("the error lists the tokens that do exist", () => {
    expect(() => resolveToken("DOGE", "mainnet")).toThrow(/XLM, USDC, EURC, AQUA, yXLM/);
  });
});

describe("CODE:ISSUER picks an exact token", () => {
  it.each(["USDC", "BENJI", "LONGTOKEN12", "A"])("%s:<issuer>", (code) => {
    const issuer = addr();
    expect(resolveToken(`${code}:${issuer}`, "mainnet")).toEqual({ code, issuer, org: "custom" });
  });
  it.each([
    "USDC:",
    ":GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "USDC:GBAD",
    `USDC:${Keypair.random().secret()}`,
    "USDC:CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV",
    "USDC:ga5zsejyb37jrc5avcia5mop4rhtm335x2kgx3ihojapp5re34k4kzvn",
    ":",
  ])("rejects %j", (input) => {
    expect(() => resolveToken(input, "mainnet")).toThrow(/CODE:G/);
  });
});

describe("Horizon asset parameters", () => {
  it("native", () => expect(assetParams("selling", { code: "XLM", issuer: null, org: "" })).toBe("selling_asset_type=native"));
  it.each([
    ["USDC", "credit_alphanum4"],
    ["A", "credit_alphanum4"],
    ["yXLM", "credit_alphanum4"],
    ["BENJI", "credit_alphanum12"],
    ["LONGTOKEN12", "credit_alphanum12"],
  ])("%s is %s", (code, type) => {
    const p = assetParams("source", { code, issuer: USDC_MAIN, org: "" });
    expect(p).toBe(`source_asset_type=${type}&source_asset_code=${code}&source_asset_issuer=${USDC_MAIN}`);
  });
  it("asset id: native", () => expect(assetId({ code: "XLM", issuer: null, org: "" })).toBe("native"));
  it("asset id: issued", () => expect(assetId({ code: "USDC", issuer: USDC_MAIN, org: "" })).toBe(`USDC:${USDC_MAIN}`));
});

describe("xlmFromStroops", () => {
  it.each([
    ["100", 0.00001],
    [100, 0.00001],
    ["10000000", 1],
    ["5000000", 0.5],
    ["0", 0],
    ["26954645", 2.6954645],
  ])("%j stroops = %d XLM", (s, x) => expect(xlmFromStroops(s)).toBe(x));
});

describe("describeOp turns Horizon operations into plain steps", () => {
  const A = addr();
  const B = addr();
  const base = { created_at: "", transaction_successful: true, transaction_hash: "" };
  it.each<[string, Partial<HorizonOp>, Record<string, unknown>]>([
    ["XLM payment", { type: "payment", from: A, to: B, amount: "10.5", asset_type: "native" }, { what: "payment", from: A, to: B, amount: 10.5, token: "XLM" }],
    ["USDC payment", { type: "payment", from: A, to: B, amount: "3", asset_type: "credit_alphanum4", asset_code: "USDC" }, { what: "payment", amount: 3, token: "USDC" }],
    ["new wallet", { type: "create_account", funder: A, account: B, starting_balance: "2" }, { what: "new wallet funded", from: A, to: B, amount: 2, token: "XLM" }],
    ["merge", { type: "account_merge", account: A, into: B }, { what: "wallet closed and merged", from: A, to: B, amount: null }],
    ["merge without account field", { type: "account_merge", source_account: A, into: B }, { from: A, to: B }],
    ["strict-send swap", { type: "path_payment_strict_send", from: A, to: B, amount: "9", asset_type: "native", source_asset_type: "credit_alphanum4", source_asset_code: "USDC" }, { what: "swap-payment (USDC → XLM)", amount: 9, token: "XLM" }],
    ["strict-receive swap", { type: "path_payment_strict_receive", from: A, to: B, amount: "1", asset_type: "credit_alphanum4", asset_code: "EURC", source_asset_type: "native" }, { what: "swap-payment (XLM → EURC)", token: "EURC" }],
    ["contract call", { type: "invoke_host_function", source_account: A }, { what: "smart contract call", from: A, to: null, amount: null }],
    ["anything else", { type: "change_trust", source_account: A }, { what: "change trust", from: A }],
  ])("%s", (_name, input, want) => {
    expect(describeOp({ ...base, ...input } as HorizonOp)).toMatchObject(want);
  });
});
