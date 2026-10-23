"use client";

// Marketplace — everything public, from Kage and from every user. Click any card to
// open its page: try it, see what it does, and how to connect or call it.
import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Search, Server, Store, Workflow, ChevronRight } from "lucide-react";
import { Panel, Input, Empty, Chip, short } from "./ui";
import { ApiPage, type ApiForPage } from "./api-page";
import { WorkflowPage, type WorkflowForPage } from "./workflow-page";
import { BuiltinMcpDetail, type Mcp, type ToolCard } from "./mcp-section";

type McpRow = Mcp & { cards?: ToolCard[] };
type Open = { kind: "mcp"; item: McpRow } | { kind: "api"; item: ApiForPage } | { kind: "wf"; item: WorkflowForPage } | null;

export function MarketplaceSection() {
  const [mcps, setMcps] = useState<McpRow[] | null>(null);
  const [apis, setApis] = useState<ApiForPage[] | null>(null);
  const [wfs, setWfs] = useState<WorkflowForPage[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    fetch("/api/mcp-servers?scope=public").then((r) => r.json()).then((d) => setMcps(d.servers ?? [])).catch(() => setMcps([]));
    fetch("/api/apis?scope=public").then((r) => r.json()).then((d) => setApis(d.apis ?? [])).catch(() => setApis([]));
    fetch("/api/workflows?scope=public").then((r) => r.json()).then((d) => setWfs(d.workflows ?? [])).catch(() => setWfs([]));
  }, []);

  const back = () => setOpen(null);
  if (open?.kind === "mcp") return <BuiltinMcpDetail mcp={open.item} onBack={back} backLabel="Back to Marketplace" />;
  if (open?.kind === "api") return <ApiPage api={{ ...open.item, tags: open.item.tags ?? [] }} onBack={back} backLabel="Back to Marketplace" />;
  if (open?.kind === "wf") return <WorkflowPage wf={open.item} onBack={back} backLabel="Back to Marketplace" />;

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const fMcps = (mcps ?? []).filter((m) => match(`${m.display_name} ${m.description}`));
  const fApis = (apis ?? []).filter((a) => match(`${a.name} ${a.description}`));
  const fWfs = (wfs ?? []).filter((w) => match(`${w.name} ${w.description}`));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Marketplace</h1>
        <p className="mt-1 text-neutral-400">Everything public on Kage. Open any card to try it and see how to use it.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <Input placeholder="Search the marketplace…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>

      <Section icon={Server} title="MCP servers" hint="Give your AI assistant new abilities" loading={mcps === null} count={fMcps.length}>
        {fMcps.map((m) => (
          <Card
            key={m.id}
            onClick={() => setOpen({ kind: "mcp", item: m })}
            title={m.display_name}
            body={m.description}
            chips={
              <>
                {m.builtin ? <Chip accent>by Kage</Chip> : <span className="font-mono text-[11px] text-neutral-500">{short(m.owner_address, 5, 4)}</span>}
                <Chip>{m.cards?.length ?? (m.tools ?? []).length + (m.workflows ?? []).length} abilities</Chip>
              </>
            }
          />
        ))}
      </Section>

      <Section icon={Workflow} title="Workflows" hint="Several lookups in a row, one answer" loading={wfs === null} count={fWfs.length}>
        {fWfs.map((w) => (
          <Card
            key={w.id}
            onClick={() => setOpen({ kind: "wf", item: w })}
            title={w.name}
            body={w.description}
            chips={
              <>
                {w.builtin && <Chip accent>by Kage</Chip>}
                <Chip>{w.steps?.length ?? 0} steps</Chip>
              </>
            }
          />
        ))}
      </Section>

      <Section icon={Store} title="APIs" hint="Live data for your app or assistant" loading={apis === null} count={fApis.length}>
        {fApis.map((a) => (
          <Card
            key={a.id}
            onClick={() => setOpen({ kind: "api", item: a })}
            title={a.name}
            body={a.description}
            chips={
              <>
                <Chip accent>{a.builtin || Number(a.price) === 0 ? "Free" : `$${Number(a.price).toFixed(2)} per call`}</Chip>
                {a.category && <Chip>{a.category}</Chip>}
              </>
            }
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, hint, loading, count, children }: { icon: typeof Server; title: string; hint: string; loading: boolean; count: number; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-neutral-500">· {hint}</p>
      </div>
      {loading ? (
        <Empty>
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </Empty>
      ) : count === 0 ? (
        <Empty>Nothing here matches.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

function Card({ title, body, chips, onClick }: { title: string; body: string | null; chips: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group text-left">
      <Panel className="h-full cursor-pointer transition group-hover:border-accent/40 group-hover:bg-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-white">{title}</p>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>
      </Panel>
    </button>
  );
}
