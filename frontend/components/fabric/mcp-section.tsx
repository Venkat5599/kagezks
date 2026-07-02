"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Server, Loader2, Search, Wrench, Workflow } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Empty, short, Chip, CopyBtn } from "./ui";

type Mcp = {
  id: string; slug: string | null; display_name: string; description: string | null;
  is_public: boolean; tools: string[]; workflows: string[]; owner_address: string | null; created_at: string;
};

export function McpSection() {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Mcp | null>(null);
  const [servers, setServers] = useState<Mcp[] | null>(null);
  const [q, setQ] = useState("");
  const load = () => fetch("/api/mcp-servers").then((r) => r.json()).then((d) => setServers(d.servers ?? [])).catch(() => setServers([]));
  useEffect(() => { load(); }, []);

  if (creating) return <CreateMcpForm onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;
  if (selected) return <McpDetail mcp={selected} onBack={() => setSelected(null)} />;
  const filtered = (servers ?? []).filter((s) => !q || (s.display_name + s.description).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">MCP Servers</h1>
          <p className="mt-1 text-neutral-400">Discover AI-ready MCP servers with tools and workflows for your agents.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create MCP Server</Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <Input placeholder="Search MCP servers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>

      {servers === null ? (
        <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty>
      ) : filtered.length === 0 ? (
        <Empty>No MCP servers yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button key={s.id} type="button" onClick={() => setSelected(s)} className="text-left">
              <Panel className="h-full cursor-pointer transition hover:border-accent/40 hover:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10"><Server className="h-5 w-5 text-accent" /></div>
                  <span className="font-mono text-[11px] text-neutral-500">{short(s.owner_address, 6, 4)}</span>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{s.display_name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{s.description}</p>
                <div className="mt-5 flex items-center gap-4 text-xs text-neutral-400">
                  <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-accent" /> {(s.tools ?? []).length} tools</span>
                  <span className="inline-flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5 text-accent" /> {(s.workflows ?? []).length} workflows</span>
                </div>
                <p className="mt-3 text-[11px] text-neutral-600">Created {new Date(s.created_at).toLocaleDateString()}</p>
              </Panel>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function McpDetail({ mcp, onBack }: { mcp: Mcp; onBack: () => void }) {
  const url = `https://kageai.me/mcp/${mcp.slug ?? ""}`;
  const config = JSON.stringify({ mcpServers: { [mcp.slug ?? "server"]: { type: "http", url } } }, null, 2);
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to MCP Servers</button>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10"><Server className="h-6 w-6 text-accent" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{mcp.display_name}</h1>
          <p className="mt-1 font-mono text-xs text-neutral-500">/mcp/{mcp.slug} · {mcp.is_public ? "public" : "private"} · owner {short(mcp.owner_address, 6, 4)}</p>
        </div>
      </div>

      <Panel><p className="text-sm text-neutral-300">{mcp.description}</p></Panel>

      <Panel>
        <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Tools</p><span className="text-xs text-neutral-500">{(mcp.tools ?? []).length}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(mcp.tools ?? []).map((t) => <Chip key={String(t)} accent>{String(t)}</Chip>)}
          {(mcp.tools ?? []).length === 0 && <span className="text-sm text-neutral-500">no tools listed</span>}
        </div>
        {(mcp.workflows ?? []).length > 0 && (
          <>
            <div className="mt-5 flex items-center gap-2"><Workflow className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Workflows</p></div>
            <div className="mt-3 flex flex-wrap gap-2">{(mcp.workflows ?? []).map((w) => <Chip key={String(w)}>{String(w)}</Chip>)}</div>
          </>
        )}
      </Panel>

      <Panel>
        <p className="font-semibold text-white">Connect an agent</p>
        <p className="mt-1 text-sm text-neutral-500">Add this to your MCP client config (Claude Code <span className="font-mono text-neutral-400">.mcp.json</span> or Claude Desktop). Your agent discovers the tools and can pay privately.</p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{config}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={config} /></div>
        </div>
      </Panel>
    </div>
  );
}

function CreateMcpForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ slug: "", display_name: "", description: "", is_public: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/mcp-servers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "failed");
      onDone();
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to MCP Servers</button>
      <div className="flex items-center gap-3">
        <Server className="h-8 w-8 text-accent" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">MCP Server</h1>
          <p className="text-neutral-400">Configure a Model Context Protocol server for AI agent integration.</p>
        </div>
      </div>

      <Panel className="space-y-5">
        <div>
          <p className="text-lg font-semibold text-white">Server Configuration</p>
          <p className="text-sm text-neutral-500">Set up your MCP server endpoint and settings.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Slug" hint="lowercase, hyphens">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">/mcp/</span>
              <Input placeholder="my-server" value={f.slug} onChange={(e) => setF((s) => ({ ...s, slug: e.target.value }))} />
            </div>
          </Field>
          <Field label="Display Name"><Input placeholder="My MCP Server" value={f.display_name} onChange={(e) => setF((s) => ({ ...s, display_name: e.target.value }))} /></Field>
        </div>
        <Field label="Description"><Textarea rows={3} placeholder="Describe what your MCP server provides…" value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} /></Field>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Public Server</p>
            <p className="text-xs text-neutral-500">Allow anyone with an account to connect.</p>
          </div>
          <Button variant="outline" onClick={() => setF((s) => ({ ...s, is_public: !s.is_public }))}>{f.is_public ? "Public" : "Private"}</Button>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <Button onClick={submit} disabled={busy || !f.display_name}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Server</Button>
      </Panel>
    </div>
  );
}
