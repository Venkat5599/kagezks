"use client";

// Wallet identity for ownership scoping. Two wallets can live side by side: a
// browser-generated session wallet and a connected Freighter wallet. The user picks the
// active one; its address is the `owner_address` stamped on everything you create and
// used to filter "my" items. Removing a wallet only forgets it in this browser.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Keypair } from "@stellar/stellar-sdk";

export type WalletKind = "generated" | "freighter";

type WalletCtx = {
  // The ACTIVE wallet — what every page uses for ownership and signing.
  address: string | null;
  secret: string | null; // set only when the active wallet is the generated one
  real: boolean; // true = Freighter; false = generated
  connecting: boolean;
  // Both wallets can live side by side; the user picks which one is active.
  active: WalletKind | null;
  generated: string | null; // public key of the browser-generated wallet, if any
  freighter: string | null; // address of the connected Freighter wallet, if any
  connect: () => Promise<void>; // connect Freighter (keeps the generated wallet)
  generate: () => Promise<void>; // create a wallet — never overwrites an existing one
  select: (kind: WalletKind) => void; // switch the active wallet
  // Forget a wallet in THIS browser only. Nothing on chain changes; funds stay at the
  // address. Forgetting the generated wallet drops its key, so the UI must make the
  // user prove they saved it first.
  forget: (kind: WalletKind) => void;
  disconnect: () => void; // forget the active wallet
};
const Ctx = createContext<WalletCtx>({
  address: null,
  secret: null,
  real: false,
  connecting: false,
  active: null,
  generated: null,
  freighter: null,
  connect: async () => {},
  generate: async () => {},
  select: () => {},
  forget: () => {},
  disconnect: () => {},
});

const KEY = "kage_owner";
const SECKEY = "kage_owner_secret";
const REALKEY = "kage_owner_real";
// Per-wallet storage so a generated wallet and a Freighter wallet can coexist.
const GEN_PUB = "kage_gen_pub";
const GEN_SEC = "kage_gen_secret";
const FREIGHTER = "kage_freighter_addr";
const ACTIVE = "kage_active_wallet";

// Record the wallet against the onboarding table. Fire-and-forget on purpose:
// tracking must never block or fail a connect, so a dead endpoint or an offline
// DB is swallowed here rather than surfaced to the user.
function registerUser(address: string, walletKind: "freighter" | "generated") {
  fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      walletKind,
      referrer:
        typeof document !== "undefined" ? document.referrer || null : null,
    }),
  }).catch(() => {});
}

// Attach a real mainnet transaction to the connected wallet, so onboarding
// numbers stay backed by hashes anyone can check on stellar.expert.
export function recordTx(
  address: string,
  action: "deposit" | "withdraw" | "provision" | "agent_run",
  txHash?: string
) {
  fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, action, txHash: txHash ?? null }),
  }).catch(() => {});
}

type FreighterResult =
  | { ok: true; address: string; network: string | null }
  | { ok: false; reason: string };

// Legacy path: Freighter <=v5 injected `window.freighterApi` directly. Kept as a
// fallback for older extension builds that the official package won't talk to.
async function tryInjected(): Promise<string | null> {
  const fa = (
    window as unknown as {
      freighterApi?: Record<string, (...a: unknown[]) => Promise<unknown>>;
    }
  ).freighterApi;
  if (!fa) return null;
  try {
    for (const m of ["requestAccess", "getAddress", "getPublicKey"] as const) {
      if (!fa[m]) continue;
      const r = (await fa[m]()) as { address?: string } | string;
      const a = typeof r === "string" ? r : r?.address;
      if (a) return a;
    }
  } catch {
    /* caller decides what to tell the user */
  }
  return null;
}

