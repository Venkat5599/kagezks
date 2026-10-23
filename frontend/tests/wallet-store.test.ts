// The browser holds the only copy of a generated wallet's key. These rules make sure
// it is never overwritten or dropped, and is only forgotten after the user proves they saved it.
import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { KEYS, migrateLegacy, pickActive, loadWallets, saveGenerated, saveFreighter, forgetWallet, canForgetGenerated } from "@/lib/wallet-store";

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), dump: () => Object.fromEntries(m) };
};
const kp = () => Keypair.random();

describe("moving wallets from the old single-slot layout", () => {
  it("an old generated wallet keeps its key", () => {
    const k = kp();
    const s = memory({ [KEYS.legacyPub]: k.publicKey(), [KEYS.legacySecret]: k.secret() });
    migrateLegacy(s);
    expect(s.dump()).toEqual({ [KEYS.genPub]: k.publicKey(), [KEYS.genSecret]: k.secret(), [KEYS.active]: "generated" });
  });
  it("an old Freighter connection becomes the Freighter slot", () => {
    const a = kp().publicKey();
    const s = memory({ [KEYS.legacyPub]: a, [KEYS.legacyReal]: "1" });
    migrateLegacy(s);
    expect(s.dump()).toEqual({ [KEYS.freighter]: a, [KEYS.active]: "freighter" });
  });
  it("regression: an old key is NOT deleted when a newer layout is already active", () => {
    const old = kp();
    const s = memory({ [KEYS.legacyPub]: old.publicKey(), [KEYS.legacySecret]: old.secret(), [KEYS.active]: "freighter", [KEYS.freighter]: kp().publicKey() });
    migrateLegacy(s);
    expect(s.getItem(KEYS.legacySecret)).toBe(old.secret());
  });
  it("regression: an old key never overwrites an existing generated key", () => {
    const old = kp();
    const cur = kp();
    const s = memory({ [KEYS.legacyPub]: old.publicKey(), [KEYS.legacySecret]: old.secret(), [KEYS.genPub]: cur.publicKey(), [KEYS.genSecret]: cur.secret() });
    migrateLegacy(s);
    expect(s.getItem(KEYS.genSecret)).toBe(cur.secret());
    expect(s.getItem(KEYS.legacySecret)).toBe(old.secret());
  });
  it("an old address with no key and no Freighter flag has nothing to keep", () => {
    const s = memory({ [KEYS.legacyPub]: kp().publicKey() });
    migrateLegacy(s);
    expect(s.dump()).toEqual({});
  });
  it("running it twice changes nothing more", () => {
    const k = kp();
    const s = memory({ [KEYS.legacyPub]: k.publicKey(), [KEYS.legacySecret]: k.secret() });
    migrateLegacy(s);
    const once = s.dump();
    migrateLegacy(s);
    expect(s.dump()).toEqual(once);
  });
  it("a store with nothing in it stays empty", () => {
    const s = memory();
    migrateLegacy(s);
    expect(s.dump()).toEqual({});
  });
});

describe("which wallet is shown", () => {
  const wants = [null, "generated", "freighter", "garbage"];
  const cases = wants.flatMap((w) => [true, false].flatMap((g) => [true, false].map((f) => [w, g, f] as const)));
  it.each(cases)("last pick %j, generated=%s, freighter=%s", (want, g, f) => {
    const got = pickActive(want, g, f);
    if (want === "generated" && g) expect(got).toBe("generated");
    else if (want === "freighter" && f) expect(got).toBe("freighter");
    else expect(got).toBe(g ? "generated" : f ? "freighter" : null);
  });
});

describe("loading", () => {
  it("both wallets side by side", () => {
    const k = kp();
    const fr = kp().publicKey();
    const s = memory({ [KEYS.genPub]: k.publicKey(), [KEYS.genSecret]: k.secret(), [KEYS.freighter]: fr, [KEYS.active]: "freighter" });
    expect(loadWallets(s)).toEqual({ genPub: k.publicKey(), genSec: k.secret(), freighter: fr, active: "freighter" });
  });
  it("an address without its key is not a usable wallet", () => {
    const s = memory({ [KEYS.genPub]: kp().publicKey() });
    expect(loadWallets(s)).toEqual({ genPub: null, genSec: null, freighter: null, active: null });
  });
  it("migrates before loading", () => {
    const k = kp();
    const s = memory({ [KEYS.legacyPub]: k.publicKey(), [KEYS.legacySecret]: k.secret() });
    expect(loadWallets(s)).toMatchObject({ genPub: k.publicKey(), active: "generated" });
  });
});

