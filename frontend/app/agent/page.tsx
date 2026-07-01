"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Wrench,
  ShieldCheck,
  Receipt,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import type { ReactNode } from "react";

type Step = { phase: string; tool?: string; label: string; status: "ok" | "info" | "skipped"; detail: string; data?: unknown };
type RunResult = {
  tools: string[];
  instruction: string;
  steps: Step[];
  result: { status: string; commitment?: string; tx?: string; txUrl?: string; reason?: string };
  note: string;
};

const PHASE_ICON: Record<string, typeof Bot> = {
  discover: Wrench,
  scope: ShieldCheck,
  meter: Receipt,
  pay: Lock,
  confirm: CheckCircle2,
};

const AMOUNTS = [
  { label: "0.5 USDC", value: "5000000" },
  { label: "3 USDC", value: "30000000" },
  { label: "8 USDC (over cap)", value: "80000000" },
];

function StatusDot({ status }: { status: Step["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-accent" />;
  if (status === "skipped") return <XCircle className="h-4 w-4 text-red-400" />;
  return <div className="h-1.5 w-1.5 rounded-full bg-neutral-500" />;
}

export default function AgentPage(): ReactNode {
  const [amount, setAmount] = useState(AMOUNTS[0]!.value);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [revealed, setRevealed] = useState(0);

  async function start() {
    setRunning(true);
    setRun(null);
    setRevealed(0);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data: RunResult = await res.json();
      setRun(data);
      // Reveal steps one at a time for the "agent thinking" feel.
      for (let i = 1; i <= data.steps.length; i++) {
        await new Promise((r) => setTimeout(r, 520));
        setRevealed(i);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] px-6 py-16 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">← Veil</Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Watch an agent pay — privately</h1>
            <p className="text-sm text-neutral-400">
              An AI agent discovers Veil&apos;s tools over MCP, is metered per call via x402, and pays through a scoped
              key it can&apos;t drain — settled in zero-knowledge.
            </p>
          </div>
        </div>

        {/* controls */}
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Instruct the agent</span>
          <div className="flex gap-2">
            {AMOUNTS.map((a) => (
              <button
                key={a.value}
                onClick={() => setAmount(a.value)}
                disabled={running}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  amount === a.value ? "bg-accent text-black" : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1]"
                }`}
              >
                pay {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={start}
            disabled={running}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {running ? "Agent running…" : "Run agent"}
          </button>
        </div>

        {/* discovered tools */}
        {run && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Discovered tools (MCP)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {run.tools.map((t) => (
                <span key={t} className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-neutral-300">
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-3 font-mono text-xs text-neutral-500">agent task: “{run.instruction}”</p>
          </div>
        )}

        {/* steps */}
        <div className="mt-6 space-y-2">
          <AnimatePresence>
            {run?.steps.slice(0, revealed).map((s, i) => {
              const Icon = PHASE_ICON[s.phase] ?? Wrench;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.35 }}
                  className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
                    <Icon className="h-4 w-4 text-accent" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.label}</span>
                      {s.tool && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">{s.tool}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-400">{s.detail}</p>
                  </div>
                  <StatusDot status={s.status} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* result */}
        {run && revealed >= run.steps.length && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-6 rounded-2xl border p-5 ${
              run.result.status === "paid" ? "border-accent/30 bg-accent/[0.06]" : "border-red-500/30 bg-red-500/[0.06]"
            }`}
          >
            {run.result.status === "paid" ? (
              <>
                <div className="flex items-center gap-2 text-accent">
                  <Lock className="h-4 w-4" />
                  <span className="text-sm font-semibold">Paid — privately</span>
                </div>
                <div className="mt-3 grid gap-2 font-mono text-xs text-neutral-300 sm:grid-cols-2">
                  <div>commitment: {run.result.commitment}</div>
                  <div>tx: {run.result.tx}</div>
                </div>
                {run.result.txUrl && (
                  <a href={run.result.txUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    view on stellar.expert <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Rejected — {run.result.reason}</span>
              </div>
            )}
          </motion.div>
        )}

        {run && <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">{run.note}</p>}
      </div>
    </main>
  );
}
