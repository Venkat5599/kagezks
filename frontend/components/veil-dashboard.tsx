"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Trees,
  Hash,
  KeyRound,
  Cpu,
  LayoutDashboard,
  ListTree,
  GitBranch,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { VeilActions } from "@/components/veil-actions";
import { VeilMark } from "@/components/veil-logo";
import { Loader2 } from "lucide-react";
import { requestAccess, getAddress } from "@stellar/freighter-api";

type Proven = { step: string; result: string; detail: string; tx: string | null };
type VeilData = {
  network: string;
  contractId: string;
  usdcSac: string;
  explorer: { contract: string; depositTx: string; withdrawTx: string };
  proven: Proven[];
  onchainNote: {
    amount: string;
    leafIndex: number;
    emptyRoot: string;
    newRoot: string;
    commitment: string;
    ephemeralPub: string;
    nullifierHash: string;
    recipientField: string;
    stealthAddress: string;
  };
  circuits: {
    withdraw: { constraints: number; public: string[]; private: string[] };
    insert: { constraints: number; public: string[]; private: string[] };
    depth: number;
    scheme: string;
    hash: string;
    ptau: string;
  };
};
type Live = {
  live: boolean;
  currentRoot?: string;
  leafCount?: number;
  provenNullifierSpent?: boolean;
  usdcPooled?: string | null;
  commitment?: string;
  ephemeralPub?: string;
  amount?: string;
  nullifierHash?: string;
};

const short = (s: string, head = 10, tail = 8) =>
  s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
const usdc = (raw: string) => `${(Number(raw) / 1e7).toFixed(2)} USDC`;

type SectionKey = "overview" | "use" | "ledger" | "proven" | "views" | "circuits" | "agent";
const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "use", label: "Connect & pay", icon: Wallet },
  { key: "ledger", label: "Pool ledger", icon: ListTree },
  { key: "proven", label: "Proven flow", icon: GitBranch },
  { key: "views", label: "Chain vs private", icon: Eye },
  { key: "agent", label: "Agent fabric", icon: Users },
  { key: "circuits", label: "The ZK", icon: Cpu },
];

