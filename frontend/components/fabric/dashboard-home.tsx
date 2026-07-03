"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Layers, Activity, CheckCircle2, DollarSign, KeyRound, Lock, Store, Server, Workflow, Clock, Wallet, Eye, EyeOff } from "lucide-react";
import { Panel, usdc, CopyBtn } from "./ui";
import { useWallet } from "@/lib/wallet";

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
  const { address, secret, real, connecting, connect, generate, disconnect } = useWallet();
  useEffect(() => {
    fetch(`/api/stats${address ? `?owner=${address}` : ""}`).then((r) => r.json()).then(setS).catch(() => {});
    fetch("/api/activity").then((r) => r.json()).then((d) => setAct(d.activity ?? [])).catch(() => setAct([]));
  }, [address]);
  const TOGGLE = [{ k: "all", label: "All Time" }, { k: "30d", label: "Last 30 Days" }, { k: "7d", label: "Last 7 Days" }];
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const [showSec, setShowSec] = useState(false);
  const [wstat, setWstat] = useState<{ funded: boolean; xlm: string } | null>(null);
  useEffect(() => {
    if (!address) { setWstat(null); return; }
    setWstat(null);
    fetch(`/api/wallet-status?address=${address}`).then((r) => r.json()).then((d) => setWstat(d.ok ? { funded: d.funded, xlm: d.xlm } : null)).catch(() => {});
  }, [address]);

  // Per-user session provisioning (only for generated wallets, whose secret we hold).
  const [prov, setProv] = useState<{ sessionId: string; token: string } | null>(null);
  const [provBusy, setProvBusy] = useState(false);
  const [capUsdc, setCapUsdc] = useState("5");
  const [fundUsdc, setFundUsdc] = useState("1");
  useEffect(() => {
    const t = localStorage.getItem("kage_session_token"); const sid = localStorage.getItem("kage_session_id");
    if (t && sid) setProv({ token: t, sessionId: sid });
  }, []);
  const provision = async () => {
    if (!address || !secret) return;
    setProvBusy(true);
    try {
      const toRaw = (v: string) => String(Math.max(0, Math.round(Number(v || "0") * 1e7)));
      const r = await fetch("/api/fabric/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerAddress: address, ownerSecret: secret, cap: toRaw(capUsdc), amount: toRaw(fundUsdc) }) });
      const d = await r.json();
      if (d.ok) { setProv({ sessionId: d.sessionId, token: d.token }); localStorage.setItem("kage_session_token", d.token); localStorage.setItem("kage_session_id", d.sessionId); }
      else alert(`Provision failed: ${d.error}`);
    } catch (e) { alert(`Provision failed: ${String((e as Error).message)}`); } finally { setProvBusy(false); }
  };

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

      {/* x402 Payments — Kage's scoped SessionAccount (the ZK equivalent of a smart account) */}
      <Panel>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <p className="text-lg font-semibold text-white">x402 Payments</p>
          {sess?.live && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">live</span>}
        </div>
        <p className="mt-1 text-sm text-neutral-500">Scoped session account for automated, ZK-private agent payments.</p>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-semibold text-white">{address ? "Your wallet" : "Session Account required"}</p>
            <p className="mt-1 text-sm text-neutral-400">
              Unlike EIP-7702 smart accounts, the agent pays through a scoped, revocable Stellar SessionAccount — only into the ZK pool, up to a cap, before an expiry. <span className="inline-flex items-center gap-1 text-accent"><Lock className="h-3 w-3" /> zero custody</span>, every payment private.
            </p>
            {address && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-neutral-400">{shortAddr(address)}</span>
                <span className="text-neutral-600">·</span>
                <span className="text-neutral-500">{wstat === null ? "…" : wstat.funded ? `${Number(wstat.xlm).toFixed(2)} XLM` : "unfunded"}</span>
                {real && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">Freighter</span>}
              </div>
            )}
          </div>
        </div>

        {/* One-time secret reveal for a freshly generated wallet */}
        {secret && (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="text-xs font-semibold text-amber-300">Save your secret key — shown once. Import it into Freighter to control this wallet.</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2">
              <span className="flex-1 truncate font-mono text-[11px] text-neutral-200">{showSec ? secret : "•".repeat(56)}</span>
              <button onClick={() => setShowSec((v) => !v)} className="text-neutral-400 hover:text-white" title={showSec ? "Hide" : "Reveal"}>{showSec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              <CopyBtn text={secret} />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Hidden by default (safe to screen-share). Reveal to view, or copy directly. Funding via friendbot…</p>
          </div>
        )}

        {!address ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button onClick={generate} disabled={connecting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
              <Wallet className="h-4 w-4" /> {connecting ? "Generating…" : "Generate Session Account Wallet"}
            </button>
            <button onClick={connect} disabled={connecting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.12] px-4 py-3 text-sm font-semibold text-neutral-300 transition hover:border-accent/40 hover:text-white">
              Connect Freighter
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-xs text-neutral-500">Your wallet balance</p>
              <p className="mt-0.5 text-2xl font-semibold text-white">{wstat === null ? "—" : `${Number(wstat.xlm).toFixed(2)} XLM`}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{wstat?.funded ? "funded on testnet" : "not funded yet"}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-xs text-neutral-500">Demo agent session {sess?.live && <span className="text-accent">· live</span>}</p>
              <p className="mt-0.5 text-2xl font-semibold text-white">{remaining != null ? usdc(remaining) : "—"}</p>
              <p className="mt-1 text-[11px] text-neutral-500">of {cap != null ? usdc(cap) : "—"} cap · {sess?.poolLeafCount ?? 0} notes · shared demo</p>
              {pct != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
              )}
            </div>
          </div>
        )}

        {/* Wallet with no local key (Freighter / stale identity) can't provision — offer to generate one. */}
        {address && !secret && !prov && (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-sm text-neutral-400">This wallet has no local key, so it can&apos;t provision a session. Generate a session wallet to deploy your own scoped SessionAccount.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button onClick={generate} disabled={connecting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
                <Wallet className="h-4 w-4" /> {connecting ? "Generating…" : "Generate Session Account Wallet"}
              </button>
              <button onClick={disconnect} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.12] px-4 py-3 text-sm font-semibold text-neutral-300 transition hover:border-red-400/40 hover:text-red-300">
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Provision a real per-user SessionAccount (generated wallets only). */}
        {address && secret && (
          prov ? (
            <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.06] p-5">
              <p className="font-semibold text-white">Your Session Account is live</p>
              <p className="mt-1 font-mono text-[11px] text-neutral-400">{prov.sessionId}</p>
              <p className="mt-3 text-xs text-neutral-400">Personal agent token — use as the Bearer to settle through <span className="text-neutral-200">your</span> session:</p>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2">
                <span className="flex-1 truncate font-mono text-[11px] text-accent">{prov.token}</span>
                <CopyBtn text={prov.token} />
              </div>
              <div className="mt-2"><CopyBtn text={`claude mcp add kage --transport http https://kageai.me/mcp/kage --header "Authorization: Bearer ${prov.token}"`} /></div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-sm text-neutral-400">Deploy a scoped SessionAccount owned by <span className="font-mono text-neutral-300">{shortAddr(address)}</span> — only Kage.deposit into the ZK pool, capped. Your agent settles through your own session, not the shared demo.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-500">Spend cap (USDC)
                  <input type="number" min="0" step="1" value={capUsdc} onChange={(e) => setCapUsdc(e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-accent/60" />
                </label>
                <label className="text-xs text-neutral-500">Fund with (USDC)
                  <input type="number" min="0" step="0.5" value={fundUsdc} onChange={(e) => setFundUsdc(e.target.value)} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-accent/60" />
                </label>
              </div>
              <button onClick={provision} disabled={provBusy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
                <KeyRound className="h-4 w-4" /> {provBusy ? "Provisioning on-chain… (~30s)" : "Provision Session Account"}
              </button>
            </div>
          )
        )}
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
