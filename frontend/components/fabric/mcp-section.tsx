"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Server, Loader2, Search, Wrench, Workflow, Check, X } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Empty, short, Chip, CopyBtn } from "./ui";
import { useWallet } from "@/lib/wallet";

type Mcp = {
  id: string; slug: string | null; display_name: string; description: string | null;
  is_public: boolean; tools: string[]; workflows: string[]; owner_address: string | null; created_at: string;
};

export function McpSection() {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Mcp | null>(null);
  const [servers, setServers] = useState<Mcp[] | null>(null);
  const [q, setQ] = useState("");
  const { address } = useWallet();
  const load = () => fetch(`/api/mcp-servers${address ? `?owner=${address}` : ""}`).then((r) => r.json()).then((d) => setServers(d.servers ?? [])).catch(() => setServers([]));
  useEffect(() => { load(); }, [address]);

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

type ApiLite = { id: string; slug: string | null; name: string; description: string | null; price: string; category: string | null; tags?: string[] };
type WfLite = { id: string; slug: string | null; name: string; description: string | null };

function McpDetail({ mcp, onBack }: { mcp: Mcp; onBack: () => void }) {
  const url = `https://kageai.me/mcp/${mcp.slug ?? ""}`;
  const config = JSON.stringify({ mcpServers: { [mcp.slug ?? "server"]: { type: "http", url } } }, null, 2);

  // Live-editable tool/workflow attachment (AgentFabric detail-page management).
  const [tools, setTools] = useState<string[]>((mcp.tools ?? []).map(String));
  const [workflows, setWorkflows] = useState<string[]>((mcp.workflows ?? []).map(String));
  const [apis, setApis] = useState<ApiLite[]>([]);
  const [wfs, setWfs] = useState<WfLite[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/apis").then((r) => r.json()).then((d) => setApis(d.apis ?? [])).catch(() => {});
    fetch("/api/workflows").then((r) => r.json()).then((d) => setWfs(d.workflows ?? [])).catch(() => {});
  }, []);

  const persist = async (nextTools: string[], nextWf: string[]) => {
    setSaving(true);
    try {
      await fetch(`/api/mcp-servers/${mcp.slug}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: nextTools, workflows: nextWf }),
      });
    } finally { setSaving(false); }
  };
  const toggleTool = (name: string) => {
    const next = tools.includes(name) ? tools.filter((t) => t !== name) : [...tools, name];
    setTools(next); persist(next, workflows);
  };
  const toggleWf = (slug: string) => {
    const next = workflows.includes(slug) ? workflows.filter((w) => w !== slug) : [...workflows, slug];
    setWorkflows(next); persist(tools, next);
  };

  const filteredApis = apis.filter((a) => !q || (a.name + a.description + (a.tags ?? []).join(" ")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to MCP Servers</button>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10"><Server className="h-6 w-6 text-accent" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{mcp.display_name}</h1>
          <p className="mt-1 font-mono text-xs text-neutral-500">/mcp/{mcp.slug} · {mcp.is_public ? "public" : "private"} · owner {short(mcp.owner_address, 6, 4)} {saving && <span className="text-accent">· saving…</span>}</p>
        </div>
      </div>

      <Panel><p className="text-sm text-neutral-300">{mcp.description}</p></Panel>

      {/* Available Tools — attach published APIs as api__ proxy tools */}
      <Panel>
        <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Available Tools</p><span className="text-xs text-neutral-500">({tools.length})</span></div>
        <p className="mt-1 text-sm text-neutral-500">Select which APIs to expose as tools in this MCP server.</p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input placeholder="Search APIs…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
        </div>
        <div className="mt-3 space-y-2">
          {filteredApis.length === 0 ? <Empty>No APIs published yet.</Empty> : filteredApis.map((a) => {
            const name = `api__${a.slug}`;
            const on = tools.includes(name);
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{a.name}</p>
                  <p className="truncate text-xs text-neutral-500">{a.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500"><span className="text-accent">${Number(a.price).toFixed(4)} / call</span>{a.category && <Chip>{a.category}</Chip>}</div>
                </div>
                <Button variant={on ? "ghost" : "outline"} onClick={() => toggleTool(name)}>
                  {on ? <><X className="h-4 w-4" /> Remove</> : <><Plus className="h-4 w-4" /> Add</>}
                </Button>
              </div>
            );
          })}
        </div>
        {/* Built-in ZK tools */}
        <p className="mt-5 text-xs font-medium text-neutral-400">Built-in ZK tools</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {BUILTIN_TOOLS.map((t) => {
            const on = tools.includes(t);
            return <button key={t} onClick={() => toggleTool(t)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-xs transition ${on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/[0.12] text-neutral-400 hover:border-white/25"}`}>{on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{t}</button>;
          })}
        </div>
      </Panel>

      {/* Workflow Tools — enable published workflows */}
      <Panel>
        <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Workflow Tools</p></div>
        <p className="mt-1 text-sm text-neutral-500">Workflows that AI agents can execute through this MCP server.</p>
        <p className="mt-4 text-xs font-medium text-neutral-400">Enabled Workflows ({workflows.length})</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {workflows.length === 0 ? <span className="text-sm text-neutral-500">None enabled yet.</span> : workflows.map((w) => <button key={w} onClick={() => toggleWf(w)} className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-3 py-1 font-mono text-xs text-accent">{w} <X className="h-3 w-3" /></button>)}
        </div>
        <p className="mt-5 text-xs font-medium text-neutral-400">Available Workflows</p>
        <div className="mt-2 space-y-2">
          {wfs.filter((w) => !workflows.includes(w.slug ?? "")).length === 0 ? <Empty>No more workflows to add.</Empty> :
            wfs.filter((w) => !workflows.includes(w.slug ?? "")).map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm text-white">{w.name}</p><p className="truncate text-xs text-neutral-500">{w.description}</p></div>
                <Button variant="outline" onClick={() => toggleWf(w.slug ?? "")}><Plus className="h-4 w-4" /> Add</Button>
              </div>
            ))}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white">Connect from any agent</p>
          <Chip accent>live endpoint</Chip>
        </div>
        <p className="mt-1 text-sm text-neutral-500">This is a real MCP server — connect from Claude Code, Claude Desktop, Codex, or any MCP client. It speaks Streamable HTTP.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <span className="text-xs text-neutral-500">Endpoint</span>
          <span className="flex-1 truncate font-mono text-xs text-white">{url}</span>
          <CopyBtn text={url} />
        </div>
        <p className="mt-4 text-xs font-medium text-neutral-400">Claude Code — one command</p>
        <div className="relative mt-1.5">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{`claude mcp add ${mcp.slug ?? "server"} --transport http ${url}`}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={`claude mcp add ${mcp.slug ?? "server"} --transport http ${url}`} /></div>
        </div>
        <p className="mt-4 text-xs font-medium text-neutral-400">Or a config file (.mcp.json / claude_desktop_config.json)</p>
        <div className="relative mt-1.5">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{config}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={config} /></div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white">Run workflows live (ZK settlement)</p>
          <Chip accent>fabric</Chip>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          The endpoint above lists tools. To actually <span className="text-neutral-300">execute</span> — proxy x402 APIs and
          settle payments ZK-private through your SessionAccount — connect to the fabric server with a bearer token that
          scopes the call to your session.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <span className="text-xs text-neutral-500">Fabric</span>
          <span className="flex-1 truncate font-mono text-xs text-white">https://kageai.me/fabric/mcp</span>
          <CopyBtn text="https://kageai.me/fabric/mcp" />
        </div>
        <div className="relative mt-3">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{`claude mcp add ${mcp.slug ?? "kage"}-fabric --transport http https://kageai.me/fabric/mcp \\
  --header "Authorization: Bearer <your-agent-token>"`}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={`claude mcp add ${mcp.slug ?? "kage"}-fabric --transport http https://kageai.me/fabric/mcp --header "Authorization: Bearer <your-agent-token>"`} /></div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Tools appear as <span className="font-mono text-neutral-400">api__*</span> (metered proxies) and <span className="font-mono text-neutral-400">wf__*</span> (workflows that end in a ZK settle). No token → read-only default session.</p>
      </Panel>
    </div>
  );
}

