import { BlurInHeadline } from "@/components/blur-in-headline";
import { FAQ } from "@/components/faq";
import { FeaturesBento } from "@/components/features-bento";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { LedgerproofApp } from "@/components/ledgerproof-app";
import { Pricing } from "@/components/pricing";
import { Testimonials } from "@/components/testimonials";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Ledgerproof — Prove solvency, reveal nothing",
  description: `Welcome to ${siteConfig.name}. ${siteConfig.description}`,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <BlurInHeadline />
      <FeaturesBento />

      {/* Live dashboard — Public / Customer / Issuer, wired to Stellar testnet */}
      <section className="px-6 pt-12 text-center">
        <p className="mx-auto mb-1 w-fit rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs font-medium text-neutral-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
          Live on Stellar testnet
        </p>
        <h2 className="text-4xl font-medium tracking-tight max-[850px]:text-3xl">Dashboard</h2>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          The on-chain attestation, customer inclusion, and the issuer flow — reading the real
          deployed contract.
        </p>
      </section>
      <LedgerproofApp />

      <Testimonials />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}
