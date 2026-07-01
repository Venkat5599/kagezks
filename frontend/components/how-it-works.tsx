"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { KeyRound, Landmark, Banknote } from "lucide-react";
import type { ReactNode } from "react";

const steps = [
  {
    icon: KeyRound,
    title: "Owner delegates a scoped key",
    description:
      "The owner deploys a session account and hands the agent one capped, expiring key that may only pay into the Veil pool. Never the owner's key, never a way to drain or redirect funds — anything off-policy reverts on-chain.",
  },
  {
    icon: Landmark,
    title: "Agent pays into the pool",
    description:
      "Acting on its own, the agent does ECDH against the payee's scan key, derives a private note, and deposits USDC as a Poseidon commitment in the shielded Merkle pool. The chain sees a commitment and a random ephemeral key — nothing else.",
  },
  {
    icon: Banknote,
    title: "Payee withdraws the funds",
    description:
      "The payee recognises their note, proves in zero-knowledge they own some unspent leaf — without revealing which — and is paid at a fresh stealth address. No one links the payout back to the agent.",
  },
];

function StepItem({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}): ReactNode {
  const Icon = step.icon;

  return (
    <div className={`relative flex gap-5 ${isLast ? "" : "pb-64"}`}>
      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent" aria-hidden="true">
        <Icon className="h-5 w-5 text-black" strokeWidth={2} />
      </div>

      <div className="pt-1">
        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
          {step.title}
        </h3>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-foreground/60">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export function HowItWorks(): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.3", "end 0.7"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="relative w-full bg-background"
    >
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-48 lg:h-fit lg:self-start">
          <h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            How it works
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/60">
            Three steps. The agent→payee link{" "}
            <span className="font-medium text-foreground">never touches the chain</span>
            {" "}— it&apos;s broken by a zero-knowledge proof, not by a promise.
          </p>
          <motion.a
            href="https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-8 inline-flex items-center rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            View the live contract
          </motion.a>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-6 h-[calc(100%-6rem)] w-0.5 -translate-x-1/2 bg-foreground/10" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight, willChange: "height" }}
              className="w-full bg-accent"
            />
          </div>

          <ol className="relative list-none p-0 m-0">
            {steps.map((step, index) => (
              <li key={step.title}>
                <StepItem
                  step={step}
                  isLast={index === steps.length - 1}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