// Built-in Kage tools the /mcp/<slug> endpoint knows how to serve live.
const BUILTIN_TOOLS = ["kage_pool_status", "kage_budget", "kage_quote", "kage_pay", "workflow_list", "workflow_run"];

function CreateMcpForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ slug: "", display_name: "", description: "", is_public: false });
  const [tools, setTools] = useState<string[]>([...BUILTIN_TOOLS]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [apiTools, setApiTools] = useState<string[]>([]);
  const [wfOptions, setWfOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { address } = useWallet();

  // Offer the published APIs (as api__<slug> proxy tools) + workflows to attach.
  useEffect(() => {
    fetch("/api/apis").then((r) => r.json()).then((d) => setApiTools((d.apis ?? []).map((a: { slug: string }) => `api__${a.slug}`))).catch(() => {});
    fetch("/api/workflows").then((r) => r.json()).then((d) => setWfOptions((d.workflows ?? []).map((w: { slug: string }) => w.slug))).catch(() => {});
  }, []);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/mcp-servers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, tools, workflows, owner_address: address }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "failed");
      onDone();
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  const Pick = ({ label, options, sel, set }: { label: string; options: string[]; sel: string[]; set: (v: string[]) => void }) => (
    <div>
      <p className="text-sm font-semibold text-white">{label}</p>
      {options.length === 0 ? <p className="mt-2 text-xs text-neutral-500">none published yet</p> : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((o) => {
            const on = sel.includes(o);
            return (
              <button key={o} type="button" onClick={() => toggle(sel, set, o)}
                className={`rounded-full border px-3 py-1 font-mono text-xs transition ${on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/[0.12] text-neutral-400 hover:border-white/25"}`}>
                {on ? "✓ " : ""}{o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

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
        <div className="space-y-5 border-t border-white/[0.06] pt-5">
          <p className="text-sm text-neutral-500">Choose which tools and workflows this server exposes to agents.</p>
          <Pick label="Built-in tools" options={BUILTIN_TOOLS} sel={tools.filter((t) => BUILTIN_TOOLS.includes(t))} set={(v) => setTools([...v, ...tools.filter((t) => !BUILTIN_TOOLS.includes(t) && apiTools.includes(t))])} />
          <Pick label="API proxy tools" options={apiTools} sel={tools.filter((t) => apiTools.includes(t))} set={(v) => setTools([...tools.filter((t) => BUILTIN_TOOLS.includes(t)), ...v])} />
          <Pick label="Workflows" options={wfOptions} sel={workflows} set={setWorkflows} />
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        <Button onClick={submit} disabled={busy || !f.display_name}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Server</Button>
      </Panel>
    </div>
  );
}
