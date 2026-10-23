"use client";

import { ArrowDownRight, ArrowUpRight, Radio, ExternalLink, ShieldCheck } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";

type LivePool = { live: boolean; contract?: string; currentRoot?: string; leafCount?: number; usdcPooled?: string | null };
type Activity = {
  ok: boolean;
  deposits?: number;
  withdrawals?: number;
  recent?: { type: "deposit" | "withdraw"; at: string; ref: string; link: string }[];
};

const mid = (s: string | undefined, head = 8, tail = 6) => (!s ? "" : s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

// Every number here is read live: the pool contract (notes, root, balance) over Soroban
// RPC and the full deposit / withdrawal history from Stellar Expert's event index.
function LivePoolPreview(): ReactNode {
  const [pool, setPool] = useState<LivePool | null>(null);
  const [act, setAct] = useState<Activity | null>(null);

  useEffect(() => {
    fetch("/api/kage").then((r) => r.json()).then(setPool).catch(() => setPool({ live: false }));
    fetch("/api/pool-activity").then((r) => r.json()).then(setAct).catch(() => setAct({ ok: false }));
  }, []);

  const live = Boolean(pool?.live);
  const xlm = pool?.usdcPooled != null ? Number(pool.usdcPooled) / 1e7 : null;
  const dash = <span className="text-neutral-300">…</span>;

  const tiles: { label: string; value: ReactNode; sub: string }[] = [
    { label: "Deposits", value: act?.deposits ?? dash, sub: "private payments in" },
    { label: "Withdrawals", value: act?.withdrawals ?? dash, sub: "each note spent once" },
    { label: "XLM in pool", value: xlm != null ? xlm.toLocaleString("en-US", { maximumFractionDigits: 2 }) : dash, sub: "held by the contract" },
    { label: "Slots used", value: pool?.leafCount != null ? `${pool.leafCount} / 1,024` : dash, sub: "depth-10 Merkle tree" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl mask-[linear-gradient(to_bottom,black_80%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-black">Kage pool</span>
          <a
            href={pool?.contract ? `https://stellar.expert/explorer/public/contract/${pool.contract}` : undefined}
            target="_blank"
            rel="noreferrer"
            className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-500 hover:text-black"
          >
            {mid(pool?.contract, 6, 5) || "…"}
          </a>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${live ? "bg-accent/15 text-accent" : "bg-neutral-100 text-neutral-400"}`}>
            <Radio className={`h-2.5 w-2.5 ${live ? "animate-pulse" : ""}`} />
            {live ? "live · mainnet" : pool ? "offline" : "connecting"}
          </span>
        </div>
        <a href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white">
          Open dashboard <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-black">What the chain sees</p>
          <span className="text-[11px] text-neutral-400">read live from Stellar</span>
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
            <span className="text-xs font-medium text-neutral-600">Latest pool activity (public)</span>
            {pool?.currentRoot && <span className="font-mono text-[11px] text-neutral-400">root {mid(pool.currentRoot, 10, 8)}</span>}
          </div>
          <div className="divide-y divide-neutral-100">
            {act === null && <div className="px-4 py-6 text-center text-xs text-neutral-400">Loading pool activity…</div>}
            {act && !act.ok && <div className="px-4 py-6 text-center text-xs text-neutral-400">Couldn&apos;t load pool activity right now.</div>}
            {act?.recent?.map((r) => (
              <a key={r.link} href={r.link} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-neutral-50">
                <span className={`w-20 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${r.type === "deposit" ? "bg-accent/15 text-accent" : "bg-neutral-100 text-neutral-600"}`}>
                  {r.type === "deposit" ? "deposit" : "withdrawal"}
                </span>
                <span className="flex-1 truncate font-mono text-xs text-neutral-700">
                  {r.type === "deposit" ? "commitment" : "nullifier"} {mid(r.ref, 10, 8)}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400">{ago(r.at)}</span>
              </a>
            ))}
          </div>
          <div className="flex items-start gap-2 border-t border-neutral-100 bg-accent/5 px-4 py-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="text-[11px] leading-snug text-neutral-600">
              No row names the payer or the payee, and no withdrawal says which deposit it spends. Deposit amounts are still public in this version; fixed-size notes that hide them are on the roadmap.
            </span>
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
  "Prove you own a note, not which one",
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
            Every payment is a Groth16 proof: the payee proves it owns an unspent note in the pool <span className="text-black">without revealing which</span>, so the chain never learns who was paid or links the payee back to the agent. Verified on-chain over BN254 and enforced by math, not a custodian.
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