// Connect through the official @stellar/freighter-api adapter. Freighter v6 stopped
// injecting `window.freighterApi` on every page and talks over an extension messaging
// bridge instead — probing the window object alone is why this reported "not detected"
// with the extension installed. Imported lazily so it never evaluates during SSR.
async function tryFreighter(): Promise<FreighterResult> {
  if (typeof window === "undefined")
    return {
      ok: false,
      reason: "Wallet connect is only available in the browser.",
    };

  let api: typeof import("@stellar/freighter-api");
  try {
    api = await import("@stellar/freighter-api");
  } catch {
    const legacy = await tryInjected();
    return legacy
      ? { ok: true, address: legacy, network: null }
      : { ok: false, reason: "Could not load the Freighter adapter." };
  }

  const conn = await api.isConnected().catch(() => null);
  if (!conn || conn.error || !conn.isConnected) {
    const legacy = await tryInjected();
    if (legacy) return { ok: true, address: legacy, network: null };
    return {
      ok: false,
      reason:
        "Freighter not detected. Install it from freighter.app, unlock the wallet, reload this page, then connect again — or use 'Generate Session Account Wallet' to continue without the extension.",
    };
  }

  // requestAccess() prompts on first use and returns the address once approved.
  const access = await api.requestAccess().catch(() => null);
  if (!access || access.error || !access.address) {
    return {
      ok: false,
      reason:
        "Freighter did not grant access. Approve the connection prompt (look for a pending Freighter popup) and try again.",
    };
  }

  const net = await api.getNetwork().catch(() => null);
  return {
    ok: true,
    address: access.address,
    network: net && !net.error ? net.network : null,
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [genPub, setGenPub] = useState<string | null>(null);
  const [genSec, setGenSec] = useState<string | null>(null);
  const [freighter, setFreighter] = useState<string | null>(null);
  const [active, setActive] = useState<WalletKind | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // One-time migration from the single-slot layout (kage_owner*), so a wallet created
    // before this change is never lost.
    const legacy = localStorage.getItem(KEY);
    if (legacy && !localStorage.getItem(ACTIVE)) {
      const legacySec = localStorage.getItem(SECKEY);
      if (localStorage.getItem(REALKEY) === "1") {
        localStorage.setItem(FREIGHTER, legacy);
        localStorage.setItem(ACTIVE, "freighter");
      } else if (legacySec) {
        localStorage.setItem(GEN_PUB, legacy);
        localStorage.setItem(GEN_SEC, legacySec);
        localStorage.setItem(ACTIVE, "generated");
      }
    }
    localStorage.removeItem(KEY);
    localStorage.removeItem(SECKEY);
    localStorage.removeItem(REALKEY);

    const gp = localStorage.getItem(GEN_PUB);
    const gs = localStorage.getItem(GEN_SEC);
    const fr = localStorage.getItem(FREIGHTER);
    const hasGen = !!(gp && gs);
    setGenPub(hasGen ? gp : null);
    setGenSec(hasGen ? gs : null);
    setFreighter(fr);
    const want = localStorage.getItem(ACTIVE) as WalletKind | null;
    const pick: WalletKind | null =
      want === "generated" && hasGen
        ? "generated"
        : want === "freighter" && fr
          ? "freighter"
          : hasGen
            ? "generated"
            : fr
              ? "freighter"
              : null;
    setActive(pick);
  }, []);

  const activate = (kind: WalletKind | null) => {
    setActive(kind);
    if (kind) localStorage.setItem(ACTIVE, kind);
    else localStorage.removeItem(ACTIVE);
  };

  // Connect an existing Freighter wallet (no key material leaves the extension).
  // The generated wallet, if any, is kept so the user can switch back to it.
  const connect = async () => {
    setConnecting(true);
    try {
      const res = await tryFreighter();
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      // Kage runs on Stellar mainnet; connecting a TESTNET account would sign
      // against contracts that don't exist there.
      if (res.network && res.network.toUpperCase() !== "PUBLIC") {
        alert(
          `Freighter is set to ${res.network}. Kage runs on Stellar MAINNET — switch Freighter to Mainnet (PUBLIC), then connect again.`
        );
        return;
      }
      setFreighter(res.address);
      localStorage.setItem(FREIGHTER, res.address);
      activate("freighter");
      registerUser(res.address, "freighter");
    } finally {
      setConnecting(false);
    }
  };

  // Generate a fresh Stellar wallet in the browser (the user funds it with XLM). If one
  // already exists we switch to it instead: replacing the key would strand its funds.
  const generate = async () => {
    if (genPub && genSec) {
      activate("generated");
      return;
    }
    setConnecting(true);
    try {
      const kp = Keypair.random();
      const pub = kp.publicKey();
      const sec = kp.secret();
      setGenPub(pub);
      setGenSec(sec);
      localStorage.setItem(GEN_PUB, pub);
      localStorage.setItem(GEN_SEC, sec);
      activate("generated");
      registerUser(pub, "generated");
    } finally {
      setConnecting(false);
    }
  };

  const select = (kind: WalletKind) => {
    if (kind === "generated" && genPub) activate("generated");
    if (kind === "freighter" && freighter) activate("freighter");
  };

  const forget = (kind: WalletKind) => {
    if (kind === "generated") {
      setGenPub(null);
      setGenSec(null);
      localStorage.removeItem(GEN_PUB);
      localStorage.removeItem(GEN_SEC);
      // The per-user session was provisioned by this wallet's key.
      localStorage.removeItem("kage_session_token");
      localStorage.removeItem("kage_session_id");
      if (active === "generated") activate(freighter ? "freighter" : null);
    } else {
      setFreighter(null);
      localStorage.removeItem(FREIGHTER);
      if (active === "freighter") activate(genPub ? "generated" : null);
    }
  };

  const disconnect = () => {
    if (active) forget(active);
  };

  const address =
    active === "generated" ? genPub : active === "freighter" ? freighter : null;
  const secret = active === "generated" ? genSec : null;

  return (
    <Ctx.Provider
      value={{
        address,
        secret,
        real: active === "freighter",
        connecting,
        active,
        generated: genPub,
        freighter,
        connect,
        generate,
        select,
        forget,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useWallet = () => useContext(Ctx);
