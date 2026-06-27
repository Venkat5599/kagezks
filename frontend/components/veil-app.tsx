"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Eye,
  Send,
  Inbox,
  ExternalLink,
  Lock,
  ShieldCheck,
  EyeOff,
  Radio,
} from "lucide-react";

type Data = {
  network: string;
  contract_id: string;
  explorer_contract: string;
  deposit_tx: string;
  withdraw_tx: string;
  amount_display: string;
  commitment: string;
  ephemeral_pubkey: string;
  new_root: string;
  nullifier_hash: string;
  stealth_payout: string;
  double_spend: string;
};

const tabs = [
  { key: "public", label: "Public", icon: Eye },
  { key: "send", label: "Send", icon: Send },
  { key: "receive", label: "Receive", icon: Inbox },
] as const;
type TabKey = (typeof tabs)[number]["key"];

const short = (s: string, head = 10, tail = 8) =>
  s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 bg-white/60 p-6 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] ${className}`}
    >
      {children}
    </div>
  );
}
function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-sm break-all">{children}</span>;
}
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs text-neutral-500">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

type Live = { live: boolean; current_root?: string; leaf_count?: number };

export function VeilApp(): ReactNode {
  const [data, setData] = useState<Data | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [tab, setTab] = useState<TabKey>("public");

  useEffect(() => {
    fetch("/veil.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
    fetch("/api/status")
      .then((r) => r.json())
      .then(setLive)
      .catch(() => setLive({ live: false }));
  }, []);

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-neutral-500">
        Loading on-chain state…
      </div>
    );
  }

  return (
    <section id="app" className="mx-auto max-w-3xl px-6 py-16">
      <div className="mx-auto mb-8 flex w-fit items-center gap-1 rounded-2xl border border-black/10 bg-white/60 p-1 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        {/* PUBLIC — what the chain reveals (almost nothing) */}
        {tab === "public" && (
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm text-neutral-500">
                  Shielded pool
                  <span className="inline-flex items-center gap-1 text-accent">
                    <Radio className="h-3 w-3 animate-pulse" /> live
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <ShieldCheck className="h-7 w-7 text-accent" />
                  <span className="text-3xl font-semibold tracking-tight">Private by default</span>
                </div>
              </div>
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                {data.network}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pool contract" value={<Mono>{short(data.contract_id, 8, 6)}</Mono>} />
              <Field
                label={live?.live ? "Notes in pool (read live on-chain)" : "Note value"}
                value={
                  live?.live ? (
                    <span className="text-xl font-semibold">{live.leaf_count}</span>
                  ) : (
                    <span className="text-xl font-semibold">{data.amount_display} <span className="text-sm text-neutral-500">USDC</span></span>
                  )
                }
              />
            </div>

            <div className="mt-4">
              <Field
                label={live?.live ? "Pool Merkle root (read live on-chain)" : "Pool Merkle root (only public state)"}
                value={<Mono>{live?.live && live.current_root ? live.current_root : data.new_root}</Mono>}
              />
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-sm">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                The chain sees a commitment, a random ephemeral key, a Merkle root, and a
                nullifier hash. <strong>Never</strong> who paid whom, the amount tied to an
                identity, or which deposit funded which withdrawal.
              </span>
            </div>

            <div className="mt-6 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Proven on testnet
              </p>
              <a href={data.deposit_tx} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <span><strong>Deposit</strong> — insert proof verified on-chain (BN254)</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
              <a href={data.withdraw_tx} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <span><strong>Withdraw</strong> — membership proof, paid to a stealth address</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
              <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                <span><strong>Double-spend</strong> — {data.double_spend}</span>
                <Lock className="h-4 w-4 shrink-0" />
              </div>
            </div>

            <a href={data.explorer_contract} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
              View contract <ExternalLink className="h-4 w-4" />
            </a>
          </Card>
        )}

        {/* SEND — sender derives a stealth note via ECDH */}
        {tab === "send" && (
          <Card>
            <p className="text-sm text-neutral-500">
              Pay a recipient from their published meta-address. Only they can find or spend
              the note — the chain learns nothing about who you paid.
            </p>
            <ol className="mt-5 space-y-3">
              {[
                "Pick an ephemeral key r, ECDH with the recipient's scan key V → shared = r·V",
                "Derive the note secrets from shared; commitment = Poseidon(amount, secret, nullifier)",
                "deposit() inserts the commitment (with a ZK insert proof) and pulls USDC",
                "Announce only the ephemeral key R — the recipient scans for it later",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 space-y-3">
              <Field label="Commitment inserted (this demo payment)" value={<Mono>{data.commitment}</Mono>} />
              <Field label="Ephemeral pubkey announced" value={<Mono>{data.ephemeral_pubkey}</Mono>} />
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm">
              <EyeOff className="h-4 w-4 shrink-0 text-accent" />
              <span>The recipient address never appears on chain. Only this random-looking commitment does.</span>
            </div>
          </Card>
        )}

        {/* RECEIVE — recipient scans + withdraws to a stealth address */}
        {tab === "receive" && (
          <Card>
            <p className="text-sm text-neutral-500">
              Scan announcements with your scan key, recognise notes meant for you, then
              withdraw to a one-time stealth address — proving ownership in zero knowledge.
            </p>
            <ol className="mt-5 space-y-3">
              {[
                "Recompute shared = v·R from each announced ephemeral key R",
                "Re-derive the note; if its commitment is in the tree, the payment is yours",
                "Prove in ZK: you own an unspent leaf (membership + fresh nullifier) — without revealing which",
                "withdraw() pays a stealth address bound into the proof (keccak(address))",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 space-y-3">
              <Field label="Stealth payout address (one-time)" value={<Mono>{data.stealth_payout}</Mono>} />
              <Field label="Nullifier hash (burned on spend)" value={<Mono>{data.nullifier_hash}</Mono>} />
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span>
                The withdrawal proof carries no link to the deposit. Spend the same note twice
                and the contract rejects it — {data.double_spend}.
              </span>
            </div>

            <a href={data.withdraw_tx} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
              View this withdrawal <ExternalLink className="h-4 w-4" />
            </a>
          </Card>
        )}
      </motion.div>
    </section>
  );
}
