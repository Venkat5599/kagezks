// Per-agent scoping (step 4).
//
// The chain (SessionAccount.__check_auth) is the real trust anchor — it can't be
// tricked into over-cap or off-policy spend. Auth here is the *routing* layer: a
// bearer token identifies WHICH scoped session an agent acts through, so one MCP
// endpoint can serve many agents, each bound to its own SessionAccount (its own cap,
// expiry, and agent key). Present the wrong token → you get the wrong (or no) session
// and the deposit can't be signed. Present none → fall back to the process default.
//
// Token → scope map comes from env KAGE_AGENT_KEYS (JSON) or sdk/build/agent_keys.json:
//   { "sk_live_abc": { "label": "acme-bot", "sessionId": "C...", "agentSecret": "S...",
//                      "feeSourceSecret": "S..." } }
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentScope = {
  label: string;
  sessionId?: string; // the SessionAccount contract this agent spends through
  agentSecret?: string; // the delegated session key (S...) that signs the deposit
  feeSourceSecret?: string; // funded G-account that pays the tx fee + submits
};

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYFILE = join(HERE, "..", "..", "sdk", "build", "agent_keys.json");

let _map: Record<string, AgentScope> | null = null;
function keyMap(): Record<string, AgentScope> {
  if (_map) return _map;
  _map = {};
  try {
    if (process.env.KAGE_AGENT_KEYS) _map = JSON.parse(process.env.KAGE_AGENT_KEYS);
    else if (existsSync(KEYFILE)) _map = JSON.parse(readFileSync(KEYFILE, "utf8"));
  } catch (e) {
    console.error(`auth: could not parse agent key map — ${(e as Error).message}`);
  }
  return _map!;
}

// The default scope (no / unknown token) is READ-ONLY: no fee source, no session.
// This is deliberate — the fabric endpoint is public, so an anonymous caller must
// NOT be able to trigger an on-chain settlement (it would drain the default session
// cap to a caller-chosen scan key and burn relayer XLM). On-chain steps for this
// scope hit "no feeSourceSecret" and stop. Only a recognized bearer token (below)
// gets a session + the relayer fee source.
//
// For local single-agent dev, set KAGE_ALLOW_ANON_SETTLE=1 to restore the old
// behaviour where no-token calls settle through the env default session. NEVER set
// this on a publicly reachable deployment.
function defaultScope(): AgentScope {
  if (process.env.KAGE_ALLOW_ANON_SETTLE === "1") {
    return { label: "default-dev", feeSourceSecret: process.env.VEIL_FEE_SECRET };
  }
  return { label: "anonymous" }; // read-only: cannot sign or pay for an on-chain settle
}

export function resolveScope(bearer?: string): AgentScope {
  if (!bearer) return defaultScope();
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  const scope = keyMap()[token];
  if (!scope) return defaultScope();
  // Fee source is the funded relayer that pays tx fees + submits. Keep it OUT of the
  // committed keyfile: fall back to VEIL_FEE_SECRET env unless an agent brings its own.
  return { ...scope, feeSourceSecret: scope.feeSourceSecret || process.env.VEIL_FEE_SECRET };
}

// Thread the resolved scope through async tool execution without plumbing it
// through every function signature. The on-chain step reads it via currentScope().
const als = new AsyncLocalStorage<AgentScope>();

export function withScope<T>(scope: AgentScope, fn: () => Promise<T>): Promise<T> {
  return als.run(scope, fn);
}

export function currentScope(): AgentScope {
  return als.getStore() ?? defaultScope();
}
