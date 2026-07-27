"use client";

// Lightweight wallet identity for ownership scoping. Connects Freighter when present
// (real Stellar address); otherwise falls back to a stable per-browser demo identity so
// per-user isolation still works in a demo without the extension installed. The address
// is the `owner_address` stamped on everything you create and used to filter "my" items.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Keypair } from "@stellar/stellar-sdk";

type WalletCtx = {
  address: string | null;
  secret: string | null; // set only for a wallet we generated (shown once to import)
  real: boolean; // true = Freighter; false = generated/demo
  connecting: boolean;
  connect: () => Promise<void>; // Freighter
  generate: () => Promise<void>; // create a fresh Stellar wallet + friendbot fund
  disconnect: () => void;
};
const Ctx = createContext<WalletCtx>({
  address: null,
  secret: null,
  real: false,
  connecting: false,
  connect: async () => {},
  generate: async () => {},
  disconnect: () => {},
});

const KEY = "kage_owner";
const SECKEY = "kage_owner_secret";
const REALKEY = "kage_owner_real";

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

// Attach a real testnet transaction to the connected wallet, so onboarding
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
  const [address, setAddress] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [real, setReal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      setAddress(saved);
      setReal(localStorage.getItem(REALKEY) === "1");
      setSecret(localStorage.getItem(SECKEY));
    }
  }, []);

  // Connect an existing Freighter wallet (no key material leaves the extension).
  const connect = async () => {
    setConnecting(true);
    try {
      const res = await tryFreighter();
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      // Kage is testnet-only; connecting a PUBLIC-network account would sign
      // against contracts that don't exist there.
      if (res.network && res.network.toUpperCase() !== "TESTNET") {
        alert(
          `Freighter is set to ${res.network}. Kage runs on Stellar TESTNET — switch the network in Freighter, then connect again.`
        );
        return;
      }
      setAddress(res.address);
      setReal(true);
      setSecret(null);
      localStorage.setItem(KEY, res.address);
      localStorage.setItem(REALKEY, "1");
      localStorage.removeItem(SECKEY);
      registerUser(res.address, "freighter");
    } finally {
      setConnecting(false);
    }
  };

  // Generate a fresh Stellar wallet in the browser and fund it via friendbot. The secret
  // is shown once for the user to import into their wallet app (mirrors the smart-account
  // wallet-generation flow). Each user gets a distinct address = distinct owner identity.
  const generate = async () => {
    setConnecting(true);
    try {
      const kp = Keypair.random();
      const pub = kp.publicKey();
      const sec = kp.secret();
      setAddress(pub);
      setSecret(sec);
      setReal(false);
      localStorage.setItem(KEY, pub);
      localStorage.setItem(SECKEY, sec);
      localStorage.setItem(REALKEY, "0");
      registerUser(pub, "generated");
      // fire-and-forget testnet funding
      fetch(`https://friendbot.stellar.org/?addr=${pub}`).catch(() => {});
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setSecret(null);
    setReal(false);
    localStorage.removeItem(KEY);
    localStorage.removeItem(SECKEY);
    localStorage.removeItem(REALKEY);
  };

  return (
    <Ctx.Provider
      value={{
        address,
        secret,
        real,
        connecting,
        connect,
        generate,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useWallet = () => useContext(Ctx);