// Double-bezel: an outer "tray" with a recessed inner core for machined depth.
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-[1.75rem] border border-black/[0.05] bg-black/[0.03] p-1.5 dark:border-white/[0.06] dark:bg-white/[0.05]">
      <div
        className={`rounded-[1.4rem] bg-white/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/[0.04] backdrop-blur-xl dark:bg-[#0b0b0b]/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/[0.05] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all text-neutral-700 sm:text-sm dark:text-neutral-300">{children}</span>;
}
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

export function VeilDashboard(): ReactNode {
  const [data, setData] = useState<VeilData | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [active, setActive] = useState<SectionKey>("overview");
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connectWallet = async () => {
    try {
      setConnecting(true);
      const acc = await requestAccess();
      const addr = typeof acc === "string" ? acc : acc?.address || (await getAddress()).address;
      if (addr) setAddress(addr);
    } catch {
      /* user declined or no wallet */
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    fetch("/veil.json").then((r) => r.json()).then(setData).catch(() => {});
    fetch("/api/veil").then((r) => r.json()).then(setLive).catch(() => setLive({ live: false }));
  }, []);

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-neutral-500">
        Loading on-chain state…
      </div>
    );
  }

  const onchain = live?.live ? live : null;
  const liveOn = Boolean(onchain);
  const cur = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0]!;
  const CurIcon = cur.icon;

  return (
    <div className="[&_svg]:[stroke-width:1.6] lg:flex lg:min-h-[100dvh]">
      {/* FULL-HEIGHT LEFT DOCK */}
      <aside className="border-b border-black/5 bg-white/55 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.015] lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[18rem] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-accent/10 px-3 py-3 ring-1 ring-inset ring-accent/15">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
              <VeilMark className="h-5 w-5 text-black" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight tracking-tight">Veil pool</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                <span className="relative flex h-1.5 w-1.5">
                  {liveOn && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />}
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${liveOn ? "bg-accent" : "bg-neutral-400"}`} />
                </span>
                {liveOn ? "live · testnet" : "connecting…"}
              </p>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = active === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={`group flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${
                    on
                      ? "bg-accent text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                      : "text-neutral-500 hover:bg-black/[0.04] hover:text-foreground dark:text-neutral-400 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${on ? "" : "group-hover:scale-110"}`} strokeWidth={1.6} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <a
            href={data.explorer.contract}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2.5 text-xs text-neutral-500 transition-colors hover:border-accent/40 hover:text-foreground dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-neutral-400 lg:mt-auto"
          >
            <span className="font-mono">{short(data.contractId, 7, 5)}</span>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="min-w-0 flex-1">
        {/* sticky content top bar (replaces the marketing nav) */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/5 bg-background/70 px-6 py-3.5 backdrop-blur-xl dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <CurIcon className="h-[18px] w-[18px] text-accent" strokeWidth={1.7} />
            <span className="text-sm font-semibold tracking-tight">{cur.label}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href={data.explorer.contract}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-full border border-black/[0.07] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] text-neutral-500 transition-colors hover:border-accent/40 hover:text-foreground sm:inline-flex dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-neutral-400"
            >
              {short(data.contractId, 7, 5)} <ExternalLink className="h-3 w-3" strokeWidth={1.7} />
            </a>
            <button
              type="button"
              onClick={connectWallet}
              disabled={connecting}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                address
                  ? "border border-accent/30 bg-accent/10 text-accent"
                  : "bg-accent text-black hover:brightness-105"
              }`}
            >
              {address ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="font-mono">{short(address, 5, 4)}</span>
                </>
              ) : connecting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting
                </>
              ) : (
                <>
                  <Wallet className="h-3.5 w-3.5" /> Connect wallet
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-5"
            >
              {active === "overview" && <Overview data={data} onchain={onchain} liveOn={liveOn} />}
              {active === "use" && <VeilActions address={address} onConnect={setAddress} />}
              {active === "ledger" && <Ledger data={data} onchain={onchain} />}
              {active === "proven" && <ProvenFlow data={data} />}
              {active === "views" && <Views data={data} />}
              {active === "agent" && <AgentFabric />}
              {active === "circuits" && <Circuits data={data} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Overview({ data, onchain, liveOn }: { data: VeilData; onchain: Live | null; liveOn: boolean }) {
  const note = data.onchainNote;
  // prefer live on-chain event values; fall back to the proven-e2e note
  const liveNote = {
    commitment: onchain?.commitment || note.commitment,
    ephemeralPub: onchain?.ephemeralPub || note.ephemeralPub,
    nullifierHash: onchain?.nullifierHash || note.nullifierHash,
  };
  const pooled = onchain?.usdcPooled ? usdc(onchain.usdcPooled) : usdc(note.amount);
  const chainRows = [
    { k: "commitment", v: liveNote.commitment, tag: "leaf" },
    { k: "ephemeral key R", v: liveNote.ephemeralPub, tag: "announce" },
    { k: "nullifier hash", v: liveNote.nullifierHash, tag: "spend tag" },
  ];
  return (
    <Card className="p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-neutral-500">
            Shielded pool — live state
            {liveOn && (
              <span className="inline-flex items-center gap-1 text-accent">
                <Radio className="h-3 w-3 animate-pulse" /> live
              </span>
            )}
          </p>
          <div className="mt-1 flex items-center gap-2.5">
            <ShieldCheck className="h-8 w-8 text-accent" />
            <span className="text-4xl font-semibold tracking-tight">Veil pool</span>
          </div>
        </div>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
          {data.network}
        </span>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Field label="Notes in pool" value={<span className="text-3xl font-semibold">{onchain?.leafCount ?? "—"}</span>} />
        <Field label="USDC pooled" value={<span className="text-3xl font-semibold">{pooled}</span>} />
        <Field
          label="Spend recorded"
          value={
            <span className="inline-flex items-center gap-1.5 text-3xl font-semibold">
              {onchain ? (onchain.provenNullifierSpent ? <><CheckCircle2 className="h-6 w-6 text-accent" /> 1</> : "0") : "—"}
            </span>
          }
        />
        <Field label="Tree depth" value={<span className="text-3xl font-semibold">10</span>} />
      </div>

      <div className="mt-5">
        <Field label="Current Merkle root (read on-chain)" value={<Mono>{onchain?.currentRoot || data.onchainNote.newRoot}</Mono>} />
      </div>

      {/* chain view rows + private payout, side by side, to fill the panel */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5 dark:border-white/5">
            <Eye className="h-4 w-4 text-neutral-400" />
            <span className="text-sm font-medium">What the chain sees</span>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {chainRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs text-neutral-500">{r.k}</span>
                <span className="flex items-center gap-2">
                  <Mono>{short(r.v, 10, 8)}</Mono>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-white/10">{r.tag}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5 dark:border-white/5">
            <KeyRound className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">What only the payee sees</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-neutral-500">Amount</span>
              <span className="text-xl font-semibold">{usdc(note.amount)}</span>
            </div>
            <div>
              <p className="text-xs text-neutral-500">One-time stealth payout</p>
              <Mono>{note.stealthAddress}</Mono>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl bg-accent/10 p-3.5 text-sm">
        <EyeOff className="h-4 w-4 shrink-0 text-accent" />
        <span>The chain stores only this root, commitments and nullifier hashes — never an amount or a payee identity.</span>
      </div>
    </Card>
  );
}

function Ledger({ data, onchain }: { data: VeilData; onchain: Live | null }) {
  const note = data.onchainNote;
  const rows = [
    { k: "commitment", v: note.commitment, tag: "leaf" },
    { k: "ephemeral key R", v: note.ephemeralPub, tag: "announce" },
    { k: "nullifier hash", v: note.nullifierHash, tag: "spend tag" },
    { k: "new root", v: note.newRoot, tag: "root" },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Pool ledger — public</p>
        <span className="font-mono text-xs text-neutral-400">root {short(onchain?.currentRoot ?? note.newRoot, 10, 8)}</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {rows.map((r) => (
            <div key={r.k} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-neutral-500">{r.k}</span>
              <span className="flex items-center gap-2">
                <Mono>{short(r.v, 14, 12)}</Mono>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-white/10">{r.tag}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        This is the entire public record of a payment. No row names a payee, an amount, or the agent.
      </p>
    </Card>
  );
}

function ProvenFlow({ data }: { data: VeilData }) {
  return (
    <Card>
      <p className="text-sm text-neutral-500">Proven end-to-end on testnet</p>
      <ol className="mt-4 space-y-3">
        {data.proven.map((p) => {
          const ok = p.result === "verified";
          return (
            <li key={p.step} className="flex gap-3">
              {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.step}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-accent/15 text-accent" : "bg-amber-500/15 text-amber-600"}`}>{p.result}</span>
                  {p.tx && (
                    <a href={`https://stellar.expert/explorer/testnet/tx/${p.tx}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-accent">
                      tx <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">{p.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Views({ data }: { data: VeilData }) {
  const note = data.onchainNote;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <p className="flex items-center gap-1.5 text-sm font-medium"><Eye className="h-4 w-4 text-neutral-400" /> Chain view (anyone)</p>
        <div className="mt-4 space-y-3">
          <Field label="Commitment (leaf 0)" value={<Mono>{short(note.commitment, 14, 12)}</Mono>} />
          <Field label="Ephemeral key R" value={<Mono>{short(note.ephemeralPub, 14, 12)}</Mono>} />
          <Field label="Nullifier hash" value={<Mono>{short(note.nullifierHash, 14, 12)}</Mono>} />
          <Field label="New root" value={<Mono>{short(note.newRoot, 14, 12)}</Mono>} />
        </div>
        <p className="mt-4 text-xs text-neutral-500">None of this names a payee, an amount tied to a party, or the agent.</p>
      </Card>
      <Card>
        <p className="flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4 text-accent" /> Private view (payee only)</p>
        <div className="mt-4 space-y-3">
          <Field label="Amount" value={<span className="text-xl font-semibold">{usdc(note.amount)}</span>} />
          <Field label="One-time stealth payout" value={<Mono>{note.stealthAddress}</Mono>} />
          <Field label="Recipient field (bound in proof)" value={<Mono>{short(note.recipientField, 14, 12)}</Mono>} />
        </div>
        <p className="mt-4 text-xs text-neutral-500">Only the scan-key holder recomputes the ECDH secret, recognises the note, and spends to an address no one can link back.</p>
      </Card>
    </div>
  );
}

function AgentFabric() {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-accent" />
        <p className="text-lg font-semibold">Autonomy without custody, made private</p>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        The owner delegates a single scoped session key to an agent under an on-chain policy: it may call <span className="font-mono text-neutral-400">Veil.deposit</span> only, move USDC only into the pool, up to a cap, before an expiry. The agent acts on its own key — never the owner&apos;s — so it can never drain or redirect funds, and its one allowed action settles through the ZK pool, hiding who it paid and how much.
      </p>
      <div className="mt-5 rounded-xl bg-black/90 p-4 font-mono text-xs text-neutral-200">
        <p className="text-neutral-400"># deploy a scoped session, delegate an agent key, fund it</p>
        <p>bun run agent:fabric</p>
        <p className="mt-2 text-neutral-400"># the agent then signs a Veil.deposit auth entry with its session key</p>
        <p>__check_auth gates it → any off-policy call reverts (BadPayout / CapExceeded / Expired)</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Scope (can't drain)" value={<span className="text-sm">only Veil.deposit · USDC → pool · cap · expiry</span>} />
        <Field label="Privacy (ZK settled)" value={<span className="text-sm">agent→payee link + amount hidden in the pool</span>} />
      </div>
    </Card>
  );
}

function Circuits({ data }: { data: VeilData }) {
  return (
    <Card>
      <p className="flex items-center gap-1.5 text-sm text-neutral-500"><Cpu className="h-4 w-4" /> The zero-knowledge under it</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-accent" />
            <span className="font-medium">Withdraw circuit</span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{data.circuits.withdraw.constraints.toLocaleString()} constraints</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">public: {data.circuits.withdraw.public.join(", ")}</p>
          <p className="text-xs text-neutral-500">private: {data.circuits.withdraw.private.join(", ")}</p>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Trees className="h-4 w-4 text-accent" />
            <span className="font-medium">Insert circuit</span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{data.circuits.insert.constraints.toLocaleString()} constraints</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">public: {data.circuits.insert.public.join(", ")}</p>
          <p className="text-xs text-neutral-500">private: {data.circuits.insert.private.join(", ")}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Scheme" value={<span className="text-sm font-medium">{data.circuits.scheme}</span>} />
        <Field label="Hash" value={<span className="text-sm font-medium">{data.circuits.hash}</span>} />
        <Field label="Tree depth" value={<span className="text-sm font-medium">{data.circuits.depth} (1024 notes)</span>} />
        <Field label="Trusted setup" value={<span className="text-sm font-medium">{data.circuits.ptau}</span>} />
      </div>
    </Card>
  );
}
