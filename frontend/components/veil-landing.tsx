"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  Send,
  Layers,
  Inbox,
  ShieldOff,
  KeyRound,
  Repeat,
  ExternalLink,
  Plus,
  Minus,
} from "lucide-react";

const ease = [0.23, 1, 0.32, 1] as const;
const reveal = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const CONTRACT = "https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD";
const DEPOSIT_TX = "https://stellar.expert/explorer/testnet/tx/5aa164a06f73e3e943824edcaedaf768ac773f52a9029f92656a5a8d7f97c231";
const WITHDRAW_TX = "https://stellar.expert/explorer/testnet/tx/dca610418cc3b2d3ebfaf05282b96beffcfa620914b8ade9991bf4c4b1f7cc81";

function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ staggerChildren: 0.12 }}
      className={`mx-auto max-w-5xl px-6 py-20 ${className}`}
    >
      {children}
    </motion.section>
  );
}

const steps = [
  {
    icon: Send,
    title: "Send",
    body: "Pay from the recipient's published scan key. An ECDH shared secret derives the note; only they can find it. The chain sees a random commitment — never the recipient.",
  },
  {
    icon: Layers,
    title: "Pool",
    body: "The commitment is inserted into an on-chain Merkle tree with a zero-knowledge insert proof. USDC is pulled in. No amount is tied to any identity.",
  },
  {
    icon: Inbox,
    title: "Receive",
    body: "The recipient scans for their note, then withdraws to a one-time stealth address — proving they own an unspent leaf without revealing which deposit it was.",
  },
];

const loadBearing = [
  { icon: ShieldOff, title: "Remove the pool proof", body: "The withdrawal must name its deposit → the deposit↔withdrawal link is public → no privacy." },
  { icon: Repeat, title: "Remove the nullifier", body: "A note becomes spendable twice → the pool drains. The nullifier is the double-spend guard, proven in-circuit." },
  { icon: KeyRound, title: "Remove the stealth notes", body: "The recipient's identity leaks at deposit time, and the sender must hand secrets over out-of-band." },
];

const faqs = [
  {
    q: "Is this just a mixer?",
    a: "It's a shielded pool plus stealth addressing. Beyond breaking the deposit↔withdrawal link, the recipient is hidden at payment time via ECDH — the sender pays a meta-address, not a visible account.",
  },
  {
    q: "How is the tree trustless without on-chain Poseidon?",
    a: "Stellar's host Poseidon2 constants differ from circomlib's, so the contract can't recompute the circuit's root. Instead every deposit carries a Groth16 insert proof that new_root correctly appends the commitment to the current root. The contract only runs the BN254 pairing check.",
  },
  {
    q: "Can a relayer steal the payout?",
    a: "No. The payout address is bound into the withdrawal proof via keccak256(ScAddress). Change the destination and the proof no longer verifies.",
  },
  {
    q: "What's the honest scope?",
    a: "Testnet only. v1 stealth uses a single-derived-key model (view/spend separation is a documented stretch). Demo tree is depth 10; the same circuit scales to depth 20. The ZK and every transaction are real.",
  },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div variants={reveal} transition={{ duration: 0.6, ease }} className="border-b border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="font-medium">{q}</span>
        {open ? <Minus className="h-5 w-5 shrink-0 text-neutral-500" /> : <Plus className="h-5 w-5 shrink-0 text-neutral-500" />}
      </button>
      {open && (
        <motion.p
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ duration: 0.25, ease }}
          className="overflow-hidden pb-5 text-sm text-neutral-600 dark:text-neutral-400"
        >
          {a}
        </motion.p>
      )}
    </motion.div>
  );
}

export function VeilLanding(): ReactNode {
  return (
    <>
      {/* How it works */}
      <Section>
        <motion.h2 variants={reveal} transition={{ duration: 0.7, ease }} className="text-center text-4xl font-medium tracking-tight max-[850px]:text-3xl">
          Private in three moves
        </motion.h2>
        <motion.p variants={reveal} transition={{ duration: 0.7, ease }} className="mx-auto mt-3 max-w-xl text-center text-neutral-600 dark:text-neutral-400">
          Stealth addressing hides the recipient; a zero-knowledge pool hides the link and the amount.
        </motion.p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                variants={reveal}
                transition={{ duration: 0.6, ease }}
                className="rounded-2xl border border-black/10 bg-white/60 p-6 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{s.body}</p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* Why ZK is load-bearing */}
      <Section>
        <motion.h2 variants={reveal} transition={{ duration: 0.7, ease }} className="text-center text-4xl font-medium tracking-tight max-[850px]:text-3xl">
          ZK is load-bearing, not decorative
        </motion.h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {loadBearing.map((s) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                variants={reveal}
                transition={{ duration: 0.6, ease }}
                className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
              >
                <Icon className="h-5 w-5 text-accent" />
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{s.body}</p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* Proven on testnet */}
      <Section>
        <motion.h2 variants={reveal} transition={{ duration: 0.7, ease }} className="text-center text-4xl font-medium tracking-tight max-[850px]:text-3xl">
          Proven on Stellar testnet
        </motion.h2>
        <motion.p variants={reveal} transition={{ duration: 0.7, ease }} className="mx-auto mt-3 max-w-xl text-center text-neutral-600 dark:text-neutral-400">
          Real transactions — not a mockup. Every proof verified on-chain (BN254).
        </motion.p>
        <div className="mx-auto mt-10 max-w-2xl space-y-3">
          {[
            { label: "Deposit — insert proof verified, USDC pooled", href: DEPOSIT_TX },
            { label: "Withdraw — membership proof, paid to a stealth address", href: WITHDRAW_TX },
            { label: "Pool contract", href: CONTRACT },
          ].map((l) => (
            <motion.a
              key={l.href}
              variants={reveal}
              transition={{ duration: 0.5, ease }}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-5 py-4 text-sm backdrop-blur transition hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/5"
            >
              <span>{l.label}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
            </motion.a>
          ))}
          <motion.div variants={reveal} transition={{ duration: 0.5, ease }} className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-600 dark:text-red-400">
            Double-spend the same note → rejected on-chain (NullifierUsed).
          </motion.div>
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <motion.h2 variants={reveal} transition={{ duration: 0.7, ease }} className="text-center text-4xl font-medium tracking-tight max-[850px]:text-3xl">
          Questions
        </motion.h2>
        <div className="mx-auto mt-10 max-w-2xl">
          {faqs.map((f) => (
            <Faq key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </Section>
    </>
  );
}
