// Template resolution for the workflow engine.
//
// Steps reference earlier results and the run's inputs with `{{ ... }}`:
//   {{input.amount}}                 — a workflow input variable
//   {{steps.trend.body.0.symbol}}    — a field from an earlier step's output
//
// A string that is EXACTLY one template (`"{{steps.x.body}}"`) resolves to the raw
// value (object/number preserved); a string with surrounding text interpolates to
// a string. Nested objects/arrays are resolved recursively. Missing paths throw —
// a workflow that references a value that isn't there should fail loudly, not settle
// on-chain with `undefined`.

export type RunCtx = { input: Record<string, unknown>; steps: Record<string, { output: unknown }> };

const ONLY = /^\{\{\s*([^}]+?)\s*\}\}$/;
const ANY = /\{\{\s*([^}]+?)\s*\}\}/g;

function dig(ctx: RunCtx, path: string): unknown {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null) throw new Error(`resolve: '${path}' hit null at '${p}'`);
    if (Array.isArray(cur)) cur = cur[Number(p)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else throw new Error(`resolve: '${path}' cannot index into ${typeof cur}`);
  }
  if (cur === undefined) throw new Error(`resolve: '${path}' is undefined`);
  return cur;
}

export function resolve<T>(value: T, ctx: RunCtx): T {
  if (typeof value === "string") {
    const only = value.match(ONLY);
    if (only) return dig(ctx, only[1]!) as T;
    return value.replace(ANY, (_, path: string) => {
      const v = dig(ctx, path.trim());
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx);
    return out as T;
  }
  return value;
}
