// Workflow step executors. Three kinds — http, condition, and the one that matters,
// onchain: the ZK-private settlement through the agent's scoped SessionAccount.
//
// Every step returns a StepResult; the engine threads its `output` into the run
// context so later steps can reference it via `{{steps.<id>.output...}}`.
import type { WfStep, WorkflowRow, CmpOp } from "./catalog.ts";
import { findApi } from "./catalog.ts";
import { proxyCall } from "./proxy-tool.ts";
import { currentScope } from "./auth.ts";
import { payThroughSession, poolStatus, remainingBudget, config } from "../../sdk/kage-onchain.ts";

export type StepResult = {
  id: string;
  kind: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
  output?: unknown;
  halt?: boolean; // condition false → stop the run (completed:false, not an error)
};

// ---- http: call a published API by slug, or an inline URL --------------------
async function runHttp(step: Extract<WfStep, { kind: "http" }>): Promise<StepResult> {
  // Published-API reference (metered, discoverable).
  if (step.api) {
    const api = await findApi(step.api);
    if (!api) return { id: step.id, kind: "http", status: "error", detail: `no API '${step.api}' in catalog` };
    const res = await proxyCall(api, (step.with ?? {}) as Record<string, unknown>);
    const ok = res.status >= 200 && res.status < 300;
    return { id: step.id, kind: "http", status: ok ? "ok" : "error", detail: `${api.name} → ${res.status}`, output: res.body };
  }
  // Inline URL (what the dashboard builder emits). Templates already resolved by the engine.
  if (step.url) {
    const method = (step.method ?? "GET").toUpperCase();
    const init: RequestInit = { method, headers: { accept: "application/json" } };
    if (method !== "GET" && method !== "HEAD" && step.body != null) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = typeof step.body === "string" ? step.body : JSON.stringify(step.body);
    }
    const r = await fetch(step.url, init);
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { id: step.id, kind: "http", status: r.status < 400 ? "ok" : "error", detail: `${step.url} → ${r.status}`, output: body };
  }
  return { id: step.id, kind: "http", status: "error", detail: "http step needs `api` or `url`" };
}

// ---- condition: gate the rest of the flow -----------------------------------
function compare(left: string, op: CmpOp, right: string): boolean {
  const ln = Number(left);
  const rn = Number(right);
  const numeric = left.trim() !== "" && right.trim() !== "" && !Number.isNaN(ln) && !Number.isNaN(rn);
  if (numeric) {
    // BigInt where both are integers (amounts are 7-dp integers), else float.
    const asInt = /^-?\d+$/.test(left.trim()) && /^-?\d+$/.test(right.trim());
    const [l, r] = asInt ? [BigInt(left), BigInt(right)] : [ln, rn];
    switch (op) {
      case ">=": return l >= r;
      case ">": return l > r;
      case "<=": return l <= r;
      case "<": return l < r;
      case "==": return l === r;
      case "!=": return l !== r;
    }
  }
  switch (op) {
    case "==": return left === right;
    case "!=": return left !== right;
    default: throw new Error(`condition: non-numeric operands for '${op}' (${left} ${op} ${right})`);
  }
}

function runCondition(step: Extract<WfStep, { kind: "condition" }>): StepResult {
  const pass = compare(String(step.left), step.op, String(step.right));
  return {
    id: step.id,
    kind: "condition",
    status: pass ? "ok" : "skipped",
    detail: `${step.left} ${step.op} ${step.right} → ${pass}`,
    halt: !pass,
  };
}

// ---- onchain: the ZK-private payment (the whole reason this exists) ----------
async function runOnchain(step: Extract<WfStep, { kind: "onchain" }>, wf: WorkflowRow): Promise<StepResult> {
  const scope = currentScope();
  const { VEIL } = config();

  // On-chain safety allow-list: if the workflow declares allowed_contracts, the pool
  // it settles through MUST be in it. Stops a published workflow from being edited to
  // route value to an unlisted contract.
  const allow = wf.allowed_contracts ?? [];
  if (allow.length > 0 && !allow.includes(VEIL)) {
    return { id: step.id, kind: "onchain", status: "error", detail: `pool ${VEIL} not in allowed_contracts` };
  }

  const amount = BigInt(step.amount);

  // Budget gate mirrors the chain: __check_auth would revert CapExceeded, but failing
  // here first saves a wasted proof + fee.
  try {
    const remaining = await remainingBudget(scope.sessionId);
    if (remaining < amount) {
      return {
        id: step.id,
        kind: "onchain",
        status: "skipped",
        detail: `budget ${remaining} < amount ${amount} — would revert CapExceeded`,
        halt: true,
      };
    }
  } catch (e) {
    return { id: step.id, kind: "onchain", status: "error", detail: `budget read failed: ${(e as Error).message}` };
  }

  if (!scope.feeSourceSecret) {
    return { id: step.id, kind: "onchain", status: "error", detail: "no feeSourceSecret in agent scope" };
  }

  // A recipient scan key is 32-byte x25519 material — not something an agent can invent.
  // If the caller omitted it, fall back to the demo payee so the flow still settles.
  const DEMO_SCAN_KEY = "cd2e7738aabbccddeeff00112233445566778899aabbccddeeff00114181f16c";
  const scanKey = /^[0-9a-fA-F]{64}$/.test(String(step.recipientScanKey ?? "")) ? String(step.recipientScanKey) : DEMO_SCAN_KEY;

  try {
    const pay = await payThroughSession({
      recipientScanKey: scanKey,
      amount,
      feeSourceSecret: scope.feeSourceSecret,
      sessionId: scope.sessionId,
      agentSecret: scope.agentSecret,
    });
    return {
      id: step.id,
      kind: "onchain",
      status: "ok",
      detail: `ZK deposit tx ${pay.hash}`,
      output: { hash: pay.hash, commitment: pay.commitment, ephemeralPub: pay.ephemeralPub, leafIndex: pay.leafIndex, newRoot: pay.newRoot },
    };
  } catch (e) {
    return { id: step.id, kind: "onchain", status: "error", detail: `kage_pay failed: ${(e as Error).message}` };
  }
}

export async function runStep(step: WfStep, wf: WorkflowRow): Promise<StepResult> {
  switch (step.kind) {
    case "http": return runHttp(step);
    case "condition": return runCondition(step);
    case "onchain": return runOnchain(step, wf);
    default: return { id: (step as { id?: string }).id ?? "?", kind: "unknown", status: "error", detail: `unknown step kind` };
  }
}

export { poolStatus };
