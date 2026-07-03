// Workflow engine — runs a WorkflowRow's steps in order, threading each step's
// output into a shared context so later steps reference earlier results with
// `{{steps.<id>.output...}}` / `{{input.<var>}}`. A `condition` that fails halts
// the run cleanly (completed:false); any step error stops with completed:false too.
//
// The flagship shape: [condition budget>=amount] → [onchain veil_pay] → done, but
// the engine is fully general — chain a paid `http` API call, feed its body into the
// amount, then settle privately on-chain, all declaratively.
import type { WorkflowRow, WfStep } from "./catalog.ts";
import { resolve, type RunCtx } from "./resolver.ts";
import { runStep, type StepResult } from "./steps.ts";

export type WorkflowRun = {
  workflow: string;
  completed: boolean;
  steps: StepResult[];
  output?: Record<string, unknown>;
};

// Build the { key: value } output object from output_mapping entries of the form
// { name, from } where `from` is a template resolved against the final context.
function mapOutput(wf: WorkflowRow, ctx: RunCtx): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of (wf.output_mapping ?? []) as { name?: string; from?: string }[]) {
    if (!m?.name || m.from == null) continue;
    try {
      out[m.name] = resolve(m.from, ctx);
    } catch {
      out[m.name] = null;
    }
  }
  return out;
}

export async function runWorkflow(wf: WorkflowRow, input: Record<string, unknown>): Promise<WorkflowRun> {
  const ctx: RunCtx = { input, steps: {} };
  const results: StepResult[] = [];

  for (const raw of wf.steps ?? []) {
    let step: WfStep;
    try {
      step = resolve(raw, ctx); // interpolate templates against ctx before running
    } catch (e) {
      results.push({ id: (raw as { id?: string }).id ?? "?", kind: (raw as WfStep).kind ?? "?", status: "error", detail: (e as Error).message });
      return { workflow: wf.slug ?? wf.name, completed: false, steps: results };
    }

    const res = await runStep(step, wf);
    results.push(res);
    ctx.steps[res.id] = { output: res.output };

    if (res.status === "error") return { workflow: wf.slug ?? wf.name, completed: false, steps: results };
    if (res.halt) return { workflow: wf.slug ?? wf.name, completed: false, steps: results };
  }

  return { workflow: wf.slug ?? wf.name, completed: true, steps: results, output: mapOutput(wf, ctx) };
}
