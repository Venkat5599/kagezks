"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Banknote,
  Users,
  Gift,
  EyeOff,
  Network,
  KeySquare,
  Fingerprint,
  Coins,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { VeilMark } from "@/components/veil-logo";

const ease = [0.23, 1, 0.32, 1] as const;

type Node = { icon: LucideIcon; label: string };
type Group = { title: string; icon: LucideIcon; nodes: Node[] };

const GROUPS: Group[] = [
  {
    title: "What the agent sends",
    icon: Banknote,
    nodes: [
      { icon: Banknote, label: "Payments" },
      { icon: Users, label: "Settlements" },
      { icon: Gift, label: "Payouts" },
    ],
  },
  {
    title: "How Veil hides it",
    icon: EyeOff,
    nodes: [
      { icon: KeySquare, label: "Stealth notes" },
      { icon: Network, label: "ZK pool" },
      { icon: Fingerprint, label: "Nullifiers" },
    ],
  },
  {
    title: "What the payee receives",
    icon: Coins,
    nodes: [
      { icon: KeySquare, label: "Stealth address" },
      { icon: Coins, label: "USDC" },
      { icon: Unlink, label: "Unlinkable" },
    ],
  },
];

function GroupCard({ group, delay }: { group: Group; delay: number }): ReactNode {
  const Head = group.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease, delay }}
      className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-center gap-2">
        <Head className="h-4 w-4 text-accent" strokeWidth={1.6} />
        <span className="text-sm font-medium text-neutral-300">{group.title}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {group.nodes.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.label}
              className="group/node flex cursor-default flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-2 py-3.5 text-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.05]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-200 ring-1 ring-inset ring-white/10 transition-colors duration-500 group-hover/node:bg-accent group-hover/node:text-black group-hover/node:ring-accent">
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <span className="text-[11px] font-medium leading-tight text-neutral-400 transition-colors group-hover/node:text-neutral-200">
                {n.label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function Connectors(): ReactNode {
  const reduce = useReducedMotion();
  const paths = [
    "M167 2 C167 60, 500 44, 500 104",
    "M500 2 L500 104",
    "M833 2 C833 60, 500 44, 500 104",
  ];
  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 112" preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id="veil-flow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 20%, transparent)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <g key={i}>
          <motion.path
            id={`veil-p${i}`}
            d={d}
            stroke="url(#veil-flow)"
            strokeWidth="1.5"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1, ease, delay: 0.2 + i * 0.12 }}
          />
          {!reduce && (
            <circle r="2.4" fill="var(--accent)" opacity="0.95">
              <animateMotion dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                <mpath href={`#veil-p${i}`} />
              </animateMotion>
            </circle>
          )}
        </g>
      ))}
    </svg>
  );
}

export function Convergence(): ReactNode {
  return (
    <section className="relative w-full overflow-hidden bg-[#080808] px-6 py-24 sm:py-32" style={{ colorScheme: "dark" }}>
      {/* accent glow behind the hub */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[28rem]"
        style={{ backgroundImage: "radial-gradient(40rem 22rem at 50% 100%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="text-center text-3xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          Everything converges. Nothing leaks.
        </motion.h2>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {GROUPS.map((g, i) => (
            <GroupCard key={g.title} group={g} delay={i * 0.1} />
          ))}
        </div>

        {/* animated connectors (desktop) */}
        <div className="relative hidden h-28 md:block" aria-hidden="true">
          <Connectors />
        </div>

        {/* hub */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto mt-10 flex w-fit flex-col items-center md:mt-0"
        >
          <div className="relative rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[0_0_60px_-12px_color-mix(in_srgb,var(--accent)_60%,transparent)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.1rem] bg-[#16210f] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <VeilMark className="h-9 w-9 text-accent" />
            </div>
          </div>
          <span className="mt-3 text-sm font-medium text-neutral-400">The Veil shielded pool</span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto mt-12 max-w-2xl text-center text-2xl font-medium tracking-tight text-white sm:text-4xl"
        >
          One pool in. Unlinkable payouts out.
        </motion.p>
      </div>
    </section>
  );
}
