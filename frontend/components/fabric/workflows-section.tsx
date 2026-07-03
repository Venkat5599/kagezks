"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Loader2, Search, Trash2, Globe, Link2, Play, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Toggle, Chip, Empty, CopyBtn, short } from "./ui";
import { useWallet } from "@/lib/wallet";

// Shapes match the fabric engine (agent/fabric/*): steps carry `id` + `kind`, output
// mapping is { name, from }, and templates use {{input.x}} / {{steps.id.output...}}.
type WfStep =
  | { id: string; kind: "http"; url?: string; method?: string; body?: string; api?: string }
  | { id: string; kind: "onchain"; recipientScanKey: string; amount: string }
  | { id: string; kind: "condition"; left: string; op: string; right: string };
type Wf = {
  id: string; name: string; slug: string | null; description: string | null; is_public: boolean;
  input_variables: { name: string; type?: string }[]; steps: WfStep[];
  output_mapping?: { name: string; from: string }[]; allowed_contracts?: string[];
  tags: string[];
};
type Variable = { name: string; type: string; description: string; required: boolean };
type Output = { name: string; from: string };
// Builder step keeps every kind's fields flat; `submit` narrows to the engine shape.
type BStep = {
  id: string; kind: "http" | "onchain" | "condition";
  url: string; method: string; body: string;
  recipientScanKey: string; amount: string;
  left: string; op: string; right: string;
};

const OPS = [">=", ">", "<=", "<", "==", "!="];

