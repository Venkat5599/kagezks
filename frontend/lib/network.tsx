"use client";

// The active Stellar network for the whole app. One click flips it; the choice is
// remembered per browser. Every network-dependent fetch passes `?network=` so API
// routes read the same chain the user is looking at.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { NETWORKS, parseNetwork, type NetworkConfig, type NetworkName } from "./networks";

const KEY = "kage_network";

type NetworkCtx = { network: NetworkName; net: NetworkConfig; setNetwork: (n: NetworkName) => void; toggle: () => void };

const Ctx = createContext<NetworkCtx>({
  network: "mainnet",
  net: NETWORKS.mainnet,
  setNetwork: () => {},
  toggle: () => {},
});

// localStorage-backed store: same value in every tab, server render defaults to mainnet.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const read = (): NetworkName => parseNetwork(localStorage.getItem(KEY));

export function NetworkProvider({ children }: { children: ReactNode }) {
  const network = useSyncExternalStore(subscribe, read, () => "mainnet" as NetworkName);

  const setNetwork = (n: NetworkName) => {
    localStorage.setItem(KEY, n);
    listeners.forEach((l) => l());
  };

  return (
    <Ctx.Provider value={{ network, net: NETWORKS[network], setNetwork, toggle: () => setNetwork(network === "mainnet" ? "testnet" : "mainnet") }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNetwork = () => useContext(Ctx);
