"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Store, Server, Workflow, Eye, ExternalLink, type LucideIcon } from "lucide-react";
import { VeilMark } from "@/components/veil-logo";
import { DashboardHome } from "@/components/fabric/dashboard-home";
import { ApisSection } from "@/components/fabric/apis-section";
import { McpSection } from "@/components/fabric/mcp-section";
import { WorkflowsSection } from "@/components/fabric/workflows-section";

type SectionKey = "dashboard" | "apis" | "mcp" | "workflows";
const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "apis", label: "APIs", icon: Store },
  { key: "mcp", label: "MCP Servers", icon: Server },
  { key: "workflows", label: "Workflows", icon: Workflow },
];

const CONTRACT = "CBRM3RK26Q3KLZC2KYRQ5OZ2HLCN7SV5A7EZMCUC27GL7QXUS32UB76B";
const EXPLORER = `https://stellar.expert/explorer/testnet/contract/${CONTRACT}`;
const short = (s: string, head = 7, tail = 5) => (s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);

export function VeilDashboard(): ReactNode {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const cur = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0]!;
  const CurIcon = cur.icon;

  return (
    <div className="min-h-[100dvh] bg-[#080808] text-white [&_svg]:[stroke-width:1.6] lg:flex" style={{ colorScheme: "dark" }}>
      {/* LEFT DOCK */}
      <aside className="border-b border-white/[0.06] bg-white/[0.015] lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[17rem] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-accent/10 px-3 py-3 ring-1 ring-inset ring-accent/15">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <VeilMark className="h-5 w-5 text-black" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight tracking-tight">Veil <span className="text-accent">Fabric</span></p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span>
                live · testnet
              </p>
            </div>
          </div>

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

          <a href={EXPLORER} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-400 transition hover:border-accent/40 hover:text-white lg:mt-auto">
            <span className="font-mono">{short(CONTRACT)}</span>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#080808]/70 px-6 py-3.5 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <CurIcon className="h-[18px] w-[18px] text-accent" strokeWidth={1.7} />
            <span className="text-sm font-semibold tracking-tight">{cur.label}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent">
            <Eye className="h-3.5 w-3.5" /> Stellar testnet
          </span>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {active === "dashboard" && <DashboardHome go={(k) => setActive(k)} />}
              {active === "apis" && <ApisSection />}
              {active === "mcp" && <McpSection />}
              {active === "workflows" && <WorkflowsSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
