"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Loader2, Search, Trash2, Globe, Link2, Play } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Toggle, Chip, Empty, CopyBtn, short } from "./ui";

type Wf = {
  id: string; name: string; slug: string | null; description: string | null; is_public: boolean;
  input_variables: { name: string; type: string }[]; steps: { name: string; type: string }[];
  output_mapping?: { key: string; expr: string }[]; allowed_contracts?: string[];
  tags: string[];
};
type Step = { name: string; type: "http" | "onchain" | "condition"; outputKey: string; method: string; url: string; body: string };
type Variable = { name: string; type: string };
type Output = { key: string; expr: string };

export function WorkflowsSection() {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Wf | null>(null);
  const [wfs, setWfs] = useState<Wf[] | null>(null);
  const [q, setQ] = useState("");
  const load = () => fetch("/api/workflows").then((r) => r.json()).then((d) => setWfs(d.workflows ?? [])).catch(() => setWfs([]));
  useEffect(() => { load(); }, []);

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
  const runExample = JSON.stringify(
    { tool: "workflow_run", arguments: { name: wf.slug ?? wf.name, ...Object.fromEntries(inputs.map((v) => [v.name, `<${v.type}>`])) } },
    null, 2,
  );
  const stepColor = (t: string) => (t === "onchain" ? "text-accent" : t === "condition" ? "text-amber-400" : "text-sky-400");
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

      <Panel>
        <p className="font-semibold text-white">Steps</p>
        <ol className="mt-4 space-y-2">
          {(wf.steps ?? []).map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-xs text-neutral-400">{i + 1}</span>
              <span className="flex-1 text-sm text-white">{s.name || `step ${i + 1}`}</span>
              <span className={`font-mono text-[11px] ${stepColor(s.type)}`}>{s.type}</span>
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
                <span className="font-mono text-white">{v.name}</span><span className="text-neutral-500">{v.type}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {(wf.allowed_contracts ?? []).length > 0 && (
        <Panel>
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Scope (allowed contracts)</p></div>
          <p className="mt-1 text-sm text-neutral-500">Baked into the SessionAccount policy — the agent&apos;s scoped key may call only these.</p>
          <div className="mt-3 space-y-2">
            {(wf.allowed_contracts ?? []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2"><span className="flex-1 truncate font-mono text-xs text-white">{c}</span><span className="font-mono text-[11px] text-neutral-500">{short(c, 6, 5)}</span></div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center gap-2"><Play className="h-4 w-4 text-accent" /><p className="font-semibold text-white">How to run</p></div>
        <p className="mt-1 text-sm text-neutral-500">An agent runs the whole flow with one MCP call:</p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{runExample}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={runExample} /></div>
        </div>
      </Panel>
    </div>
  );
}

function CreateWorkflowForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [meta, setMeta] = useState({ name: "", slug: "", description: "", is_public: false });
  const [vars, setVars] = useState<Variable[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [contracts, setContracts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...meta, input_variables: vars, steps,
          output_mapping: outputs, allowed_contracts: contracts.filter(Boolean),
          tags: steps.some((s) => s.type === "onchain") ? ["http", "onchain", "zk"] : ["http"],
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
        <p className="mt-1 text-neutral-400">Combine HTTP calls and on-chain ZK operations into a reusable flow.</p>
      </div>

      <Panel className="space-y-5">
        <Field label="Workflow Name"><Input placeholder="My Private Payment" value={meta.name} onChange={(e) => setMeta((s) => ({ ...s, name: e.target.value }))} /></Field>
        <Field label="URL Slug" hint="lowercase, hyphens"><Input placeholder="my-private-payment" value={meta.slug} onChange={(e) => setMeta((s) => ({ ...s, slug: e.target.value }))} /></Field>
        <Field label="Description" hint="(optional)"><Textarea rows={2} placeholder="Describe what this workflow does…" value={meta.description} onChange={(e) => setMeta((s) => ({ ...s, description: e.target.value }))} /></Field>
        <Toggle on={meta.is_public} onChange={(v) => setMeta((s) => ({ ...s, is_public: v }))} label="Make Workflow Public" desc="Allow other MCP servers to use this workflow" />
      </Panel>

      {/* Input variables */}
      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Input Variables</p><p className="text-sm text-neutral-500">Inputs agents provide when calling this workflow.</p></div>
          <Button variant="outline" onClick={() => setVars((v) => [...v, { name: "", type: "string" }])}><Plus className="h-4 w-4" /> Add Variable</Button>
        </div>
        {vars.length === 0 ? <Empty>No variables. Reference them in steps via <span className="font-mono text-neutral-400">$.input.name</span></Empty> : (
          <div className="space-y-2">
            {vars.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="variableName" value={v.name} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <select value={v.type} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 text-sm text-white">
                  {["string", "number", "boolean"].map((t) => <option key={t} className="bg-[#0b0b0b]">{t}</option>)}
                </select>
                <button onClick={() => setVars((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Steps */}
      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Workflow Steps</p><p className="text-sm text-neutral-500">Sequence of HTTP calls and on-chain operations.</p></div>
          <Button variant="outline" onClick={() => setSteps((s) => [...s, { name: "", type: "http", outputKey: `step_${s.length + 1}`, method: "GET", url: "", body: "" }])}><Plus className="h-4 w-4" /> Add Step</Button>
        </div>
        {steps.length === 0 ? <Empty>No steps yet.</Empty> : (
          <div className="space-y-4">
            {steps.map((st, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-xs text-neutral-400">{i + 1}</span>
                  <Input placeholder="Step name" value={st.name} onChange={(e) => setSteps((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <button onClick={() => setSteps((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Step Type">
                    <select value={st.type} onChange={(e) => setSteps((a) => a.map((x, j) => j === i ? { ...x, type: e.target.value as Step["type"] } : x))} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white">
                      <option value="http" className="bg-[#0b0b0b]">HTTP Request</option>
                      <option value="onchain" className="bg-[#0b0b0b]">On-chain (ZK deposit)</option>
                      <option value="condition" className="bg-[#0b0b0b]">Condition</option>
                    </select>
                  </Field>
                  <Field label="Output Key" hint="stored under $.steps.*"><Input value={st.outputKey} onChange={(e) => setSteps((a) => a.map((x, j) => j === i ? { ...x, outputKey: e.target.value } : x))} /></Field>
                </div>
                {st.type === "http" && (
                  <div className="mt-4 space-y-4">
                    <Field label="URL"><Input placeholder="https://api.example.com/endpoint" value={st.url} onChange={(e) => setSteps((a) => a.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} /></Field>
                    <Field label="Body Mapping (JSON)" hint="use $.input.varName"><Textarea rows={3} placeholder='{ "amount": "$.input.amount" }' value={st.body} onChange={(e) => setSteps((a) => a.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} /></Field>
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
          <Button variant="outline" onClick={() => setOutputs((o) => [...o, { key: "", expr: "" }])}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {outputs.length === 0 ? <Empty>No outputs. e.g. <span className="font-mono text-neutral-400">txHash = $.steps.deposit.hash</span></Empty> : (
          <div className="space-y-2">
            {outputs.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="key (e.g. txHash)" value={o.key} onChange={(e) => setOutputs((a) => a.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                <span className="text-neutral-500">=</span>
                <Input placeholder="$.steps.deposit.hash" value={o.expr} onChange={(e) => setOutputs((a) => a.map((x, j) => j === i ? { ...x, expr: e.target.value } : x))} className="font-mono" />
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
          <p className="text-sm text-neutral-500">Soroban contracts this workflow&apos;s session key is allowed to call.</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-accent/90">Allowed contract addresses are baked into the SessionAccount policy — the agent&apos;s scoped key can call only these, so it can never drain or redirect funds.</p>
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
