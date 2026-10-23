"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Layers, Activity, CheckCircle2, DollarSign, KeyRound, Lock, Clock, Wallet, Eye, EyeOff } from "lucide-react";
import { Panel, usdc, CopyBtn } from "./ui";
import { SendXlm } from "./send-xlm";
import { useWallet, type WalletKind } from "@/lib/wallet";
import { useNetwork } from "@/lib/network";

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
const PERIODS = [{ k: "all", label: "All" }, { k: "30d", label: "30d" }, { k: "7d", label: "7d" }];

function RequestLogs() {
  const [period, setPeriod] = useState("all");
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [stats, setStats] = useState<LogStats | null>(null);
  useEffect(() => {
    fetch(`/api/logs?period=${period}`).then((r) => r.json()).then((d) => { setLogs(d.logs ?? []); setStats(d.stats ?? null); }).catch(() => setLogs([]));
  }, [period]);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Recent requests</p></div>
        <div className="flex gap-1 rounded-lg border border-white/[0.08] p-0.5">
          {PERIODS.map((p) => (
            <button key={p.k} onClick={() => setPeriod(p.k)} className={`rounded-md px-2.5 py-1 text-xs transition ${period === p.k ? "bg-accent/15 text-accent" : "text-neutral-500 hover:text-neutral-300"}`}>{p.label}</button>
          ))}
        </div>
      </div>

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

// Both wallets side by side: pick the active one, add the missing one, or forget one
// from this browser. Nothing here touches the chain — forgetting a wallet only drops it
// from local storage; the funds stay at the address.
function WalletSwitcher() {
  const { active, generated, freighter, secret, connecting, connect, generate, select, forget } = useWallet();
  const [confirming, setConfirming] = useState<WalletKind | null>(null);
  const [typed, setTyped] = useState("");
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const genSecret = active === "generated" ? secret : null;
  // Forgetting the generated wallet deletes its only copy in this browser, so the user
  // must type the last 4 characters of the secret — proof they saved it somewhere.
  const need = genSecret ? genSecret.slice(-4) : "";
  const canForgetGen = confirming === "generated" && !!need && typed.trim().toUpperCase() === need.toUpperCase();

  const row = (kind: WalletKind, label: string, addr: string | null) => {
    const isActive = active === kind;
    return (
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${isActive ? "border-accent/40 bg-accent/[0.06]" : "border-white/[0.08] bg-white/[0.02]"}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-accent" : addr ? "bg-neutral-500" : "bg-neutral-700"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{label}{isActive && <span className="ml-2 text-[11px] font-medium text-accent">active</span>}</p>
          <p className="font-mono text-[11px] text-neutral-500">{addr ? short(addr) : "not added"}</p>
        </div>
        {addr ? (
          <div className="flex items-center gap-2">
            {!isActive && (
              <button onClick={() => select(kind)} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-accent/40 hover:text-white">Use this wallet</button>
            )}
            <button
              onClick={() => {
                if (kind === "freighter") { forget("freighter"); return; }
                if (!isActive) { select("generated"); }
                setTyped(""); setConfirming("generated");
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:text-red-300"
            >
              {kind === "freighter" ? "Disconnect" : "Remove"}
            </button>
          </div>
        ) : kind === "freighter" ? (
          <button onClick={connect} disabled={connecting} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-accent/40 hover:text-white disabled:opacity-60">Connect Freighter</button>
        ) : (
          <button onClick={generate} disabled={connecting} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-accent/40 hover:text-white disabled:opacity-60">{connecting ? "Generating…" : "Generate wallet"}</button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Wallets</p>
      {row("generated", "Generated session wallet", generated)}
      {row("freighter", "Freighter", freighter)}
      {confirming === "generated" && generated && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/[0.05] p-4">
          <p className="text-sm font-semibold text-red-200">Remove the generated wallet from this browser?</p>
          <p className="mt-1 text-xs text-neutral-400">
            This does not touch the chain — any XLM stays at <span className="font-mono text-neutral-300">{short(generated)}</span>. But this browser holds the only copy of its key, so without your saved secret the funds are unreachable. To confirm you saved it, type the <span className="text-neutral-200">last 4 characters</span> of the secret key.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="last 4 characters"
              maxLength={4}
              aria-label="Last 4 characters of the secret key"
              className="w-full rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-red-400/50 sm:w-44"
            />
            <button
              onClick={() => { forget("generated"); setConfirming(null); setTyped(""); }}
              disabled={!canForgetGen}
              className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove wallet
            </button>
            <button onClick={() => { setConfirming(null); setTyped(""); }} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardHome() {
  const [s, setS] = useState<Stats | null>(null);
  const [act, setAct] = useState<ActItem[] | null>(null);
  const { address, secret, connecting, connect, generate, generated } = useWallet();
  const { network, net } = useNetwork();
  useEffect(() => {
    fetch(`/api/stats?network=${network}${address ? `&owner=${address}` : ""}`).then((r) => r.json()).then(setS).catch(() => {});
    fetch("/api/activity").then((r) => r.json()).then((d) => setAct(d.activity ?? [])).catch(() => setAct([]));
  }, [address, network]);
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const [showSec, setShowSec] = useState(false);
  const [wstat, setWstat] = useState<{ funded: boolean; xlm: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!address) return;
    fetch(`/api/wallet-status?network=${network}&address=${address}`).then((r) => r.json()).then((d) => setWstat(d.ok ? { funded: d.funded, xlm: d.xlm } : null)).catch(() => setWstat(null));
  }, [address, network, refresh]);

  // Testnet only: free test XLM from friendbot, then re-read the balance.
  const [fbBusy, setFbBusy] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const friendbot = async () => {
    if (!address) return;
    setFbBusy(true); setFbMsg(null);
    try {
      const d = await (await fetch("/api/friendbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) })).json();
      setFbMsg(d.ok ? (d.alreadyFunded ? "Already funded on testnet." : "Funded with 10,000 test XLM.") : `Friendbot failed: ${d.error}`);
      setRefresh((n) => n + 1);
    } catch (e) { setFbMsg(`Friendbot failed: ${String((e as Error).message)}`); } finally { setFbBusy(false); }
  };

  // Per-user session provisioning (only for generated wallets, whose secret we hold).
  const [prov, setProv] = useState<{ sessionId: string; token: string } | null>(null);
  const [provBusy, setProvBusy] = useState(false);
  const [capUsdc, setCapUsdc] = useState("5");
  const [fundUsdc, setFundUsdc] = useState("1");
  useEffect(() => {
    const t = localStorage.getItem("kage_session_token"); const sid = localStorage.getItem("kage_session_id");
    if (t && sid) setProv({ token: t, sessionId: sid });
  }, []);
  // The per-user session belongs to the generated wallet; drop it when that wallet goes.
  useEffect(() => { if (!generated) setProv(null); }, [generated]);
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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Your APIs, agent session and payments on Stellar {network}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Layers} label="Total APIs" value={t?.apis ?? "—"} sub="x402 payment-gated proxies" />
        <Stat icon={Activity} label="Total Requests" value={t?.requests ?? "—"} sub="all-time API calls" />
        <Stat icon={CheckCircle2} label="Success Rate" value={t ? `${t.successRate}%` : "—"} sub={`${t?.success ?? 0} successful`} />
        <Stat icon={DollarSign} label="Total Earnings" value={t ? `$${t.earnings.toFixed(2)}` : "—"} sub="USDC earned" />
      </div>

      {/* x402 Payments — Kage's scoped SessionAccount (the ZK equivalent of a smart account) */}
      <Panel className="scroll-mt-20" id="wallet">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <p className="text-lg font-semibold text-white">Wallet &amp; agent session</p>
          {sess?.live && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">live</span>}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Your agent pays through a scoped SessionAccount — only into the ZK pool, up to a cap, before an expiry. <span className="inline-flex items-center gap-1 text-accent"><Lock className="h-3 w-3" /> zero custody</span>
        </p>
        {/* One-time secret reveal for a freshly generated wallet */}
        {secret && (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="text-xs font-semibold text-amber-300">Save your secret key. This browser holds the only copy — import it into Freighter to keep control of this wallet.</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2">
              <span className="flex-1 truncate font-mono text-[11px] text-neutral-200">{showSec ? secret : "•".repeat(56)}</span>
              <button onClick={() => setShowSec((v) => !v)} className="text-neutral-400 hover:text-white" title={showSec ? "Hide" : "Reveal"}>{showSec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              <CopyBtn text={secret} />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Hidden by default (safe to screen-share). Reveal to view, or copy directly. Fund it by sending XLM to this address.</p>
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
              <p className="mt-1 text-[11px] text-neutral-500">{wstat?.funded ? `funded on ${network}` : `not funded on ${network} yet`}</p>
              {net.friendbot && wstat && !wstat.funded && (
                <button onClick={friendbot} disabled={fbBusy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
                  {fbBusy ? "Funding…" : "Get free test XLM"}
                </button>
              )}
              {fbMsg && <p className="mt-2 text-[11px] text-neutral-400">{fbMsg}</p>}
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-xs text-neutral-500">{network === "mainnet" ? "Demo agent session" : "Testnet pool"} {sess?.live && <span className="text-accent">· live</span>}</p>
              <p className="mt-0.5 text-2xl font-semibold text-white">{network === "mainnet" ? (remaining != null ? usdc(remaining) : "—") : `${sess?.poolLeafCount ?? 0} notes`}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{network === "mainnet" ? `of ${cap != null ? usdc(cap) : "—"} cap · ${sess?.poolLeafCount ?? 0} notes · shared demo` : "the shared demo session runs on mainnet"}</p>
              {pct != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
              )}
            </div>
          </div>
        )}

        {address && <WalletSwitcher />}

        {/* Freighter keeps its key in the extension, so provisioning runs from the generated wallet. */}
        {address && !secret && !prov && (
          <p className="mt-3 text-xs text-neutral-500">
            Provisioning your own SessionAccount runs from the generated session wallet. {generated ? "Switch to it above to provision." : "Generate one above to deploy a scoped SessionAccount."}
          </p>
        )}

        {/* Session provisioning runs through the fabric, which is deployed on mainnet. */}
        {address && secret && network === "testnet" && (
          <p className="mt-3 text-xs text-neutral-500">Provisioning a SessionAccount runs on mainnet for now. Switch to Mainnet to provision; on testnet you can fund this wallet and send test XLM.</p>
        )}

        {/* Provision a real per-user SessionAccount (generated wallets only). */}
        {address && secret && network === "mainnet" && (
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
              <button
                onClick={() => { setProv(null); localStorage.removeItem("kage_session_token"); localStorage.removeItem("kage_session_id"); }}
                className="mt-3 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
              >
                Provision a new session (different limits)
              </button>
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

      {/* White Belt: Send XLM — simple mainnet transaction with success/failure feedback */}
      <SendXlm />

      <RequestLogs />

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
