import { LedgerproofApp } from "@/components/ledgerproof-app";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Ledgerproof — Live Dashboard",
  description: "Live on-chain solvency attestation, customer inclusion, and the issuer flow.",
  path: "/dashboard",
});

export default function DashboardPage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <section className="px-6 pt-32 text-center max-[850px]:pt-24">
        <p className="mx-auto mb-2 w-fit rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs font-medium text-neutral-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
          Live on Stellar testnet
        </p>
        <h1 className="text-5xl font-medium tracking-tight max-[850px]:text-4xl">Dashboard</h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          Reads the deployed contract in real time. Customer inclusion is verified in your
          browser.
        </p>
      </section>
      <LedgerproofApp />
    </main>
  );
}
