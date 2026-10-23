"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Layers, Activity, KeyRound, Lock, Clock, Wallet, Eye, EyeOff, ShieldCheck, Coins, Server, ExternalLink } from "lucide-react";
import { Panel, CopyBtn } from "./ui";
import { checkPlan, signPlan, PlanRejected, type ProvisionPlan } from "@/lib/session-sign";
import { BUILTIN_MCPS } from "@/lib/builtin-catalog";
import { BUILTIN_WORKFLOWS } from "@/lib/builtin-workflows";
import { SendXlm } from "./send-xlm";
import { canForgetGenerated } from "@/lib/wallet-store";
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

type PoolActivity = { ok: boolean; deposits: number; withdrawals: number; recent: { type: "deposit" | "withdraw"; at: string; ref: string; link: string }[] };

const xlm = (raw: string | number | null | undefined) => (raw == null ? "—" : `${(Number(raw) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM`);
// The network the agent fabric (which creates agent accounts) runs on.
const FABRIC_NETWORK = process.env.NEXT_PUBLIC_FABRIC_NETWORK === "testnet" ? "testnet" : "mainnet";
const TOOL_COUNT = new Set(BUILTIN_MCPS.flatMap((m) => [...m.tools, ...m.workflows])).size;
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};
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
        <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Paid API calls</p></div>
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
          <p className="py-3 text-sm text-neutral-500">No paid calls in this window. When an AI agent pays to use an API you published, the call shows up here.</p>
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
  const canForgetGen = confirming === "generated" && canForgetGenerated(genSecret, typed);

  const row = (kind: WalletKind, label: string, addr: string | null) => {
    const isActive = active === kind;
    return (
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${isActive ? "border-accent/40 bg-accent/[0.06]" : "border-white/[0.08] bg-white/[0.02]"}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-accent" : addr ? "bg-neutral-500" : "bg-neutral-700"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{label}{isActive && <span className="ml-2 text-[11px] font-medium text-accent">active</span>}</p>
          {addr ? (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
              <span title={addr}>{short(addr)}</span>
              <CopyBtn text={addr} />
            </p>
          ) : (
            <p className="font-mono text-[11px] text-neutral-500">not added</p>
          )}
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
            This does not touch the chain: any XLM stays at <span className="font-mono text-neutral-300">{short(generated)}</span>. But this browser holds the only copy of its key, so without your saved secret the funds are unreachable. To confirm you saved it, type the <span className="text-neutral-200">last 4 characters</span> of the secret key.
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
  const [pool, setPool] = useState<PoolActivity | null>(null);
  const { address, secret, connecting, connect, generate, generated } = useWallet();
  const { network, net } = useNetwork();
  useEffect(() => {
    fetch(`/api/stats?network=${network}${address ? `&owner=${address}` : ""}`).then((r) => r.json()).then(setS).catch(() => {});
    setPool(null);
    fetch(`/api/pool-activity?network=${network}`).then((r) => r.json()).then(setPool).catch(() => setPool({ ok: false, deposits: 0, withdrawals: 0, recent: [] }));
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
  const [capXlm, setCapXlm] = useState("5");
  const [fundXlm, setFundXlm] = useState("1");
  // Step 1 fetches a plan and shows it; step 2 signs it here and sends only the signatures.
  const [plan, setPlan] = useState<{ plan: ProvisionPlan; lines: string[] } | null>(null);
  const [provErr, setProvErr] = useState<string | null>(null);
  useEffect(() => {
    const t = localStorage.getItem("kage_session_token"); const sid = localStorage.getItem("kage_session_id");
    if (t && sid) setProv({ token: t, sessionId: sid });
  }, []);
  // The per-user session belongs to the generated wallet; drop it when that wallet goes.
  useEffect(() => { if (!generated) setProv(null); }, [generated]);
  useEffect(() => { setPlan(null); setProvErr(null); }, [address, network]);
  const toStroops = (v: string) => BigInt(Math.max(0, Math.round(Number(v || "0") * 1e7)));
  const post = async (body: unknown) => {
    const r = await fetch("/api/fabric/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
    return d;
  };
  const prepare = async () => {
    if (!address) return;
    setProvBusy(true); setProvErr(null); setPlan(null);
    try {
      const cap = toStroops(capXlm);
      const fund = toStroops(fundXlm);
      const d = await post({ step: "prepare", ownerAddress: address, cap: cap.toString(), amount: fund.toString() });
      const lines = checkPlan(d.plan, { owner: address, pool: net.pool, token: net.xlmSac, cap, fund, network });
      setPlan({ plan: d.plan, lines });
    } catch (e) {
      setProvErr(e instanceof PlanRejected ? `Refused to sign: ${e.message}` : `Setup failed: ${(e as Error).message}`);
    } finally { setProvBusy(false); }
  };
  const approve = async () => {
    if (!plan || !secret) return;
    setProvBusy(true); setProvErr(null);
    try {
      const signed = await signPlan(plan.plan, secret, net.passphrase);
      const d = await post({ step: "finish", id: plan.plan.id, signed });
      setProv({ sessionId: d.sessionId, token: d.token });
      localStorage.setItem("kage_session_token", d.token);
      localStorage.setItem("kage_session_id", d.sessionId);
      setPlan(null);
    } catch (e) {
      setProvErr(`Setup failed: ${(e as Error).message}`);
    } finally { setProvBusy(false); }
  };

  const t = s?.totals;
  const [poolXlm, setPoolXlm] = useState<string | null>(null);
  useEffect(() => {
    setPoolXlm(null);
    fetch(`/api/catalog/kage-pool?network=${network}`).then((r) => r.json()).then((d) => setPoolXlm(d.ok && d.data.xlmInPool != null ? `${d.data.xlmInPool.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM` : "—")).catch(() => setPoolXlm("—"));
  }, [network]);
  const sess = s?.session;
  const cap = sess?.cap ? Number(sess.cap) : null;
  const remaining = sess?.remaining ? Number(sess.remaining) : null;
  const pct = cap && remaining != null ? Math.max(0, Math.min(100, (remaining / cap) * 100)) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Your wallet, your AI agent&apos;s spending account, and the Kage pool on Stellar {network}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ShieldCheck} label="Private payments" value={pool?.ok ? pool.deposits : "…"} sub={pool?.ok ? `${pool.withdrawals} paid out · checked on chain` : "reading the pool…"} />
        <Stat icon={Coins} label="Held in the pool" value={poolXlm ?? "…"} sub={`${sess?.poolLeafCount ?? 0} of 1,024 slots used`} />
        <Stat icon={Server} label="Free Stellar tools" value={TOOL_COUNT} sub={`${BUILTIN_MCPS.length} MCP servers · ${BUILTIN_WORKFLOWS.length} workflows`} />
        <Stat icon={Layers} label="Your APIs" value={t?.apis ?? "…"} sub={t && t.apis > 0 ? `${t.requests} calls · $${t.earnings.toFixed(2)} earned` : "publish one to get paid per call"} />
      </div>

      {/* Wallet + the agent's scoped SessionAccount */}
      <Panel className="scroll-mt-20" id="wallet">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <p className="text-lg font-semibold text-white">Wallet &amp; agent account</p>
          {sess?.live && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">live</span>}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Your AI agent pays from its own limited account: only into the Kage pool, up to a limit you set, until a date you set. Your secret key never leaves this browser. <span className="inline-flex items-center gap-1 text-accent"><Lock className="h-3 w-3" /> you keep the key</span>
        </p>
        {/* One-time secret reveal for a freshly generated wallet */}
        {secret && (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="text-xs font-semibold text-amber-300">Save your secret key. This browser holds the only copy, so import it into Freighter or write it down to keep control of this wallet.</p>
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
              <Wallet className="h-4 w-4" /> {connecting ? "Generating…" : "Create a wallet in this browser"}
            </button>
            <button onClick={connect} disabled={connecting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.12] px-4 py-3 text-sm font-semibold text-neutral-300 transition hover:border-accent/40 hover:text-white">
              Connect Freighter
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-xs text-neutral-500">Your wallet balance</p>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1.5">
                <span className="flex-1 truncate font-mono text-[11px] text-neutral-300" title={address}>{address}</span>
                <CopyBtn text={address} />
              </div>
              <p className="mt-1 text-[10px] text-neutral-600">Your public address. Share it, or send XLM here to fund this wallet.</p>
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
              <p className="text-xs text-neutral-500">{network === "mainnet" ? "Shared demo agent account" : "Testnet pool"} {sess?.live && <span className="text-accent">· live</span>}</p>
              <p className="mt-0.5 text-2xl font-semibold text-white">{network === "mainnet" ? (remaining != null ? `${xlm(remaining)} left` : "—") : `${sess?.poolLeafCount ?? 0} payments`}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{network === "mainnet" ? `of a ${cap != null ? xlm(cap) : "—"} limit · used by the demo agent` : "the shared demo agent runs on mainnet"}</p>
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
            Agent accounts are created from the wallet generated in this browser. {generated ? "Switch to it above to create one." : "Generate one above to create an agent account."}
          </p>
        )}

        {/* Session provisioning runs through the fabric, which is deployed on mainnet. */}
        {address && secret && network !== FABRIC_NETWORK && (
          <p className="mt-3 text-xs text-neutral-500">Agent accounts are created on {FABRIC_NETWORK} for now. Switch networks to create one; here you can fund this wallet and send test XLM.</p>
        )}

        {/* Provision a real per-user SessionAccount (generated wallets only). */}
        {address && secret && network === FABRIC_NETWORK && (
          prov ? (
            <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.06] p-5">
              <p className="font-semibold text-white">Your agent account is live</p>
              <p className="mt-1 font-mono text-[11px] text-neutral-400">{prov.sessionId}</p>
              <p className="mt-3 text-xs text-neutral-400">Your agent&apos;s token. Give it to your AI assistant so it pays from <span className="text-neutral-200">your</span> agent account:</p>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2">
                <span className="flex-1 truncate font-mono text-[11px] text-accent">{prov.token}</span>
                <CopyBtn text={prov.token} />
              </div>
              <div className="mt-2"><CopyBtn text={`claude mcp add kage --transport http https://kageai.me/mcp/kage --header "Authorization: Bearer ${prov.token}"`} /></div>
              <button
                onClick={() => { setProv(null); localStorage.removeItem("kage_session_token"); localStorage.removeItem("kage_session_id"); }}
                className="mt-3 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
              >
                Create a new agent account (different limits)
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-sm text-neutral-400">Give your AI agent its own spending account, owned by <span className="font-mono text-neutral-300">{shortAddr(address)}</span>. It can only pay into the Kage pool, never more than the limit, and stops after 30 days. Kage pays the network fees.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-500">Spending limit (XLM)
                  <input type="number" min="0" step="1" value={capXlm} onChange={(e) => { setCapXlm(e.target.value); setPlan(null); }} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-accent/60" />
                </label>
                <label className="text-xs text-neutral-500">Starting balance (XLM)
                  <input type="number" min="0" step="0.5" value={fundXlm} onChange={(e) => { setFundXlm(e.target.value); setPlan(null); }} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-accent/60" />
                </label>
              </div>
              {!plan ? (
                <button onClick={prepare} disabled={provBusy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
                  <KeyRound className="h-4 w-4" /> {provBusy ? "Preparing…" : "Review agent account"}
                </button>
              ) : (
                <div className="mt-3 rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
                  <p className="text-xs font-semibold text-white">You&apos;re about to approve, with your key, in this browser:</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-neutral-300">
                    {plan.lines.map((l) => <li key={l}>{l}</li>)}
                  </ol>
                  <p className="mt-2 text-[11px] text-neutral-500">Only these two signed approvals are sent. Your secret key is not.</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={approve} disabled={provBusy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60">
                      {provBusy ? "Setting up on chain… (~30s)" : "Approve and create"}
                    </button>
                    <button onClick={() => setPlan(null)} disabled={provBusy} className="rounded-xl px-4 py-2.5 text-sm text-neutral-400 hover:text-white">Cancel</button>
                  </div>
                </div>
              )}
              {provErr && <p className="mt-2 text-xs text-red-400">{provErr}</p>}
            </div>
          )
        )}
      </Panel>

      {/* Send XLM from the active wallet */}
      <SendXlm />

      <RequestLogs />

      {/* Latest pool activity, read from the chain's event history */}
      <Panel>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <p className="font-semibold text-white">Latest pool activity</p>
          <span className="text-xs text-neutral-500">public on {network}</span>
        </div>
        <div className="mt-4 divide-y divide-white/[0.06]">
          {pool === null ? (
            <p className="py-3 text-sm text-neutral-500">Reading the chain…</p>
          ) : !pool.ok ? (
            <p className="py-3 text-sm text-neutral-500">The event index is unreachable right now.</p>
          ) : pool.recent.length === 0 ? (
            <p className="py-3 text-sm text-neutral-500">No payments in this pool yet.</p>
          ) : (
            pool.recent.map((a) => (
              <a key={a.link + a.ref} href={a.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 text-sm hover:bg-white/[0.02]">
                <span className={`w-24 shrink-0 text-xs font-medium ${a.type === "deposit" ? "text-accent" : "text-sky-400"}`}>{a.type === "deposit" ? "Paid in" : "Paid out"}</span>
                <span className="flex-1 truncate font-mono text-xs text-neutral-400">{a.type === "deposit" ? "note" : "spent note"} {a.ref ? `${a.ref.slice(0, 10)}…${a.ref.slice(-8)}` : ""}</span>
                <span className="w-24 shrink-0 text-right text-xs text-neutral-500">{ago(a.at)}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
              </a>
            ))
          )}
        </div>
        <p className="mt-3 text-[11px] text-neutral-600">Anyone can see that a payment went in or out. No row says who paid whom, and no payout says which payment it spends.</p>
      </Panel>
    </div>
  );
}
