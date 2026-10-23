"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, ArrowLeft, Server, Loader2, Search, Wrench, Workflow, Check, X } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Empty, short, Chip, CopyBtn } from "./ui";
import { useWallet } from "@/lib/wallet";
import { useNetwork } from "@/lib/network";
import { FieldsForm, ResultView, initialValues, type ApiVariable } from "./api-page";

export type Mcp = {
  id: string; slug: string | null; display_name: string; description: string | null;
  is_public: boolean; tools: string[]; workflows: string[]; owner_address: string | null; created_at: string;
  builtin?: boolean;
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
          <p className="mt-1 text-neutral-400">Connect one to Claude, ChatGPT or Cursor and your assistant gains new abilities.</p>
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
                  {s.builtin ? <Chip accent>by Kage</Chip> : <span className="font-mono text-[11px] text-neutral-500">{short(s.owner_address, 6, 4)}</span>}
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{s.display_name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{s.description}</p>
                <div className="mt-5 flex items-center gap-4 text-xs text-neutral-400">
                  <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-accent" /> {(s.tools ?? []).length} tools</span>
                  <span className="inline-flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5 text-accent" /> {(s.workflows ?? []).length} workflows</span>
                </div>
                <p className="mt-3 text-[11px] text-neutral-600">{s.builtin ? "Built-in · free · works with any MCP client" : `Created ${new Date(s.created_at).toLocaleDateString()}`}</p>
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
  if (mcp.builtin) return <BuiltinMcpDetail mcp={mcp} onBack={onBack} />;
  return <EditableMcpDetail mcp={mcp} onBack={onBack} />;
}

export type ToolCard = { tool: string; kind: "api" | "workflow"; name: string; description: string; ask: string; inputs: ApiVariable[]; example: Record<string, string> };

// Call the live MCP endpoint over JSON-RPC (Streamable HTTP, JSON responses) — the same
// path an AI assistant uses, so the page proves the server works.
async function mcpCall(slug: string, tool: string, args: Record<string, string>): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const r = await fetch(`/mcp/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const d = (await r.json()) as { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message: string } };
  if (d.error) return { ok: false, data: null, error: d.error.message };
  const text = d.result?.content?.[0]?.text ?? "";
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* plain text */ }
  if (d.result?.isError) return { ok: false, data, error: (data as { error?: string })?.error ?? "The tool returned an error." };
  return { ok: true, data };
}

const CLIENTS = [
  { k: "claude", label: "Claude", steps: (url: string) => [<>Open <b>claude.ai</b> → Settings → <b>Connectors</b> → <b>Add custom connector</b>.</>, <>Name it anything and paste this link: <Code>{url}</Code></>, <>Start a new chat and ask your question. Claude asks permission the first time it uses a tool.</>] },
  { k: "chatgpt", label: "ChatGPT", steps: (url: string) => [<>Open ChatGPT → Settings → <b>Apps &amp; Connectors</b> → Advanced → turn on <b>Developer mode</b>.</>, <>Click <b>Create</b>, paste this link as the server URL and choose <b>No authentication</b>: <Code>{url}</Code></>, <>In a new chat, pick the connector from the + menu, then ask your question.</>] },
  { k: "cursor", label: "Cursor / VS Code", steps: (url: string) => [<>Open your MCP settings (Cursor: Settings → MCP → <b>Add new server</b>).</>, <>Paste this config:<pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-neutral-200">{JSON.stringify({ mcpServers: { kage: { url } } }, null, 2)}</pre></>, <>Ask the agent your question in chat.</>] },
  { k: "cli", label: "Claude Code", steps: (url: string) => [<>Run this once in a terminal: <Code>{`claude mcp add kage --transport http ${url}`}</Code></>, <>Start <b>claude</b> and ask your question.</>] },
] as const;

function Code({ children }: { children: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2">
      <span className="flex-1 truncate font-mono text-xs text-white">{children}</span>
      <CopyBtn text={children} />
    </span>
  );
}

export function BuiltinMcpDetail({ mcp, onBack, backLabel = "Back to MCP Servers" }: { mcp: Mcp & { cards?: ToolCard[] }; onBack: () => void; backLabel?: string }) {
  const slug = mcp.slug ?? "";
  // User servers that settle payments need the visitor's own session token in the link.
  const [token] = useState<string | null>(() => (typeof window !== "undefined" && !mcp.builtin ? localStorage.getItem("kage_session_token") : null));
  const url = `https://kageai.me/mcp/${slug}${token ? `?token=${token}` : ""}`;
  const cards = mcp.cards ?? [];
  const [client, setClient] = useState<(typeof CLIENTS)[number]["k"]>("claude");
  const active = CLIENTS.find((c) => c.k === client)!;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> {backLabel}</button>
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10"><Server className="h-6 w-6 text-accent" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{mcp.display_name}</h1>
          <p className="mt-1 max-w-2xl text-neutral-400">{mcp.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">{mcp.builtin ? <><Chip accent>Free</Chip><Chip>by Kage</Chip></> : <Chip>by {short(mcp.owner_address, 5, 4)}</Chip>}<Chip>{cards.length || (mcp.tools ?? []).length + (mcp.workflows ?? []).length} abilities</Chip></div>
        </div>
      </div>

      <Panel>
        <p className="text-lg font-semibold text-white">What is this?</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          An MCP server gives an AI assistant new abilities. Connect it once, and your assistant can look things up live instead of guessing.
          {mcp.builtin ? "You don\u2019t need an account or a key." : "Tools that move money run through your own Kage session; create one on the Dashboard first."}
        </p>
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
          Pasting the link into a chat won&apos;t work, because the assistant just opens it like a web page. Add it as a connector first (steps below).
        </p>
      </Panel>

      <Panel>
        <p className="text-lg font-semibold text-white">Connect it</p>
        <div className="mt-3 flex flex-wrap gap-1 border-b border-white/[0.08]">
          {CLIENTS.map((c) => (
            <button key={c.k} onClick={() => setClient(c.k)} className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${client === c.k ? "border-accent text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>{c.label}</button>
          ))}
        </div>
        <ol className="mt-4 space-y-3">
          {active.steps(url).map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-0.5">{step}</div>
            </li>
          ))}
        </ol>
      </Panel>

      <div>
        <p className="mb-3 text-lg font-semibold text-white">What your assistant can do</p>
        <div className="space-y-3">
          {cards.map((c) => <ToolTry key={c.tool} slug={slug} card={c} />)}
          {cards.length === 0 && (
            <Panel>
              <div className="flex flex-wrap gap-2">
                {[...(mcp.tools ?? []), ...(mcp.workflows ?? []).map((w) => `wf__${w}`)].map((t) => <Chip key={t}>{t}</Chip>)}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolTry({ slug, card }: { slug: string; card: ToolCard }) {
  const { network } = useNetwork();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(card.inputs, card.example, network));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; data: unknown; error?: string } | null>(null);
  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setRes(null);
    try {
      setRes(await mcpCall(slug, card.tool, Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""))));
    } catch (err) {
      setRes({ ok: false, data: null, error: String((err as Error).message) });
    } finally { setBusy(false); }
  };
  const answer = res?.ok && res.data && typeof res.data === "object" && "answer" in (res.data as object) ? (res.data as { answer: string; details?: unknown }) : null;

  return (
    <Panel className="!p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{card.name}</p>
            {card.kind === "workflow" && <Chip accent>workflow</Chip>}
          </div>
          <p className="mt-0.5 text-sm text-neutral-500">{card.description}</p>
          <p className="mt-2 text-sm text-neutral-300">Ask: <span className="italic text-white">“{card.ask}”</span></p>
        </div>
        <Button variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Try it"}</Button>
      </div>
      {open && (
        <form onSubmit={run} className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
          <FieldsForm vars={card.inputs} values={values} setValues={setValues} />
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} {busy ? "Running…" : "Run"}</Button>
          {res && (res.ok ? (
            answer ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Answer</p><p className="mt-1.5 text-white">{answer.answer}</p></div>
                {answer.details != null && <ResultView data={answer.details} title="Details" />}
              </div>
            ) : <ResultView data={res.data} />
          ) : <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-200">{res.error}</p>)}
        </form>
      )}
    </Panel>
  );
}

function EditableMcpDetail({ mcp, onBack }: { mcp: Mcp; onBack: () => void }) {
  const url = `https://kageai.me/mcp/${mcp.slug ?? ""}`;
  const config = JSON.stringify({ mcpServers: { [mcp.slug ?? "server"]: { type: "http", url } } }, null, 2);

  // Live-editable tool/workflow attachment (detail-page management).
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
        <p className="mt-1 text-sm text-neutral-500">This is a real MCP server. Connect from Claude Code, Claude Desktop, Codex, or any MCP client. It speaks Streamable HTTP.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <span className="text-xs text-neutral-500">Endpoint</span>
          <span className="flex-1 truncate font-mono text-xs text-white">{url}</span>
          <CopyBtn text={url} />
        </div>
        <p className="mt-4 text-xs font-medium text-neutral-400">Claude Code: one command</p>
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
