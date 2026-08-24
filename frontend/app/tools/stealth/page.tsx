import { StealthTool } from "@/components/stealth-tool";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Stealth Address & Note Generator — Kage",
  description:
    "Mint a stealth meta-address and derive a private payment note locally — all cryptography runs in the browser, nothing is transmitted.",
  path: "/tools/stealth",
});

export default function StealthToolPage(): ReactNode {
  return (
    <main id="main-content" className="relative min-h-[100dvh]">
      <StealthTool />
    </main>
  );
}
