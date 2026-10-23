"use client";

import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Store, Server, Workflow, ExternalLink, ShoppingBag, Wallet, type LucideIcon } from "lucide-react";
import { DashboardHome } from "@/components/fabric/dashboard-home";
import { ApisSection } from "@/components/fabric/apis-section";
import { McpSection } from "@/components/fabric/mcp-section";
import { WorkflowsSection } from "@/components/fabric/workflows-section";
import { MarketplaceSection } from "@/components/fabric/marketplace-section";
import { useWallet } from "@/lib/wallet";
import { useNetwork } from "@/lib/network";

type SectionKey = "dashboard" | "apis" | "mcp" | "workflows" | "marketplace";
const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "apis", label: "APIs", icon: Store },
  { key: "mcp", label: "MCP Servers", icon: Server },
  { key: "workflows", label: "Workflows", icon: Workflow },
  { key: "marketplace", label: "Marketplace", icon: ShoppingBag },
];

const short = (s: string, head = 7, tail = 5) => (s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);

export function KageDashboard(): ReactNode {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const { address } = useWallet();
  const { network, net, setNetwork } = useNetwork();

  return (
    <div className="min-h-[100dvh] bg-[#080808] text-white [&_svg]:[stroke-width:1.6] lg:flex" style={{ colorScheme: "dark" }}>
      {/* LEFT DOCK */}
      <aside className="border-b border-white/[0.06] bg-[#0b0b0b] lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:h-[100dvh] lg:w-[17rem] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-3 p-4">
          <Link href="/" className="rounded-lg px-3 pb-1 pt-2 text-sm font-semibold tracking-tight transition hover:text-accent">Kage</Link>

          <nav className="flex gap-1 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-x-visible">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = active === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={`group flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 active:scale-[0.98] ${
                    on ? "bg-accent text-black" : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <a href={`${net.explorer}/contract/${net.pool}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-400 transition hover:border-accent/40 hover:text-white lg:mt-auto">
            <span>Pool <span className="font-mono">{short(net.pool)}</span></span>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="min-w-0 flex-1 lg:pl-[17rem]">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-white/[0.06] bg-[#080808]/80 px-6 backdrop-blur-xl lg:fixed lg:left-[17rem] lg:right-0">
          {/* One click flips the whole app between networks. */}
          <div role="radiogroup" aria-label="Stellar network" className="flex rounded-full border border-white/[0.1] bg-white/[0.03] p-0.5">
            {(["mainnet", "testnet"] as const).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={network === n}
                onClick={() => setNetwork(n)}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold capitalize transition ${
                  network === n ? (n === "mainnet" ? "bg-accent text-black" : "bg-amber-400 text-black") : "text-neutral-400 hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setActive("dashboard");
              setTimeout(() => document.getElementById("wallet")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-accent/40 hover:text-white"
          >
            <Wallet className="h-3.5 w-3.5" />
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}
          </button>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-8 lg:pt-[5.5rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {active === "dashboard" && <DashboardHome />}
              {active === "apis" && <ApisSection />}
              {active === "mcp" && <McpSection />}
              {active === "workflows" && <WorkflowsSection />}
              {active === "marketplace" && <MarketplaceSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
