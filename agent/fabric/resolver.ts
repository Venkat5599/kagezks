// Template resolution for the workflow engine.
//
// Two interchangeable syntaxes are supported so the same engine runs both Kage-native
// and AgentFabric-style workflows:
//   {{input.amount}}            ·  $.input.amount              — a workflow input
//   {{steps.swap.output.hash}}  ·  $.steps.swap.output.hash    — an earlier step's output
//
// A string that is EXACTLY one expression resolves to the raw value (object/number
// preserved); a string with surrounding text interpolates to a string. Nested
// objects/arrays are resolved recursively. Missing paths throw — a workflow that
// references a value that isn't there should fail loudly, not settle on-chain with
// `undefined`.

export type RunCtx = { input: Record<string, unknown>; steps: Record<string, { output: unknown }> };

const ONLY = /^\{\{\s*([^}]+?)\s*\}\}$/;
const ANY = /\{\{\s*([^}]+?)\s*\}\}/g;
// AgentFabric `$.path` expressions (e.g. $.input.x, $.steps.id.output.field).
const DOLLAR_ONLY = /^\$\.([\w.[\]]+)$/;
const DOLLAR_ANY = /\$\.([\w.[\]]+)/g;

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
    // Whole-string expression → raw value (preserve object/number).
    const only = value.match(ONLY);
    if (only) return dig(ctx, only[1]!) as T;
    const dollarOnly = value.match(DOLLAR_ONLY);
    if (dollarOnly) return dig(ctx, dollarOnly[1]!) as T;
    // Embedded expressions → string interpolation. Handle both syntaxes.
    const interp = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
    return value
      .replace(ANY, (_, path: string) => interp(dig(ctx, path.trim())))
      .replace(DOLLAR_ANY, (_, path: string) => interp(dig(ctx, path.trim()))) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx);
    return out as T;
  }
  return value;
}
