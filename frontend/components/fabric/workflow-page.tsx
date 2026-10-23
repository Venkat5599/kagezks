"use client";

// Built-in workflow page: what it does step by step, a form to run it, the plain
// answer plus what each step did, and how to use it from an assistant or code.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Workflow, Play, Loader2, CheckCircle2, XCircle, Bot, Code2, TerminalSquare } from "lucide-react";
import { Panel, Chip, Button, CopyBtn } from "./ui";
import { FieldsForm, ResultView, Snippet, initialValues, type ApiVariable } from "./api-page";
import { useNetwork } from "@/lib/network";

export type WorkflowForPage = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  builtin?: boolean;
  ask?: string;
  example_args?: Record<string, string>;
  input_variables: ApiVariable[];
  steps: { title?: string; api?: string | null }[];
};

type Trace = { title: string; ok: boolean; ms: number; error?: string };

export function WorkflowPage({ wf, onBack, backLabel = "Back to Workflows" }: { wf: WorkflowForPage; onBack: () => void; backLabel?: string }) {
  const { network } = useNetwork();
  const vars = wf.input_variables ?? [];
  const initial = useMemo(() => initialValues(vars, wf.example_args, network), [vars, wf.example_args, network]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; answer?: string; details?: Record<string, unknown>; steps: Trace[]; error?: string } | null>(null);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRes(null);
    const args = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
    try {
      const r = await fetch(`/api/flows/${wf.slug}?${new URLSearchParams(args)}`);
      const d = await r.json();
      setRes(d.ok ? { ok: true, answer: d.answer, details: d.details, steps: d.steps } : { ok: false, error: d.error, steps: d.steps ?? [] });
    } catch (err) {
      setRes({ ok: false, error: `Couldn't run the workflow: ${String((err as Error).message)}`, steps: [] });
    } finally {
      setBusy(false);
    }
  };

  const qs = new URLSearchParams(Object.entries(values).filter(([, v]) => v.trim() !== "")).toString();
  const url = `https://kageai.me/api/flows/${wf.slug}${qs ? `?${qs}` : ""}`;
  const [tab, setTab] = useState<"ai" | "code" | "terminal">("ai");

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10">
          <Workflow className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{wf.name}</h1>
          <p className="mt-1 max-w-2xl text-neutral-400">{wf.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip accent>Free</Chip>
            <Chip>by Kage</Chip>
            <Chip>{wf.steps.length} steps</Chip>
          </div>
        </div>
      </div>

      <Panel>
        <p className="text-lg font-semibold text-white">What it does</p>
        <ol className="mt-4 space-y-2">
          {wf.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
              <span className="text-neutral-200">{s.title}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel>
        <p className="text-lg font-semibold text-white">Try it</p>
        <p className="mt-1 text-sm text-neutral-500">Fill in the fields and press Run. Every step runs live.</p>
        <form onSubmit={run} className="mt-5 space-y-4">
          <FieldsForm vars={vars} values={values} setValues={setValues} />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {busy ? "Running…" : "Run"}
          </Button>
        </form>

        {res && (
          <div className="mt-5 space-y-3">
            {res.ok ? (
              <>
                <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Answer</p>
                  <p className="mt-1.5 text-base leading-relaxed text-white">{res.answer}</p>
                </div>
                {res.details && <ResultView data={res.details} title="Details" />}
              </>
            ) : (
              <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-200">{res.error}</p>
            )}
            {res.steps.length > 0 && (
              <div className="space-y-1.5">
                {res.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-neutral-400">
                    {s.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    <span>{s.title}</span>
                    <span className="text-neutral-600">{(s.ms / 1000).toFixed(1)}s</span>
                    {s.error && <span className="text-red-300">— {s.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <p className="text-lg font-semibold text-white">Use it</p>
        <div className="mt-3 flex gap-1 border-b border-white/[0.08]">
          {([["ai", "AI assistant", Bot], ["code", "Your code", Code2], ["terminal", "Terminal", TerminalSquare]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${tab === k ? "border-accent text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {tab === "ai" && (
          <div className="mt-4 space-y-3 text-sm text-neutral-300">
            <p>Connect your AI assistant to one of Kage&apos;s MCP servers that includes this workflow (see the MCP Servers page), then ask:</p>
            {wf.ask && <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white">“{wf.ask}”</p>}
            <p className="text-xs text-neutral-500">
              The assistant runs every step for you and replies with the answer. Tool name: <span className="font-mono text-neutral-300">wf__{wf.slug}</span> <CopyBtn text={`wf__${wf.slug}`} />
            </p>
          </div>
        )}
        {tab === "code" && (
          <div className="mt-4">
            <p className="text-sm text-neutral-400">Call it from any website or app. It returns JSON with the answer and details.</p>
            <Snippet text={`const res = await fetch("${url}");\nconst { answer } = await res.json();\nconsole.log(answer);`} />
          </div>
        )}
        {tab === "terminal" && (
          <div className="mt-4">
            <p className="text-sm text-neutral-400">Paste this into a terminal.</p>
            <Snippet text={`curl "${url}"`} />
          </div>
        )}
      </Panel>
    </div>
  );
}
