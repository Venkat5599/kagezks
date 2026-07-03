"use client";

// Lightweight wallet identity for ownership scoping. Connects Freighter when present
// (real Stellar address); otherwise falls back to a stable per-browser demo identity so
// per-user isolation still works in a demo without the extension installed. The address
// is the `owner_address` stamped on everything you create and used to filter "my" items.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
const Ctx = createContext<WalletCtx>({ address: null, secret: null, real: false, connecting: false, connect: async () => {}, generate: async () => {}, disconnect: () => {} });

const KEY = "kage_owner";
const SECKEY = "kage_owner_secret";
const REALKEY = "kage_owner_real";

// Try Freighter's injected API across its version variants.
async function tryFreighter(): Promise<string | null> {
  const fa = (typeof window !== "undefined" ? (window as unknown as { freighterApi?: Record<string, (...a: unknown[]) => Promise<unknown>> }).freighterApi : undefined);
  if (!fa) return null;
  try {
    if (fa.requestAccess) {
      const r = (await fa.requestAccess()) as { address?: string } | string;
      const a = typeof r === "string" ? r : r?.address;
      if (a) return a;
    }
    if (fa.getAddress) {
      const r = (await fa.getAddress()) as { address?: string } | string;
      const a = typeof r === "string" ? r : r?.address;
      if (a) return a;
    }
    if (fa.getPublicKey) {
      const a = (await fa.getPublicKey()) as string;
      if (a) return a;
    }
  } catch { /* fall through to demo identity */ }
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [real, setReal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) { setAddress(saved); setReal(localStorage.getItem(REALKEY) === "1"); setSecret(localStorage.getItem(SECKEY)); }
  }, []);

  // Connect an existing Freighter wallet (no key material leaves the extension).
  const connect = async () => {
    setConnecting(true);
    try {
      const fa = await tryFreighter();
      if (!fa) { alert("Freighter not detected. Use 'Generate Session Account Wallet' instead."); return; }
      setAddress(fa); setReal(true); setSecret(null);
      localStorage.setItem(KEY, fa); localStorage.setItem(REALKEY, "1"); localStorage.removeItem(SECKEY);
    } finally { setConnecting(false); }
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
      setAddress(pub); setSecret(sec); setReal(false);
      localStorage.setItem(KEY, pub); localStorage.setItem(SECKEY, sec); localStorage.setItem(REALKEY, "0");
      // fire-and-forget testnet funding
      fetch(`https://friendbot.stellar.org/?addr=${pub}`).catch(() => {});
    } finally { setConnecting(false); }
  };

  const disconnect = () => {
    setAddress(null); setSecret(null); setReal(false);
    localStorage.removeItem(KEY); localStorage.removeItem(SECKEY); localStorage.removeItem(REALKEY);
  };

  return <Ctx.Provider value={{ address, secret, real, connecting, connect, generate, disconnect }}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
