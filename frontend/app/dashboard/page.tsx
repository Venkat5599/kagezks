import { VeilDashboard } from "@/components/veil-dashboard";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Veil — Live pool dashboard",
  description:
    "Live on-chain state of the Veil shielded pool for agent payments on Stellar testnet: Merkle root, note count, spent nullifiers, and the proven deposit / withdraw / double-spend-reject flow.",
  path: "/dashboard",
});

export default function DashboardPage(): ReactNode {
  return (
    <main id="main-content" className="relative min-h-[100dvh]">
      {/* premium backdrop: accent glow + faint grid, no flat black */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60rem 32rem at 78% -8%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%), radial-gradient(48rem 28rem at 4% 4%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.16] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--foreground) 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 14%, transparent) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <VeilDashboard />
    </main>
  );
}
