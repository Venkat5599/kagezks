// Single source of truth for which Stellar network the agent backend talks to.
// Kage runs on Stellar mainnet. VEIL_NETWORK=testnet is only for local development.
import { Networks } from "@stellar/stellar-sdk";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type NetworkName = "mainnet" | "testnet";

export const NETWORK: NetworkName = process.env.VEIL_NETWORK === "testnet" ? "testnet" : "mainnet";

export const PASSPHRASE = NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

export const RPC_URL =
  process.env.VEIL_RPC_URL ?? (NETWORK === "mainnet" ? "https://mainnet.sorobanrpc.com" : "https://soroban-testnet.stellar.org");

export const HORIZON_URL =
  process.env.VEIL_HORIZON ?? (NETWORK === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");

// Pool + settlement-asset IDs for the active network (sdk/build/veil_deployment.<network>.json).
// Env overrides win so a redeploy never needs a code change.
export function deployment(): { contract_id: string; usdc_sac: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "build", `veil_deployment.${NETWORK}.json`);
  const dep = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { contract_id: string; usdc_sac: string }) : null;
  const contract_id = process.env.VEIL_CONTRACT ?? dep?.contract_id;
  const usdc_sac = process.env.VEIL_USDC ?? dep?.usdc_sac ?? (dep as { xlm_sac?: string } | null)?.xlm_sac;
  if (!contract_id || !usdc_sac) throw new Error(`missing Kage ${NETWORK} deployment (${file})`);
  return { contract_id, usdc_sac };
}
