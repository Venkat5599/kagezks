"use client";

import { motion, type Transition } from "motion/react";
import { ShieldCheck, EyeOff, Lock, Trees, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

const PROOF_STATS: { icon: LucideIcon; label: string; change: string }[] = [
  { icon: Lock, label: "Withdraw circuit", change: "3005 constraints" },
  { icon: Trees, label: "Insert circuit", change: "4910 constraints" },
];

const cardAnimation = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
};

const getCardTransition = (delay = 0): Transition => ({
  duration: 0.8,
  ease: EASE,
  delay,
});

function PhoneMockup({
  children,
  variant = "full",
}: {
  children: ReactNode;
  variant?: "full" | "compact";
}): ReactNode {
  const isCompact = variant === "compact";

  return (
    <div
      className={`
        relative bg-background shadow-2xl border-neutral-800 overflow-hidden z-10
        ${isCompact
          ? "w-44 md:w-48 h-64 md:h-72 rounded-3xl border-4"
          : "w-56 md:w-64 h-96 md:h-115 rounded-t-4xl border-6 border-b-0"
        }
      `}
    >
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 bg-neutral-800 rounded-full z-10
          ${isCompact ? "top-2 w-16 h-4" : "top-2 w-20 h-5"}
        `}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

function ProofStat({
  icon: Icon,
  label,
  change,
}: {
  icon: LucideIcon;
  label: string;
  change: string;
}): ReactNode {
  return (
    <div className="flex items-center justify-between bg-background rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-neutral-500" strokeWidth={1.6} />
        <span className="text-foreground font-medium">{label}</span>
      </div>
      <span className="text-black text-sm font-medium">{change}</span>
    </div>
  );
}

function DecorativeCircles(): ReactNode {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="absolute size-56 border border-accent/80 rounded-full" />
      <div className="absolute size-72 border border-accent/60 rounded-full" />
      <div className="absolute size-88 border border-accent/40 rounded-full" />
    </div>
  );
}

function PayoutCard(): ReactNode {
  return (
    <motion.div
      {...cardAnimation}
      transition={getCardTransition(0)}
      className="group bg-card-primary rounded-4xl p-8 pb-0 overflow-hidden min-h-140 md:row-span-2 flex flex-col"
    >
      <div className="relative z-10 text-center mb-6 transition-transform duration-500 ease-out group-hover:scale-105">
        <h3 className="text-2xl md:text-4xl font-medium text-neutral-900 leading-tight mb-3">
          One scan key. Unlimited private payouts.
        </h3>
        <p className="text-neutral-700 text-sm">
          A payee shares a scan key once; every agent payment lands at a fresh stealth address only they can spend.
        </p>
      </div>

      <div className="flex-1 flex justify-center items-end transition-transform duration-500 ease-out group-hover:scale-[1.02]">
        <PhoneMockup variant="full">
          <div className="absolute inset-0 bg-phone-screen pt-14 px-5">
            <h4 className="text-3xl font-medium text-neutral-900 leading-none tracking-tight mt-4">
              Payment
            </h4>
            <h4 className="text-3xl font-medium text-neutral-900 leading-none tracking-tight mb-4">
              received
            </h4>
            <p className="text-sm text-neutral-500 leading-snug mb-8">
              Paid to a one-time address. No link back to the agent.
            </p>

            <div className="relative bg-linear-to-br from-accent via-accent/80 to-accent/50 rounded-2xl p-4 h-52 shadow-xl overflow-hidden">
              <PayoutCardContent />
            </div>
          </div>
        </PhoneMockup>
      </div>
    </motion.div>
  );
}

function PayoutCardContent(): ReactNode {
  return (
    <>
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0,60 Q30,40 60,50 T100,30" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <path d="M0,55 Q40,35 70,45 T100,25" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      </svg>

      <div className="relative z-10 flex items-start justify-between gap-3 h-full">
        <div>
          <p className="text-base font-semibold text-neutral-900">+1,000.00</p>
          <p className="text-base font-semibold text-neutral-900">USDC</p>
        </div>
        <ShieldCheck className="opacity-25 text-black" aria-hidden="true" />
      </div>

      <div className="absolute bottom-3 left-5 flex items-center gap-2 text-neutral-700 text-xs tracking-widest" aria-hidden="true">
        <span>STEALTH</span>
        <span>•</span>
        <span>UNLINKED</span>
        <span>•</span>
        <span>SETTLED</span>
      </div>
    </>
  );
}

function ChainViewCard(): ReactNode {
  return (
    <motion.div
      {...cardAnimation}
      transition={getCardTransition(0.1)}
      className="group bg-card-secondary rounded-4xl p-8 overflow-hidden min-h-80 relative flex flex-col md:block"
    >
      <div className="relative z-10 max-w-52 transition-transform duration-500 ease-out group-hover:scale-105">
        <h3 className="text-xl md:text-2xl font-medium text-card-foreground leading-tight mb-3">
          What the chain sees
        </h3>
        <p className="text-card-foreground-muted text-sm">
          Commitments, random keys, a Merkle root, nullifier hashes — never an identity or an amount.
        </p>
      </div>

      <div className="relative md:absolute mt-8 md:mt-0 md:right-12 md:top-1/2 md:-translate-y-1/2 flex items-center justify-center transition-transform duration-500 ease-out group-hover:scale-105 self-center md:self-auto">
        <DecorativeCircles />

        <PhoneMockup variant="compact">
          <div className="absolute inset-0 bg-phone-screen pt-9 px-3">
            <div className="bg-white rounded-full px-2 py-1.5 mb-3 flex items-center gap-1.5 border border-neutral-200">
              <EyeOff className="w-3 h-3 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Ledger view</span>
            </div>
            <p className="text-xs text-neutral-500 mb-0.5">Agent ↔ payee links</p>
            <p className="text-xl font-medium text-neutral-900 mb-3">0 visible</p>

            <div className="flex gap-1.5 mb-4">
              <span className="bg-accent text-black text-xs px-2.5 py-1 rounded-full">
                Commitment
              </span>
              <span className="text-neutral-400 text-xs px-2 py-1">Root</span>
            </div>
          </div>
        </PhoneMockup>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-neutral-900 rounded-2xl px-5 py-3 shadow-xl z-20 whitespace-nowrap">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-neutral-400 text-xs">Double-spend</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium text-white">Rejected</span>
            <span className="text-xs font-medium text-accent bg-accent/20 px-2 py-0.5 rounded">
              NullifierUsed
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LoadBearingCard(): ReactNode {
  return (
    <motion.div
      {...cardAnimation}
      transition={getCardTransition(0.2)}
      className="group bg-card-secondary rounded-4xl p-6 md:p-8 flex flex-col items-center justify-center text-center min-h-64"
    >
      <div className="transition-transform duration-500 ease-out group-hover:scale-110">
        <h3 className="text-2xl md:text-3xl font-medium text-card-foreground leading-tight mb-1">
          ZK is
        </h3>
        <h3 className="text-2xl md:text-3xl font-medium text-card-foreground leading-tight mb-5">
          load-bearing
        </h3>
      </div>

      <p className="text-card-foreground-muted text-sm max-w-xs">
        Remove the pool proof and the whole agent spend graph goes public. The privacy <span className="text-card-foreground font-medium">is</span> the proof — not a setting you trust us to keep on.
      </p>
    </motion.div>
  );
}

function ProvenCard(): ReactNode {
  return (
    <motion.div
      {...cardAnimation}
      transition={getCardTransition(0.3)}
      className="group bg-card-primary rounded-4xl p-6 md:p-8 flex flex-col min-h-64"
    >
      <div className="mb-auto transition-transform duration-500 ease-out group-hover:scale-105">
        <h3 className="text-xl md:text-2xl font-medium text-neutral-900 leading-tight mb-2">
          Real proofs, on-chain
        </h3>
        <p className="text-neutral-700 text-sm">
          Both circuits prove and verify; the BN254 pairing check passes inside the Soroban contract on testnet.
        </p>
      </div>

      <div className="flex flex-col gap-2 mt-6 transition-transform duration-500 ease-out group-hover:scale-[1.02]">
        {PROOF_STATS.map((stat) => (
          <ProofStat key={stat.label} {...stat} />
        ))}
      </div>
    </motion.div>
  );
}

export function FeaturesBento(): ReactNode {
  return (
    <section className="w-full px-6 mb-32 bg-background">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
          <PayoutCard />
          <ChainViewCard />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LoadBearingCard />
            <ProvenCard />
          </div>
        </div>
      </div>
    </section>
  );
}
