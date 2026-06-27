import { VeilApp } from "@/components/veil-app";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Veil — Live Dashboard",
  description: "A live shielded payment on Stellar testnet: stealth notes, ZK deposit/withdraw, no link on chain.",
  path: "/dashboard",
});

export default function DashboardPage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <section className="px-6 pt-32 text-center max-[850px]:pt-24">
        <p className="mx-auto mb-2 w-fit rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs font-medium text-neutral-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
          Live on Stellar testnet
        </p>
        <h1 className="text-5xl font-medium tracking-tight max-[850px]:text-4xl">Veil</h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          A real private payment on-chain — stealth notes, a ZK shielded pool, and no
          deposit↔withdrawal link the chain can see.
        </p>
      </section>
      <VeilApp />
    </main>
  );
}
