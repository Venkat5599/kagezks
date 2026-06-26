import { LedgerproofApp } from "@/components/ledgerproof-app";
import { ShaderBg } from "@/components/shader-bg";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowRight, Github, ShieldCheck } from "lucide-react";

export const metadata: Metadata = createMetadata({
  title: "Ledgerproof — Prove solvency, reveal nothing",
  description: siteConfig.description,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      {/* Hero — premium dark shader section */}
      <section className="relative isolate flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-40 text-center text-white max-[850px]:pt-32">
        <ShaderBg />
        <div className="mx-auto max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-md">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Stellar Hacks · Real-World ZK
          </div>
          <h1 className="text-[5.5rem] font-medium leading-[0.98] tracking-tight max-[850px]:text-5xl">
            Prove solvency.
            <br />
            <span className="bg-gradient-to-r from-accent via-emerald-300 to-cyan-300 bg-clip-text font-serif italic text-transparent">
              Reveal nothing.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg text-white/70">
            A Stellar token issuer proves on-chain that its reserves fully back every customer
            balance — verified by a Soroban contract, every individual balance hidden in
            zero-knowledge.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3 max-[850px]:flex-col">
            <a
              href="#app"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-medium text-black transition hover:bg-white/90"
            >
              See it live <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="https://github.com/Venkat5599/stellar"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] px-5 py-3 font-medium text-white backdrop-blur transition hover:bg-white/[0.08]"
            >
              <Github className="h-4 w-4" /> Source
            </a>
          </div>

          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-4 text-left max-[600px]:grid-cols-1">
            {[
              { k: "Reserves", v: "Verified on-chain" },
              { k: "Liabilities", v: "Proven in ZK" },
              { k: "Balances", v: "Never revealed" },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md"
              >
                <p className="text-xs text-white/50">{s.k}</p>
                <p className="mt-1 font-medium text-white">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LedgerproofApp />

      {/* Why */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-3xl font-medium tracking-tight">Why ZK is load-bearing</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-neutral-600 dark:text-neutral-400">
          Remove the zero-knowledge proof and the issuer must either publish every customer
          balance (a privacy breach) or be trusted on its word (the FTX hole). Ledgerproof
          removes both — continuously, on-chain.
        </p>
      </section>

      <footer className="border-t border-black/10 dark:border-white/10 px-6 py-10 text-center text-sm text-neutral-500">
        Ledgerproof · Confidential proof-of-solvency on Stellar testnet ·{" "}
        <a
          className="underline"
          href="https://github.com/Venkat5599/stellar"
          target="_blank"
          rel="noreferrer"
        >
          github.com/Venkat5599/stellar
        </a>
      </footer>
    </main>
  );
}
