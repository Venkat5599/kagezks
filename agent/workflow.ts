// Declarative, reusable, agent-readable workflows over the Veil engine.
//
// A workflow is an ordered list of steps — each a `condition`, an `onchain`
// action, or a `read`. The flagship `pay-if-budget` mirrors agent_fabric's
// compositions, but the on-chain step is the **ZK-private deposit** through the
// scoped SessionAccount. Workflows are exposed as MCP tools (workflow_list /
// workflow_run) so an LLM agent can run a whole flow with one call.
import { poolStatus, remainingBudget, payThroughSession } from "../sdk/veil-onchain.ts";

export type StepResult = {
  step: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
  data?: unknown;
};

export type WorkflowRun = {
  workflow: string;
  completed: boolean;
  steps: StepResult[];
  result?: unknown;
};

export type PayIfBudgetInput = {
  recipientScanKey: string;
  amount: string | bigint;
  feeSourceSecret: string;
  sessionId?: string;
  agentSecret?: string;
};

export const WORKFLOWS = [
  {
    name: "pay-if-budget",
    description:
      "Check the agent's remaining scoped budget; if it covers the amount, make a ZK-private payment through the SessionAccount, then confirm the pool advanced.",
    inputs: ["recipientScanKey", "amount", "feeSourceSecret", "sessionId?", "agentSecret?"],
  },
] as const;

export function listWorkflows() {
  return WORKFLOWS;
}

// pay-if-budget: budget-gate → ZK deposit → confirm.
export async function payIfBudget(input: PayIfBudgetInput): Promise<WorkflowRun> {
  const steps: StepResult[] = [];
  const amount = BigInt(input.amount);

  // 1. read budget
  let budget: bigint;
  try {
    budget = await remainingBudget(input.sessionId);
    steps.push({ step: "veil_budget", status: "ok", detail: `${budget} remaining`, data: budget.toString() });
  } catch (e) {
    steps.push({ step: "veil_budget", status: "error", detail: String((e as Error).message) });
    return { workflow: "pay-if-budget", completed: false, steps };
  }

  // 2. condition: budget covers amount?
  if (budget < amount) {
    steps.push({
      step: "condition:budget>=amount",
      status: "skipped",
      detail: `budget ${budget} < amount ${amount} — not paying`,
    });
    return { workflow: "pay-if-budget", completed: false, steps };
  }
  steps.push({ step: "condition:budget>=amount", status: "ok", detail: `${budget} >= ${amount}` });

  // 3. onchain: the agent's ZK-private payment through the SessionAccount
  let pay;
  try {
    pay = await payThroughSession({
      recipientScanKey: input.recipientScanKey,
      amount,
      feeSourceSecret: input.feeSourceSecret,
      sessionId: input.sessionId,
      agentSecret: input.agentSecret,
      onStep: (s) => steps.push({ step: `veil_pay:${s}`, status: "ok" }),
    });
    steps.push({ step: "veil_pay", status: "ok", detail: `tx ${pay.hash}`, data: { hash: pay.hash, commitment: pay.commitment, leafIndex: pay.leafIndex } });
  } catch (e) {
    steps.push({ step: "veil_pay", status: "error", detail: String((e as Error).message) });
    return { workflow: "pay-if-budget", completed: false, steps };
  }

  // 4. confirm
  try {
    const status = await poolStatus();
    steps.push({ step: "veil_pool_status", status: "ok", detail: `leafCount ${status.leafCount}`, data: status });
  } catch (e) {
    steps.push({ step: "veil_pool_status", status: "error", detail: String((e as Error).message) });
  }

  return {
    workflow: "pay-if-budget",
    completed: true,
    steps,
    result: { hash: pay.hash, commitment: pay.commitment, ephemeralPub: pay.ephemeralPub, leafIndex: pay.leafIndex },
  };
}

export async function runWorkflow(name: string, input: PayIfBudgetInput): Promise<WorkflowRun> {
  if (name === "pay-if-budget") return payIfBudget(input);
  return { workflow: name, completed: false, steps: [{ step: "resolve", status: "error", detail: `unknown workflow: ${name}` }] };
}
