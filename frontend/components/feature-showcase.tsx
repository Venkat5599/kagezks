"use client";

import { motion } from "motion/react";
import {
  KeyRound,
  Layers,
  BadgeCheck,
  Banknote,
  Radio,
  CheckCircle2,
  XCircle,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const ease = [0.23, 1, 0.32, 1] as const;

// Real on-chain values from the proven e2e deposit/withdraw (illustrative UI).
const NOTE = {
  scanPub: "b4800dda…95b12762",
  ephemeral: "0bbeaae7…e3446f53",
  commitment: "057206e8…2b8466a7",
  nullifier: "29ac5fdb…06567b77",
  root: "02c0566a…5810ad36",
  stealth: "GABNZK3P…TIN5M72F",
};

function Row({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-neutral-300">{value}</span>
        {tag && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-neutral-400">{tag}</span>}
      </span>
    </div>
  );
}

function Mock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {children}
    </div>
  );
}

function FeatureBlock({
  eyebrow,
  icon: Icon,
  title,
  mock,
  delay,
}: {
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  mock: ReactNode;
  delay: number;
}): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease, delay }}
      className="flex flex-col rounded-3xl border border-white/[0.08] bg-white/[0.03] p-7 sm:p-8"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" strokeWidth={1.7} />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</span>
      </div>
      <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
        {title}
      </h3>
      {mock}
    </motion.div>
  );
}

export function FeatureShowcase(): ReactNode {
  return (
    <section className="w-full bg-[#080808] px-6 py-24 sm:py-32" style={{ colorScheme: "dark" }}>
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto max-w-3xl text-center text-3xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          The zero-knowledge, at every step of a payment
        </motion.h2>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {/* 1. STEALTH NOTES */}
          <FeatureBlock
            eyebrow="Stealth notes"
            icon={KeyRound}
            title="Agents pay without ever naming the payee"
            delay={0}
            mock={
              <Mock>
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
                  <span className="text-sm font-medium text-white">Note for one payee</span>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">derived</span>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  <Row label="Recipient scan key" value={NOTE.scanPub} />
                  <Row label="Ephemeral key R" value={NOTE.ephemeral} tag="announced" />
                  <Row label="Commitment" value={NOTE.commitment} tag="on-chain" />
                </div>
                <p className="mt-3 text-[11px] text-neutral-400">
                  Only the scan-key holder recomputes the shared secret and finds their payment.
                </p>
              </Mock>
            }
          />

          {/* 2. SHIELDED POOL */}
          <FeatureBlock
            eyebrow="Shielded pool"
            icon={Layers}
            title="Deposits and withdrawals no one can link"
            delay={0.08}
            mock={
              <Mock>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                    Veil pool
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                      <Radio className="h-3 w-3" /> testnet
                    </span>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
                    <p className="text-[11px] text-neutral-400">Notes in pool</p>
                    <p className="mt-0.5 text-xl font-semibold text-white">1</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
                    <p className="text-[11px] text-neutral-400">Tree depth</p>
                    <p className="mt-0.5 text-xl font-semibold text-white">10</p>
                  </div>
                </div>
                <div className="mt-1 divide-y divide-white/[0.06]">
                  <Row label="Merkle root" value={NOTE.root} tag="on-chain" />
                  <Row label="Commitment" value={NOTE.commitment} tag="unlinked" />
                </div>
              </Mock>
            }
          />

          {/* 3. ZERO-KNOWLEDGE WITHDRAWAL */}
          <FeatureBlock
            eyebrow="Zero-knowledge withdrawal"
            icon={BadgeCheck}
            title="Prove you own a note without revealing which"
            delay={0}
            mock={
              <Mock>
                <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
                  <span className="text-sm font-medium text-white">Membership proof</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" /> verified · BN254
                  </span>
                </div>
                <div className="mt-1 divide-y divide-white/[0.06]">
                  <Row label="Root" value={NOTE.root} />
                  <Row label="Nullifier hash" value={NOTE.nullifier} tag="spent" />
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-red-500/10 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-red-400">
                    <XCircle className="h-4 w-4" /> Replay the same nullifier
                  </span>
                  <span className="text-[11px] font-medium text-red-400">rejected · NullifierUsed</span>
                </div>
              </Mock>
            }
          />

          {/* 4. STEALTH PAYOUT */}
          <FeatureBlock
            eyebrow="Stealth payout"
            icon={Banknote}
            title="Funds land at a fresh one-time address"
            delay={0.08}
            mock={
              <Mock>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.04] p-4">
                  <div>
                    <p className="text-[11px] text-neutral-400">Paid out</p>
                    <p className="text-2xl font-semibold tracking-tight text-white">
                      1.00 <span className="text-base font-medium text-neutral-400">USDC</span>
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-neutral-300" />
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] text-neutral-400">Stealth address</p>
                    <p className="truncate font-mono text-xs text-white">{NOTE.stealth}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                    <BadgeCheck className="h-3.5 w-3.5" /> Unlinkable
                  </span>
                  <span className="text-[11px] text-neutral-400">no history · no agent link</span>
                </div>
              </Mock>
            }
          />
        </div>
      </div>
    </section>
  );
}
