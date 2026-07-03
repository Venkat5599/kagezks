"use client";

// Lightweight wallet identity for ownership scoping. Connects Freighter when present
// (real Stellar address); otherwise falls back to a stable per-browser demo identity so
// per-user isolation still works in a demo without the extension installed. The address
// is the `owner_address` stamped on everything you create and used to filter "my" items.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Keypair } from "@stellar/stellar-sdk";

type WalletCtx = { address: string | null; real: boolean; connecting: boolean; connect: () => Promise<void>; disconnect: () => void };
const Ctx = createContext<WalletCtx>({ address: null, real: false, connecting: false, connect: async () => {}, disconnect: () => {} });

const KEY = "kage_owner";
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
  const [real, setReal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) { setAddress(saved); setReal(localStorage.getItem(REALKEY) === "1"); }
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const fa = await tryFreighter();
      if (fa) { setAddress(fa); setReal(true); localStorage.setItem(KEY, fa); localStorage.setItem(REALKEY, "1"); return; }
      // demo identity — stable per browser
      let demo = localStorage.getItem(KEY);
      if (!demo) demo = Keypair.random().publicKey();
      setAddress(demo); setReal(false); localStorage.setItem(KEY, demo); localStorage.setItem(REALKEY, "0");
    } finally { setConnecting(false); }
  };

  const disconnect = () => { setAddress(null); setReal(false); localStorage.removeItem(KEY); localStorage.removeItem(REALKEY); };

  return <Ctx.Provider value={{ address, real, connecting, connect, disconnect }}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