export function WorkflowsSection() {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Wf | null>(null);
  const [wfs, setWfs] = useState<Wf[] | null>(null);
  const [q, setQ] = useState("");
  const { address } = useWallet();
  const load = () => fetch(`/api/workflows${address ? `?owner=${address}` : ""}`).then((r) => r.json()).then((d) => setWfs(d.workflows ?? [])).catch(() => setWfs([]));
  useEffect(() => { load(); }, [address]);

  if (creating) return <CreateWorkflowForm onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;
  if (selected) return <WorkflowDetail wf={selected} onBack={() => setSelected(null)} />;
  const filtered = (wfs ?? []).filter((w) => !q || (w.name + w.description).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">Workflows</h1>
          <p className="mt-1 text-neutral-400">Reusable, composable flows agents run — HTTP calls + on-chain ZK operations.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create Workflow</Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <Input placeholder="Search workflows…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>

      {wfs === null ? (
        <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty>
      ) : filtered.length === 0 ? (
        <Empty>No workflows yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((w) => (
            <button key={w.id} type="button" onClick={() => setSelected(w)} className="text-left">
              <Panel className="h-full cursor-pointer transition hover:border-accent/40 hover:bg-white/[0.04]">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-white">{w.name}</p>
                  {w.is_public && <Globe className="h-3.5 w-3.5 text-neutral-500" />}
                </div>
                <p className="mt-0.5 font-mono text-xs text-neutral-500">/{w.slug}</p>
                <p className="mt-3 line-clamp-2 text-sm text-neutral-500">{w.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {(w.tags ?? []).map((t) => <Chip key={t} accent={t === "zk" || t === "onchain"}>{t}</Chip>)}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
                  <span>{(w.steps ?? []).length} steps</span>
                  <span>{(w.input_variables ?? []).length} inputs</span>
                </div>
              </Panel>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowDetail({ wf, onBack }: { wf: Wf; onBack: () => void }) {
  const inputs = wf.input_variables ?? [];
  // Agents call the workflow as its own MCP tool `wf__<slug>` on the fabric server.
  const runExample = JSON.stringify(
    { tool: `wf__${wf.slug ?? wf.name}`, arguments: Object.fromEntries(inputs.map((v) => [v.name, `<${v.name}>`])) },
    null, 2,
  );
  const stepColor = (k: string) => (k === "onchain" ? "text-accent" : k === "condition" ? "text-amber-400" : "text-sky-400");
  const stepLabel = (s: WfStep) =>
    s.kind === "onchain" ? `ZK settle → ${s.amount}`
    : s.kind === "condition" ? `${s.left} ${s.op} ${s.right}`
    : `${s.method ?? "GET"} ${s.url ?? s.api ?? ""}`;
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to Workflows</button>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{wf.name}</h1>
          {wf.is_public && <Globe className="h-4 w-4 text-neutral-500" />}
        </div>
        <p className="mt-1 font-mono text-xs text-neutral-500">/{wf.slug}</p>
        <div className="mt-2 flex flex-wrap gap-2">{(wf.tags ?? []).map((t) => <Chip key={t} accent={t === "zk" || t === "onchain"}>{t}</Chip>)}</div>
      </div>

      <Panel><p className="text-sm text-neutral-300">{wf.description}</p></Panel>

      <RunWorkflow wf={wf} />

      <Panel>
        <p className="font-semibold text-white">Steps</p>
        <ol className="mt-4 space-y-2">
          {(wf.steps ?? []).map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-xs text-neutral-400">{i + 1}</span>
              <span className="font-mono text-xs text-neutral-400">{s.id}</span>
              <span className="flex-1 truncate text-sm text-white">{stepLabel(s)}</span>
              <span className={`font-mono text-[11px] ${stepColor(s.kind)}`}>{s.kind}</span>
            </li>
          ))}
          {(wf.steps ?? []).length === 0 && <li className="text-sm text-neutral-500">no steps</li>}
        </ol>
      </Panel>

      {inputs.length > 0 && (
        <Panel>
          <p className="font-semibold text-white">Inputs</p>
          <div className="mt-3 space-y-2">
            {inputs.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-white/[0.08] px-4 py-2 text-sm">
                <span className="font-mono text-white">{v.name}</span><span className="text-neutral-500">{v.type ?? "string"}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {(wf.allowed_contracts ?? []).length > 0 && (
        <Panel>
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Scope (allowed contracts)</p></div>
          <p className="mt-1 text-sm text-neutral-500">The on-chain step may settle only through these — checked before any proof is built.</p>
          <div className="mt-3 space-y-2">
            {(wf.allowed_contracts ?? []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2"><span className="flex-1 truncate font-mono text-xs text-white">{c}</span><span className="font-mono text-[11px] text-neutral-500">{short(c, 6, 5)}</span></div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center gap-2"><Play className="h-4 w-4 text-accent" /><p className="font-semibold text-white">How to run</p></div>
        <p className="mt-1 text-sm text-neutral-500">An agent runs the whole flow with one MCP call on the fabric server:</p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{runExample}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={runExample} /></div>
        </div>
      </Panel>
    </div>
  );
}

// Live run — hits the fabric engine through /api/fabric/run. Real execution: the
// on-chain step builds a Groth16 proof and settles through the SessionAccount.
type RunStep = { id: string; kind: string; status: "ok" | "skipped" | "error"; detail?: string; output?: unknown };
type RunResp = { ok: boolean; error?: string; run?: { workflow: string; completed: boolean; steps: RunStep[]; output?: Record<string, unknown> } };

function RunWorkflow({ wf }: { wf: Wf }) {
  const inputs = wf.input_variables ?? [];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RunResp | null>(null);

  const run = async () => {
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/fabric/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "workflow", slug: wf.slug ?? wf.name, input: vals, token: token || undefined }),
      });
      setRes(await r.json());
    } catch (e) { setRes({ ok: false, error: String((e as Error).message) }); } finally { setBusy(false); }
  };

  const icon = (s: string) => s === "ok" ? <CheckCircle2 className="h-4 w-4 text-accent" /> : s === "error" ? <XCircle className="h-4 w-4 text-red-400" /> : <MinusCircle className="h-4 w-4 text-amber-400" />;
  const txHash = res?.run?.output?.tx as string | undefined;

  return (
    <Panel>
      <div className="flex items-center gap-2"><Play className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Run it</p><Chip accent>live</Chip></div>
      <p className="mt-1 text-sm text-neutral-500">Executes on the fabric engine. On-chain steps build a real ZK proof and settle through the SessionAccount.</p>

      <div className="mt-4 space-y-3">
        {inputs.map((v) => (
          <Field key={v.name} label={v.name}>
            <Input placeholder={v.name} value={vals[v.name] ?? ""} onChange={(e) => setVals((s) => ({ ...s, [v.name]: e.target.value }))} className="font-mono" />
          </Field>
        ))}
        <Field label="Agent token" hint="(optional) routes to your scoped session; blank = default"><Input placeholder="kage_sk_…" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" /></Field>
      </div>

      <div className="mt-4"><Button onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run workflow</Button></div>

      {res && (
        <div className="mt-5">
          {!res.ok && <p className="text-sm text-red-400">{res.error}</p>}
          {res.run && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className={res.run.completed ? "text-accent" : "text-amber-400"}>{res.run.completed ? "completed" : "halted"}</span>
                <span className="text-neutral-600">·</span><span className="font-mono text-xs text-neutral-500">{res.run.workflow}</span>
              </div>
              <ol className="mt-3 space-y-1.5">
                {res.run.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm">
                    {icon(s.status)}
                    <span className="font-mono text-xs text-neutral-400">{s.id}</span>
                    <span className="flex-1 truncate text-neutral-300">{s.detail}</span>
                    <span className="font-mono text-[11px] text-neutral-600">{s.kind}</span>
                  </li>
                ))}
              </ol>
              {txHash && (
                <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                  View settlement tx ↗ <span className="font-mono text-xs">{short(txHash, 8, 6)}</span>
                </a>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function CreateWorkflowForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [meta, setMeta] = useState({ name: "", slug: "", description: "", is_public: false });
  const [vars, setVars] = useState<Variable[]>([]);
  const [steps, setSteps] = useState<BStep[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [contracts, setContracts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { address } = useWallet();

  const newStep = (): BStep => ({
    id: `step_${steps.length + 1}`, kind: "condition",
    url: "", method: "GET", body: "",
    recipientScanKey: "{{input.recipientScanKey}}", amount: "{{input.amount}}",
    left: "{{input.amount}}", op: "<=", right: "50000000",
  });
  const patchStep = (i: number, p: Partial<BStep>) => setSteps((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));

  // Narrow each builder step to the engine's WfStep shape.
  const toEngine = (s: BStep): WfStep => {
    if (s.kind === "http") return { id: s.id, kind: "http", url: s.url, method: s.method, ...(s.body ? { body: s.body } : {}) };
    if (s.kind === "onchain") return { id: s.id, kind: "onchain", recipientScanKey: s.recipientScanKey, amount: s.amount };
    return { id: s.id, kind: "condition", left: s.left, op: s.op, right: s.right };
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...meta,
          input_variables: vars.map((v) => ({ name: v.name, type: v.type, description: v.description, required: v.required })),
          steps: steps.map(toEngine),
          output_mapping: outputs.filter((o) => o.name && o.from),
          allowed_contracts: contracts.filter(Boolean),
          tags: steps.some((s) => s.kind === "onchain") ? ["http", "onchain", "zk"] : ["http"],
          owner_address: address,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "failed");
      onDone();
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to Workflows</button>
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Create Workflow</h1>
        <p className="mt-1 text-neutral-400">Combine HTTP calls, budget conditions, and the on-chain ZK settlement into a reusable flow.</p>
      </div>

      <Panel className="space-y-5">
        <Field label="Workflow Name"><Input placeholder="My Private Payment" value={meta.name} onChange={(e) => setMeta((s) => ({ ...s, name: e.target.value }))} /></Field>
        <Field label="URL Slug" hint="lowercase, hyphens — becomes the wf__slug MCP tool"><Input placeholder="my-private-payment" value={meta.slug} onChange={(e) => setMeta((s) => ({ ...s, slug: e.target.value }))} /></Field>
        <Field label="Description" hint="(optional)"><Textarea rows={2} placeholder="Describe what this workflow does…" value={meta.description} onChange={(e) => setMeta((s) => ({ ...s, description: e.target.value }))} /></Field>
        <Toggle on={meta.is_public} onChange={(v) => setMeta((s) => ({ ...s, is_public: v }))} label="Make Workflow Public" desc="List it as a wf__ tool other agents can discover" />
      </Panel>

      {/* Input variables */}
      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Input Variables</p><p className="text-sm text-neutral-500">Inputs agents provide when calling this workflow.</p></div>
          <Button variant="outline" onClick={() => setVars((v) => [...v, { name: "", type: "string", description: "", required: true }])}><Plus className="h-4 w-4" /> Add Variable</Button>
        </div>
        {vars.length === 0 ? <Empty>No variables. Reference them in steps via <span className="font-mono text-neutral-400">{"{{input.name}}"}</span></Empty> : (
          <div className="space-y-2">
            {vars.map((v, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_110px_1fr_auto_auto] sm:items-center">
                <Input placeholder="variableName" value={v.name} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="font-mono" />
                <select value={v.type} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 text-sm text-white">
                  {["string", "number", "boolean"].map((t) => <option key={t} className="bg-[#0b0b0b]">{t}</option>)}
                </select>
                <Input placeholder="description" value={v.description} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <button type="button" onClick={() => setVars((a) => a.map((x, j) => j === i ? { ...x, required: !x.required } : x))} className={`rounded-lg border px-2.5 py-2 text-xs ${v.required ? "border-accent/50 bg-accent/15 text-accent" : "border-white/[0.12] text-neutral-500"}`}>{v.required ? "required" : "optional"}</button>
                <button onClick={() => setVars((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Steps */}
      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Workflow Steps</p><p className="text-sm text-neutral-500">Run in order. A failed condition halts the flow; the on-chain step settles ZK-private.</p></div>
          <Button variant="outline" onClick={() => setSteps((s) => [...s, newStep()])}><Plus className="h-4 w-4" /> Add Step</Button>
        </div>
        {steps.length === 0 ? <Empty>No steps yet.</Empty> : (
          <div className="space-y-4">
            {steps.map((st, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-xs text-neutral-400">{i + 1}</span>
                  <Input placeholder="step id (e.g. gate)" value={st.id} onChange={(e) => patchStep(i, { id: e.target.value })} className="font-mono" />
                  <button onClick={() => setSteps((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-4">
                  <Field label="Step Type">
                    <select value={st.kind} onChange={(e) => patchStep(i, { kind: e.target.value as BStep["kind"] })} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white">
                      <option value="condition" className="bg-[#0b0b0b]">Condition (budget gate)</option>
                      <option value="http" className="bg-[#0b0b0b]">HTTP Request</option>
                      <option value="onchain" className="bg-[#0b0b0b]">On-chain (ZK settle)</option>
                    </select>
                  </Field>
                </div>

                {st.kind === "condition" && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                    <Field label="Left"><Input placeholder="{{input.amount}}" value={st.left} onChange={(e) => patchStep(i, { left: e.target.value })} className="font-mono" /></Field>
                    <select value={st.op} onChange={(e) => patchStep(i, { op: e.target.value })} className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 text-sm text-white">
                      {OPS.map((o) => <option key={o} className="bg-[#0b0b0b]">{o}</option>)}
                    </select>
                    <Field label="Right"><Input placeholder="50000000" value={st.right} onChange={(e) => patchStep(i, { right: e.target.value })} className="font-mono" /></Field>
                  </div>
                )}

                {st.kind === "http" && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                      <Field label="Method">
                        <select value={st.method} onChange={(e) => patchStep(i, { method: e.target.value })} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 text-sm text-white">
                          {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m} className="bg-[#0b0b0b]">{m}</option>)}
                        </select>
                      </Field>
                      <Field label="URL"><Input placeholder="https://api.example.com/price?sym={{input.sym}}" value={st.url} onChange={(e) => patchStep(i, { url: e.target.value })} className="font-mono" /></Field>
                    </div>
                    <Field label="Body (JSON)" hint="templates: {{input.x}} / {{steps.id.output.y}}"><Textarea rows={3} placeholder='{ "amount": "{{input.amount}}" }' value={st.body} onChange={(e) => patchStep(i, { body: e.target.value })} className="font-mono" /></Field>
                  </div>
                )}

                {st.kind === "onchain" && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Recipient scan key" hint="hex x25519 payee key"><Input placeholder="{{input.recipientScanKey}}" value={st.recipientScanKey} onChange={(e) => patchStep(i, { recipientScanKey: e.target.value })} className="font-mono" /></Field>
                    <Field label="Amount" hint="USDC, 7 decimals"><Input placeholder="{{input.amount}}" value={st.amount} onChange={(e) => patchStep(i, { amount: e.target.value })} className="font-mono" /></Field>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Output mapping */}
      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Output Mapping</p><p className="text-sm text-neutral-500">What the workflow returns on completion.</p></div>
          <Button variant="outline" onClick={() => setOutputs((o) => [...o, { name: "", from: "" }])}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {outputs.length === 0 ? <Empty>No outputs. e.g. <span className="font-mono text-neutral-400">{"tx = {{steps.settle.output.hash}}"}</span></Empty> : (
          <div className="space-y-2">
            {outputs.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="name (e.g. tx)" value={o.name} onChange={(e) => setOutputs((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <span className="text-neutral-500">=</span>
                <Input placeholder="{{steps.settle.output.hash}}" value={o.from} onChange={(e) => setOutputs((a) => a.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} className="font-mono" />
                <button onClick={() => setOutputs((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Scope config */}
      <Panel className="space-y-4">
        <div>
          <p className="font-semibold text-white">Scope Configuration</p>
          <p className="text-sm text-neutral-500">Soroban contracts the on-chain step is allowed to settle through.</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-accent/90">The engine refuses to run the on-chain step if the pool isn&apos;t in this list — and the SessionAccount policy still caps spend on-chain, so the agent can never drain or redirect funds.</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Allowed Contract Addresses</p>
          <Button variant="outline" onClick={() => setContracts((c) => [...c, ""])}><Plus className="h-4 w-4" /> Add Address</Button>
        </div>
        {contracts.length === 0 ? <Empty>No allowed addresses configured.</Empty> : (
          <div className="space-y-2">
            {contracts.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="C… (Soroban contract)" value={c} onChange={(e) => setContracts((a) => a.map((x, j) => j === i ? e.target.value : x))} className="font-mono" />
                <button onClick={() => setContracts((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel}>Reset</Button>
        <Button onClick={submit} disabled={busy || !meta.name}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Workflow</Button>
      </div>
    </div>
  );
}