describe("saving", () => {
  it("a new generated wallet is stored and shown", () => {
    const s = memory();
    const k = kp();
    expect(saveGenerated(s, k.publicKey(), k.secret())).toBe(true);
    expect(loadWallets(s)).toMatchObject({ genPub: k.publicKey(), genSec: k.secret(), active: "generated" });
  });
  it("a second generated wallet is refused and the first key is kept", () => {
    const s = memory();
    const first = kp();
    saveGenerated(s, first.publicKey(), first.secret());
    expect(saveGenerated(s, kp().publicKey(), kp().secret())).toBe(false);
    expect(s.getItem(KEYS.genSecret)).toBe(first.secret());
  });
  it("connecting Freighter keeps the generated wallet", () => {
    const s = memory();
    const k = kp();
    saveGenerated(s, k.publicKey(), k.secret());
    saveFreighter(s, kp().publicKey());
    expect(loadWallets(s)).toMatchObject({ genSec: k.secret(), active: "freighter" });
  });
});

describe("forgetting a wallet in this browser", () => {
  const both = () => {
    const k = kp();
    const fr = kp().publicKey();
    const s = memory({ [KEYS.genPub]: k.publicKey(), [KEYS.genSecret]: k.secret(), [KEYS.freighter]: fr, [KEYS.sessionToken]: "t", [KEYS.sessionId]: "i" });
    return { s, k, fr };
  };
  it("forgetting the active generated wallet switches to Freighter and drops its agent session", () => {
    const { s, fr } = both();
    const next = forgetWallet(s, "generated", { ...loadWallets(s), active: "generated" });
    expect(next).toMatchObject({ genPub: null, genSec: null, freighter: fr, active: "freighter" });
    expect([s.getItem(KEYS.genSecret), s.getItem(KEYS.sessionToken), s.getItem(KEYS.sessionId)]).toEqual([null, null, null]);
    expect(s.getItem(KEYS.active)).toBe("freighter");
  });
  it("forgetting the only wallet leaves none active", () => {
    const s = memory();
    const k = kp();
    saveGenerated(s, k.publicKey(), k.secret());
    expect(forgetWallet(s, "generated", loadWallets(s)).active).toBeNull();
    expect(s.getItem(KEYS.active)).toBeNull();
  });
  it("disconnecting Freighter switches back to the generated wallet and keeps its key", () => {
    const { s, k } = both();
    const next = forgetWallet(s, "freighter", { ...loadWallets(s), active: "freighter" });
    expect(next).toMatchObject({ freighter: null, active: "generated" });
    expect(s.getItem(KEYS.genSecret)).toBe(k.secret());
  });
  it("forgetting the wallet that isn't shown leaves the shown one alone", () => {
    const { s } = both();
    expect(forgetWallet(s, "freighter", { ...loadWallets(s), active: "generated" }).active).toBe("generated");
  });
  it("disconnecting Freighter never touches the agent session", () => {
    const { s } = both();
    forgetWallet(s, "freighter", loadWallets(s));
    expect(s.getItem(KEYS.sessionToken)).toBe("t");
  });
});

describe("proof before forgetting the generated key", () => {
  // A fresh key every run: no secret key is ever written into the repo.
  const SECRET = kp().secret();
  const last4 = SECRET.slice(-4);
  const other = (c: string) => (c === "A" ? "B" : "A");
  it.each([
    ["exact", last4, true],
    ["lower case", last4.toLowerCase(), true],
    ["with spaces", `  ${last4} `, true],
    ["last character wrong", last4.slice(0, 3) + other(last4[3]!), false],
    ["first character wrong", other(last4[0]!) + last4.slice(1), false],
    ["only 3", last4.slice(1), false],
    ["5 characters", SECRET.slice(-5), false],
    ["empty", "", false],
    ["the whole key", SECRET, false],
  ])("%s -> %s", (_n, typed, want) => expect(canForgetGenerated(SECRET, typed)).toBe(want));
  it("no key means nothing to confirm", () => expect(canForgetGenerated(null, "")).toBe(false));
  it("a too-short key can't be confirmed", () => expect(canForgetGenerated("ABC", "ABC")).toBe(false));
  it.each(Array.from({ length: 8 }, () => kp().secret()))("works for a real key %#", (secret) => {
    expect(canForgetGenerated(secret, secret.slice(-4))).toBe(true);
    expect(canForgetGenerated(secret, secret.slice(-5, -1))).toBe(secret.slice(-5, -1) === secret.slice(-4));
  });
});
