// Single source of truth for the two Stellar networks the app can run against.
// Imported by both client components and API routes, so it holds only plain data.
import { Networks } from "@stellar/stellar-sdk";

export type NetworkName = "mainnet" | "testnet";

export type NetworkConfig = {
  name: NetworkName;
  label: string;
  passphrase: string;
  rpc: string;
  horizon: string;
  pool: string; // Kage shielded pool (native XLM)
  xlmSac: string; // native XLM Stellar Asset Contract
  explorer: string; // stellar.expert base for this network
  freighter: string; // what Freighter's getNetwork() reports for this network
  friendbot: string | null; // free test XLM (testnet only)
};

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  mainnet: {
    name: "mainnet",
    label: "Mainnet",
    passphrase: Networks.PUBLIC,
    rpc: "https://mainnet.sorobanrpc.com",
    horizon: "https://horizon.stellar.org",
    pool: "CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV",
    xlmSac: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    explorer: "https://stellar.expert/explorer/public",
    freighter: "PUBLIC",
    friendbot: null,
  },
  testnet: {
    name: "testnet",
    label: "Testnet",
    passphrase: Networks.TESTNET,
    rpc: "https://soroban-testnet.stellar.org",
    horizon: "https://horizon-testnet.stellar.org",
    pool: "CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC",
    xlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    explorer: "https://stellar.expert/explorer/testnet",
    freighter: "TESTNET",
    friendbot: "https://friendbot.stellar.org",
  },
};

// Case and spaces are ignored, so an AI agent typing "Testnet" gets testnet, not mainnet.
export const parseNetwork = (v: string | null | undefined): NetworkName => (v?.trim().toLowerCase() === "testnet" ? "testnet" : "mainnet");

/** Network for an API route: `?network=testnet`, anything else is mainnet. */
export const networkFromRequest = (req: Request): NetworkConfig =>
  NETWORKS[parseNetwork(new URL(req.url).searchParams.get("network"))];
