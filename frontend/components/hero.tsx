"use client";

import { ArrowDownRight, ArrowUpRight, Radio, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";

type LivePool = {
  live: boolean;
  contract?: string;
  currentRoot?: string;
  leafCount?: number;
  provenNullifierSpent?: boolean;
};
type VeilNote = {
  onchainNote: {
    amount: string;
    commitment: string;
    ephemeralPub: string;
    nullifierHash: string;
    stealthAddress: string;
  };
};

const mid = (s: string | undefined, head = 8, tail = 6) =>
  !s ? "—" : s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

const NAV = ["Pool", "Deposits", "Withdrawals", "Nullifiers", "Circuits"];

function LivePoolPreview(): ReactNode {
  const [pool, setPool] = useState<LivePool | null>(null);
  const [note, setNote] = useState<VeilNote["onchainNote"] | null>(null);

  useEffect(() => {
    fetch("/api/veil").then((r) => r.json()).then(setPool).catch(() => setPool({ live: false }));
    fetch("/veil.json").then((r) => r.json()).then((d: VeilNote) => setNote(d.onchainNote)).catch(() => {});
  }, []);

  const live = Boolean(pool?.live);

  const tiles = [
    { label: "Notes in pool", value: pool?.leafCount ?? "—", sub: "leaf_count, on-chain" },
    { label: "USDC pooled", value: note ? (Number(note.amount) / 1e7).toFixed(2) : "—", sub: "amount hidden per note" },
    { label: "Spend recorded", value: pool ? (pool.provenNullifierSpent ? "1" : "0") : "—", sub: "nullifiers, no double-spend" },
    { label: "Tree depth", value: "10", sub: "1024-note anonymity set" },
  ];

  const rows = note
    ? [
        { k: "commitment", v: note.commitment, tag: "leaf" },
        { k: "ephemeral R", v: note.ephemeralPub, tag: "announce" },
        { k: "nullifier hash", v: note.nullifierHash, tag: "spend tag" },
      ]
    : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl mask-[linear-gradient(to_bottom,black_72%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)]">
      {/* top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-full bg-black" />
          <span className="text-sm font-semibold text-black">Veil pool</span>
          <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-500">
            {mid(pool?.contract, 6, 5)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              live ? "bg-accent/15 text-accent" : "bg-neutral-100 text-neutral-400"
            }`}
          >
            <Radio className={`h-2.5 w-2.5 ${live ? "animate-pulse" : ""}`} />
            {live ? "live · testnet" : "connecting"}
          </span>
        </div>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white"
        >
          Open dashboard <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex">
        {/* nav rail */}
        <aside className="hidden w-44 shrink-0 border-r border-neutral-100 p-4 sm:block">
          <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400">Pool</p>
          <nav className="mt-2 space-y-0.5">
            {NAV.map((item, i) => (
              <div
                key={item}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                  i === 0 ? "bg-neutral-100 font-medium text-black" : "text-neutral-500"
                }`}
              >
                {item}
              </div>
            ))}
          </nav>
          <div className="mt-5 rounded-lg bg-accent/10 p-3">
            <p className="text-[11px] font-medium text-neutral-700">ZK is load-bearing</p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">
              Remove the proof → every agent payment goes public.
            </p>
          </div>
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-black">What the chain sees</p>
            <span className="text-[11px] text-neutral-400">read in real time</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
                <p className="text-[11px] text-neutral-500">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-black">{t.value}</p>
                <p className="mt-0.5 text-[11px] text-neutral-400">{t.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <span className="text-xs font-medium text-neutral-600">Pool ledger (public)</span>
              <span className="font-mono text-[11px] text-neutral-400">
                root {mid(pool?.currentRoot ?? note?.commitment, 10, 8)}
              </span>
            </div>
            <div className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-neutral-400">reading on-chain…</div>
              )}
              {rows.map((r) => (
                <div key={r.k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs text-neutral-500">{r.k}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-700">{mid(r.v, 12, 10)}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">{r.tag}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-neutral-100 bg-accent/5 px-4 py-2.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="text-[11px] text-neutral-600">
                No identities, no amounts, no link from any row back to the agent or who it paid.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ease = [0.23, 1, 0.32, 1] as const;

const fadeInUp = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95, filter: "blur(8px)" },
  visible: { opacity: 1, scale: 1, filter: "blur(0px)" },
};

const PARALLAX_INTENSITY = 20;

const PHRASES = [
  "Groth16 membership proof",
  "Prove you own a note — not which one",
  "Poseidon commitments",
  "Nullifiers stop double-spend",
  "BN254 pairing on Soroban",
  "No counterparty on chain",
  "Paid to a one-time stealth address",
  "Verified on-chain, not promised",
];

export function Hero(): ReactNode {
  const sectionRef = useRef<HTMLElement>(null);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springConfig = { damping: 25, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!sectionRef.current) return;
    
    if (window.innerWidth < 850) return;
    
    const rect = sectionRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const offsetX = (e.clientX - centerX) / (rect.width / 2);
    const offsetY = (e.clientY - centerY) / (rect.height / 2);
    
    mouseX.set(offsetX * PARALLAX_INTENSITY);
    mouseY.set(offsetY * PARALLAX_INTENSITY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section 
      ref={sectionRef}
      className="flex flex-col relative" 
      style={{ colorScheme: 'light' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div 
        className="absolute inset-0 min-[850px]:inset-2.5 bg-cover bg-center bg-no-repeat -z-10 brightness-125 rounded-br-4xl rounded-bl-4xl min-[850px]:scale-105"
        style={{ 
          backgroundImage: 'url(/BG.jpg)',
          x,
          y,
        }}
        aria-hidden="true"
      />
      
      <div className="flex items-start justify-center px-6 pt-64 max-[850px]:pt-32">
        <motion.div
          className="flex flex-col items-center max-[850px]:items-start text-center max-[850px]:text-left max-w-4xl max-[850px]:w-full"
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.15, delayChildren: 0.2 }}
        >
          <motion.div
            className="inline-flex items-center gap-1.5 pl-4 pr-3 py-1.5 rounded-xl border border-black/10 bg-white text-black text-sm font-medium mb-6"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease }}
          >
            Real-World ZK · Live on Stellar testnet
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
          </motion.div>

          <h1 className="text-8xl max-[850px]:text-5xl font-medium tracking-tight leading-[1.1] mb-6 text-black">
            <motion.span
              className="block"
              variants={fadeInUp}
              transition={{ duration: 0.8, ease }}
            >
              Agent payments,
            </motion.span>
            <motion.span
              className="block"
              variants={fadeInUp}
              transition={{ duration: 0.8, ease }}
            >
              proven in <span className="italic font-serif text-accent">zero-knowledge</span>.
            </motion.span>
          </h1>

          <motion.p
            className="text-lg text-neutral-600 mb-8 max-w-xl"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease }}
          >
            Every payment is a Groth16 proof: the payee proves it owns an unspent note in the pool <span className="text-black">without revealing which</span> — so who was paid, how much, and the agent→payee link never touch the chain. Verified on-chain over BN254, enforced by math, not a custodian.
          </motion.p>

          <motion.div
            className="flex items-center gap-3 max-[850px]:w-full max-[850px]:flex-col"
            variants={fadeInScale}
            transition={{ duration: 0.8, ease }}
          >
            <motion.a
              href="#how-it-works"
              className="group relative inline-flex items-center max-[850px]:w-full"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="absolute right-0 inset-y-0 w-[calc(100%-2rem)] max-[850px]:w-full rounded-xl bg-accent" />
              <span className="relative z-10 px-6 py-3 rounded-xl bg-black text-white font-medium max-[850px]:flex-1">See how it works</span>
              <span className="relative -left-px z-10 w-11 h-11 rounded-xl flex items-center justify-center text-black">
                <ArrowDownRight className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-45" />
              </span>
            </motion.a>

            <motion.a
              href="/dashboard"
              className="group inline-flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white/70 px-6 py-3 font-medium text-black backdrop-blur transition-colors hover:border-black/30 max-[850px]:w-full"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Radio className="h-4 w-4 text-accent" strokeWidth={2} />
              Live dashboard
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </motion.a>
          </motion.div>

          <motion.div
            className="mt-8 flex flex-col items-center gap-2 max-[850px]:items-start"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease }}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 max-[850px]:justify-start">
              {["Groth16", "Poseidon", "BN254 pairing", "Merkle + nullifier", "verified on-chain"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-mono text-[11px] font-medium text-neutral-700 backdrop-blur"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="font-mono text-[11px] text-neutral-500">
              withdraw 3,005 · insert 5,238 constraints · depth-10 tree · Hermez ptau
            </p>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="relative px-6 mt-24 max-[850px]:mt-10"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6, ease }}
      >
        <div className="relative max-w-2xl mx-auto">
          <LivePoolPreview />
        </div>
      </motion.div>

      <motion.div
        className="pt-20 pb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1, ease }}
      >
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max items-center gap-10 pr-10 [animation:veil-marquee_32s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:[animation:none]">
            {[...PHRASES, ...PHRASES, ...PHRASES, ...PHRASES].map((p, i) => (
              <span key={i} className="flex shrink-0 items-center gap-10 text-xl font-medium tracking-tight text-neutral-800">
                {p}
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
