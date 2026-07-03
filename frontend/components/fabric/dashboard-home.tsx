"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Layers, Activity, CheckCircle2, DollarSign, KeyRound, Lock, Store, Server, Workflow, Clock } from "lucide-react";
import { Panel, usdc } from "./ui";

type Stats = {
  totals: { apis: number; requests: number; success: number; earnings: number; mcpServers: number; workflows: number; successRate: number };
  session: { cap: string | null; spent: string | null; remaining: string | null; expiry: number | null; poolLeafCount: number; live: boolean };
};

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Layers; label: string; value: ReactNode; sub: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-400">{label}</span>
        <Icon className="h-4 w-4 text-neutral-500" strokeWidth={1.7} />
      </div>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{sub}</p>
    </Panel>
  );
}

type ActItem = { kind: "api" | "workflow" | "mcp"; name: string; slug: string | null; created_at: string };
type LogRow = { id: string; api_name: string | null; api_slug: string | null; status: number | null; ok: boolean; paid: boolean; price: number; created_at: string };
type LogStats = { total: number; ok: number; paid: number; revenue: number };

// Per-request metering log — real rows from request_logs, filtered by the dashboard period.
function RequestLogs({ period }: { period: string }) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [stats, setStats] = useState<LogStats | null>(null);
  useEffect(() => {
    setLogs(null);
    fetch(`/api/logs?period=${period}`).then((r) => r.json()).then((d) => { setLogs(d.logs ?? []); setStats(d.stats ?? null); }).catch(() => setLogs([]));
  }, [period]);

  return (
    <Panel>
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Recent Requests</p><span className="text-xs text-neutral-500">· request activity for your APIs</span></div>

      {stats && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"><p className="text-xs text-neutral-500">Calls</p><p className="mt-0.5 text-xl font-semibold text-white">{stats.total}</p></div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"><p className="text-xs text-neutral-500">Paid</p><p className="mt-0.5 text-xl font-semibold text-white">{stats.paid}</p></div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"><p className="text-xs text-neutral-500">Revenue</p><p className="mt-0.5 text-xl font-semibold text-white">${(stats.revenue ?? 0).toFixed(2)}</p></div>
        </div>
      )}

      <div className="mt-4 divide-y divide-white/[0.06]">
        {logs === null ? (
          <p className="py-3 text-sm text-neutral-500">loading…</p>
        ) : logs.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">No requests in this window yet. Calls to any <span className="font-mono">api__*</span> tool land here.</p>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.ok ? "bg-accent" : "bg-red-400"}`} />
              <span className="flex-1 truncate text-neutral-200">{l.api_name ?? l.api_slug ?? "—"}</span>
              {l.paid && <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">paid ${Number(l.price).toFixed(2)}</span>}
              <span className={`w-10 text-right font-mono text-xs ${l.ok ? "text-neutral-500" : "text-red-400"}`}>{l.status ?? "—"}</span>
              <span className="hidden w-28 shrink-0 text-right text-xs text-neutral-600 sm:block">{new Date(l.created_at).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

export function DashboardHome({ go }: { go: (s: "apis" | "mcp" | "workflows") => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const [act, setAct] = useState<ActItem[] | null>(null);
  const [period, setPeriod] = useState("all");
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS).catch(() => {});
    fetch("/api/activity").then((r) => r.json()).then((d) => setAct(d.activity ?? [])).catch(() => setAct([]));
  }, []);
  const TOGGLE = [{ k: "all", label: "All Time" }, { k: "30d", label: "Last 30 Days" }, { k: "7d", label: "Last 7 Days" }];
  const t = s?.totals;
  const sess = s?.session;
  const cap = sess?.cap ? Number(sess.cap) : null;
  const remaining = sess?.remaining ? Number(sess.remaining) : null;
  const pct = cap && remaining != null ? Math.max(0, Math.min(100, (remaining / cap) * 100)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-neutral-400">Manage your creations and track performance — live on Stellar testnet.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/[0.08] p-1">
          {TOGGLE.map((t) => (
            <button key={t.k} onClick={() => setPeriod(t.k)} className={`rounded-lg px-3 py-1.5 text-sm transition ${period === t.k ? "bg-accent/15 text-accent" : "text-neutral-500 hover:text-neutral-300"}`}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Layers} label="Total APIs" value={t?.apis ?? "—"} sub="x402 payment-gated proxies" />
        <Stat icon={Activity} label="Total Requests" value={t?.requests ?? "—"} sub="all-time API calls" />
        <Stat icon={CheckCircle2} label="Success Rate" value={t ? `${t.successRate}%` : "—"} sub={`${t?.success ?? 0} successful`} />
        <Stat icon={DollarSign} label="Total Earnings" value={t ? `$${t.earnings.toFixed(2)}` : "—"} sub="USDC earned" />
      </div>

      {/* Scoped session key — Kage's answer to EIP-7702 smart accounts */}
      <Panel>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <p className="text-lg font-semibold text-white">Scoped session key</p>
          {sess?.live && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">live</span>}
        </div>
        <p className="mt-1.5 text-sm text-neutral-400">
          Instead of holding a hot wallet, the agent gets one scoped, revocable SessionAccount key — it can only pay into the ZK pool, up to a cap, before an expiry. <span className="inline-flex items-center gap-1 text-accent"><Lock className="h-3 w-3" /> zero custody</span>.
        </p>
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-neutral-500">Remaining budget</p>
              <p className="mt-0.5 text-3xl font-semibold text-white">{remaining != null ? usdc(remaining) : "—"}</p>
            </div>
            <p className="text-xs text-neutral-500">
              of {cap != null ? usdc(cap) : "—"} cap · {sess?.poolLeafCount ?? 0} notes in pool
            </p>
          </div>
          {pct != null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </Panel>

      <div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Manage</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { k: "apis" as const, icon: Store, label: "APIs", n: t?.apis, sub: "payment-gated proxies" },
            { k: "mcp" as const, icon: Server, label: "MCP Servers", n: t?.mcpServers, sub: "tools for agents" },
            { k: "workflows" as const, icon: Workflow, label: "Workflows", n: t?.workflows, sub: "reusable agent flows" },
          ].map((m) => (
            <button key={m.k} onClick={() => go(m.k)} className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-left transition hover:border-accent/40 hover:bg-white/[0.04]">
              <m.icon className="h-5 w-5 text-accent" strokeWidth={1.7} />
              <p className="mt-3 flex items-center gap-2 font-semibold text-white">{m.label} <span className="text-sm font-normal text-neutral-500">{m.n ?? 0}</span></p>
              <p className="text-xs text-neutral-500">{m.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <RequestLogs period={period} />

      {/* Recent activity — real rows from the fabric catalog */}
      <Panel>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <p className="font-semibold text-white">Recent activity</p>
        </div>
        <div className="mt-4 divide-y divide-white/[0.06]">
          {act === null ? (
            <p className="py-3 text-sm text-neutral-500">loading…</p>
          ) : act.length === 0 ? (
            <p className="py-3 text-sm text-neutral-500">Nothing published yet — create an API, workflow, or MCP server.</p>
          ) : (
            act.map((a, i) => {
              const tint = a.kind === "workflow" ? "text-accent" : a.kind === "mcp" ? "text-sky-400" : "text-amber-400";
              return (
                <div key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`w-20 shrink-0 font-mono text-[11px] uppercase ${tint}`}>{a.kind}</span>
                  <span className="flex-1 truncate text-neutral-200">{a.name}</span>
                  <span className="hidden font-mono text-xs text-neutral-600 sm:block">/{a.slug}</span>
                  <span className="w-24 shrink-0 text-right text-xs text-neutral-500">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
