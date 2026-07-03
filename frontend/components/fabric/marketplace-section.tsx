"use client";

// Marketplace — public creations from every user (owner-agnostic). The dashboard
// sections show only your own items (filtered by connected wallet); this is the shared
// discovery surface where anyone can find and connect to public MCP servers, APIs and
// workflows. Read-only: browse + copy the connect command.
import { useEffect, useState } from "react";
import { Loader2, Search, Server, Store, Workflow, Wrench, Globe } from "lucide-react";
import { Panel, Input, Empty, Chip, CopyBtn, short } from "./ui";

type Mcp = { id: string; slug: string | null; display_name: string; description: string | null; tools: string[]; workflows: string[]; owner_address: string | null };
type Api = { id: string; slug: string | null; name: string; description: string | null; price: string; category: string | null };
type Wf = { id: string; slug: string | null; name: string; description: string | null };

export function MarketplaceSection() {
  const [mcps, setMcps] = useState<Mcp[] | null>(null);
  const [apis, setApis] = useState<Api[] | null>(null);
  const [wfs, setWfs] = useState<Wf[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/mcp-servers?scope=public").then((r) => r.json()).then((d) => setMcps(d.servers ?? [])).catch(() => setMcps([]));
    fetch("/api/apis?scope=public").then((r) => r.json()).then((d) => setApis(d.apis ?? [])).catch(() => setApis([]));
    fetch("/api/workflows?scope=public").then((r) => r.json()).then((d) => setWfs(d.workflows ?? [])).catch(() => setWfs([]));
  }, []);

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const fMcps = (mcps ?? []).filter((m) => match(m.display_name + m.description));
  const fApis = (apis ?? []).filter((a) => match(a.name + a.description));
  const fWfs = (wfs ?? []).filter((w) => match(w.name + w.description));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Marketplace</h1>
        <p className="mt-1 text-neutral-400">Public MCP servers, APIs, and workflows published by everyone — discover and connect.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <Input placeholder="Search the marketplace…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>

      {/* MCP servers */}
      <div>
        <div className="mb-3 flex items-center gap-2"><Server className="h-4 w-4 text-accent" /><p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">MCP Servers</p></div>
        {mcps === null ? <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty> : fMcps.length === 0 ? <Empty>No public MCP servers yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {fMcps.map((m) => {
              const url = `https://kageai.me/mcp/${m.slug}`;
              return (
                <Panel key={m.id}>
                  <div className="flex items-center gap-2"><Server className="h-4 w-4 text-accent" /><p className="font-semibold text-white">{m.display_name}</p><Globe className="h-3 w-3 text-neutral-600" /></div>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{m.description}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-neutral-400">
                    <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5 text-accent" /> {(m.tools ?? []).length} tools</span>
                    <span className="inline-flex items-center gap-1"><Workflow className="h-3.5 w-3.5 text-accent" /> {(m.workflows ?? []).length} workflows</span>
                    <span className="font-mono text-[11px] text-neutral-600">{short(m.owner_address, 5, 4)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <span className="flex-1 truncate font-mono text-[11px] text-neutral-300">{url}</span>
                    <CopyBtn text={`claude mcp add ${m.slug} --transport http ${url}`} />
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      {/* APIs */}
      <div>
        <div className="mb-3 flex items-center gap-2"><Store className="h-4 w-4 text-accent" /><p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">APIs</p></div>
        {apis === null ? <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty> : fApis.length === 0 ? <Empty>No public APIs yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {fApis.map((a) => (
              <Panel key={a.id}>
                <div className="flex items-center justify-between"><p className="font-semibold text-white">{a.name}</p><Chip accent>${Number(a.price).toFixed(4)} / call</Chip></div>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{a.description}</p>
                {a.category && <div className="mt-3"><Chip>{a.category}</Chip></div>}
              </Panel>
            ))}
          </div>
        )}
      </div>

      {/* Workflows */}
      <div>
        <div className="mb-3 flex items-center gap-2"><Workflow className="h-4 w-4 text-accent" /><p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Workflows</p></div>
        {wfs === null ? <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty> : fWfs.length === 0 ? <Empty>No public workflows yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {fWfs.map((w) => (
              <Panel key={w.id}>
                <p className="font-semibold text-white">{w.name}</p>
                <p className="mt-0.5 font-mono text-xs text-neutral-500">/{w.slug}</p>
                <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{w.description}</p>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
