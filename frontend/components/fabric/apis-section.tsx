"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Store, Loader2, Terminal, Search, KeyRound, Zap, Play, Trash2 } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Toggle, Chip, Empty, short, CopyBtn } from "./ui";
import { useWallet } from "@/lib/wallet";

type Api = {
  id: string; name: string; slug: string | null; description: string | null; category: string | null;
  tags: string[]; payment_address: string | null; target_url: string; http_method: string;
  content_type?: string; query_params?: string | null; example_response?: string | null;
  price: string; is_public: boolean; request_count: number; success_count?: number; earnings?: string;
};

export function ApisSection() {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Api | null>(null);
  const [apis, setApis] = useState<Api[] | null>(null);
  const [q, setQ] = useState("");
  const { address } = useWallet();

  const load = () => fetch(`/api/apis${address ? `?owner=${address}` : ""}`).then((r) => r.json()).then((d) => setApis(d.apis ?? [])).catch(() => setApis([]));
  useEffect(() => { load(); }, [address]);

  if (creating) return <CreateApiForm onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;
  if (selected) return <ApiDetail api={selected} onBack={() => setSelected(null)} />;

  const filtered = (apis ?? []).filter((a) => !q || (a.name + a.description + (a.tags ?? []).join(" ")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">APIs</h1>
          <p className="mt-1 text-neutral-400">Payment-gated API proxies — pay per call over x402, settled on Stellar.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create API</Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <Input placeholder="Search APIs…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>

      {apis === null ? (
        <Empty><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Empty>
      ) : filtered.length === 0 ? (
        <Empty>No APIs yet. Create the first payment-gated proxy.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((a) => (
            <button key={a.id} type="button" onClick={() => setSelected(a)} className="text-left">
              <Panel className="h-full cursor-pointer transition hover:border-accent/40 hover:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10"><Store className="h-5 w-5 text-accent" /></div>
                  <span className="font-mono text-[11px] text-neutral-500">{short(a.payment_address, 6, 4)}</span>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{a.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{a.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Chip accent>{a.price} USDC / call</Chip>
                  <Chip>{a.http_method}</Chip>
                  {(a.tags ?? []).slice(0, 2).map((t) => <Chip key={t}>{t}</Chip>)}
                </div>
              </Panel>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiDetail({ api, onBack }: { api: Api; onBack: () => void }) {
  const endpoint = `https://kageai.me/x402/${api.slug ?? api.id}`;
  const curl = [
    `# 1. call it — unpaid requests get an x402 quote (HTTP 402)`,
    `curl -i ${endpoint}`,
    ``,
    `# 2. pay ${api.price} USDC to the payment address (memo = the quote nonce),`,
    `#    then retry with the payment proof:`,
    `curl ${endpoint} \\`,
    `  -H 'X-PAYMENT: <base64({ nonce, txHash })>'`,
    `# -> proxied to ${api.target_url}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to APIs</button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10"><Store className="h-6 w-6 text-accent" /></div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">{api.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Chip accent><Zap className="h-3 w-3" /> {api.price} USDC / call</Chip>
              <Chip>{api.http_method}</Chip>
              <Chip>{api.is_public ? "public" : "private"}</Chip>
              {(api.tags ?? []).map((t) => <Chip key={t}>{t}</Chip>)}
            </div>
          </div>
        </div>
      </div>

      <Panel>
        <p className="text-sm text-neutral-300">{api.description}</p>
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
            <span className="text-xs text-neutral-500">Endpoint</span>
            <span className="flex-1 truncate font-mono text-xs text-white">{endpoint}</span>
            <CopyBtn text={endpoint} />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
            <KeyRound className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs text-neutral-500">Pays to</span>
            <span className="flex-1 truncate font-mono text-xs text-white">{api.payment_address ?? "—"}</span>
            {api.payment_address && <CopyBtn text={api.payment_address} />}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-accent" /><p className="font-semibold text-white">How to use (x402)</p></div>
        <p className="mt-1 text-sm text-neutral-500">Agents pay per call. Unpaid requests get a <span className="font-mono text-neutral-400">402</span> + quote; pay the USDC fee on Stellar, then retry with the proof. The gateway proxies to your target after payment.</p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs leading-relaxed text-neutral-200">{curl}</pre>
          <div className="absolute right-3 top-3"><CopyBtn text={curl} /></div>
        </div>
      </Panel>

      <TestApi api={api} />

      {api.example_response && (
        <Panel>
          <p className="font-semibold text-white">Example response</p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{api.example_response}</pre>
        </Panel>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Field label="Requests"><span className="text-2xl font-semibold text-white">{api.request_count ?? 0}</span></Field>
        <Field label="Success"><span className="text-2xl font-semibold text-white">{api.success_count ?? 0}</span></Field>
        <Field label="Earnings"><span className="text-2xl font-semibold text-white">${Number(api.earnings ?? 0).toFixed(2)}</span></Field>
      </div>
    </div>
  );
}

// Live proxied call through the fabric (/run/api → real upstream fetch). Not metered
// here — this is the owner testing their own proxy; agents pay via x402 at the tool.
function TestApi({ api }: { api: Api }) {
  const [argsText, setArgsText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; status?: number; body?: unknown; error?: string } | null>(null);

  const run = async () => {
    setBusy(true); setRes(null);
    let args: unknown = {};
    try { args = argsText.trim() ? JSON.parse(argsText) : {}; }
    catch { setRes({ ok: false, error: "args is not valid JSON" }); setBusy(false); return; }
    try {
      const r = await fetch("/api/fabric/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "api", slug: api.slug ?? api.id, args }),
      });
      setRes(await r.json());
    } catch (e) { setRes({ ok: false, error: String((e as Error).message) }); } finally { setBusy(false); }
  };

  return (
    <Panel>
      <div className="flex items-center gap-2"><Play className="h-4 w-4 text-accent" /><p className="font-semibold text-white">Test call</p><Chip accent>live</Chip></div>
      <p className="mt-1 text-sm text-neutral-500">Proxies to <span className="font-mono text-neutral-400">{api.target_url}</span> with your args. Variables substitute <span className="font-mono text-neutral-400">{"{name}"}</span> in the URL / query.</p>
      <div className="mt-4"><Field label="Args (JSON)"><Textarea rows={3} value={argsText} onChange={(e) => setArgsText(e.target.value)} className="font-mono" /></Field></div>
      <div className="mt-3"><Button onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Send request</Button></div>
      {res && (
        <div className="mt-4">
          {res.ok
            ? <p className="text-sm"><span className={res.status && res.status < 400 ? "text-accent" : "text-red-400"}>HTTP {res.status}</span></p>
            : <p className="text-sm text-red-400">{res.error}</p>}
          {res.body != null && <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-200">{typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)}</pre>}
        </div>
      )}
    </Panel>
  );
}

function CreateApiForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: "", slug: "", description: "", category: "", tags: "", payment_address: "",
    target_url: "", http_method: "GET", content_type: "application/json", query_params: "",
    example_response: '{\n  "data": [ ... ],\n  "success": true\n}', price: "0.01", is_public: false,
  });
  // Variables (typed variables) → Kage `variables`; the `in` field controls
  // whether the value substitutes into the query, the URL path, or the request body.
  const [vars, setVars] = useState<{ name: string; type: string; in: string; description: string; required: boolean }[]>([]);
  // Auth headers (auth headers) → Kage `auth_headers`; value may be "env:NAME".
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { address } = useWallet();
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          price: Number(f.price),
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          variables: vars.filter((v) => v.name),
          auth_headers: headers.filter((h) => h.name),
          owner_address: address,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "failed");
      onDone();
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to APIs</button>
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Create API</h1>
        <p className="mt-1 text-neutral-400">Set up a payment-gated API proxy using the x402 protocol.</p>
      </div>

      <Panel className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Monetize your API</p>
            <p className="text-sm text-neutral-500">Create a payment-gated proxy for your existing endpoint.</p>
          </div>
          <Button variant="outline"><Terminal className="h-4 w-4" /> Import curl</Button>
        </div>

        <Field label="API Name"><Input placeholder="My Awesome API" value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
        <Field label="Custom URL Slug" hint="(optional)"><Input placeholder="my-awesome-api" value={f.slug} onChange={(e) => set("slug")(e.target.value)} /></Field>
        <Field label="Description" hint="(optional)"><Textarea rows={3} placeholder="Describe what your API does…" value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
        <Field label="Category" hint="Choose a category to help users discover your API">
          <select value={f.category} onChange={(e) => set("category")(e.target.value)} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-accent/60">
            <option value="" className="bg-[#0b0b0b]">Select a category</option>
            {["Payments", "Data", "AI", "Finance", "Social", "DeFi", "Other"].map((c) => <option key={c} value={c} className="bg-[#0b0b0b]">{c}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Add tags to help users find your API (max 10)"><Input placeholder="stellar, zk, x402" value={f.tags} onChange={(e) => set("tags")(e.target.value)} /></Field>
        <Field label="Payment Address" hint="Stellar address (G…) that receives payments"><Input placeholder="G…" value={f.payment_address} onChange={(e) => set("payment_address")(e.target.value)} className="font-mono" /></Field>
        <Field label="Target API URL" hint="the endpoint called after payment"><Input placeholder="https://api.example.com/v1/endpoint" value={f.target_url} onChange={(e) => set("target_url")(e.target.value)} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="HTTP Method">
            <select value={f.http_method} onChange={(e) => set("http_method")(e.target.value)} className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-accent/60">
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m} className="bg-[#0b0b0b]">{m}</option>)}
            </select>
          </Field>
          <Field label="Content Type"><Input value={f.content_type} onChange={(e) => set("content_type")(e.target.value)} /></Field>
        </div>
        <Field label="Query Parameters Template" hint="(optional) use {name}"><Textarea rows={2} placeholder="param1={name1}&param2={name2}" value={f.query_params} onChange={(e) => set("query_params")(e.target.value)} /></Field>

        {/* Variables — typed inputs an agent supplies; substitute {name} into URL/query/body */}
        <div className="space-y-3 rounded-xl border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-semibold text-white">Variables</p><p className="text-xs text-neutral-500">Typed inputs the agent passes; become the tool&apos;s parameters and substitute <span className="font-mono">{"{name}"}</span>.</p></div>
            <Button variant="outline" onClick={() => setVars((v) => [...v, { name: "", type: "string", in: "query", description: "", required: true }])}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {vars.map((v, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_110px_100px_1fr_auto] sm:items-center">
              <Input placeholder="name" value={v.name} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="font-mono" />
              <select value={v.type} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-2 py-2.5 text-sm text-white">
                {["string", "number", "boolean"].map((t) => <option key={t} className="bg-[#0b0b0b]">{t}</option>)}
              </select>
              <select value={v.in} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, in: e.target.value } : x))} className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-2 py-2.5 text-sm text-white">
                {["query", "path", "body"].map((t) => <option key={t} className="bg-[#0b0b0b]">{t}</option>)}
              </select>
              <Input placeholder="description" value={v.description} onChange={(e) => setVars((a) => a.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <button onClick={() => setVars((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {/* Auth headers — sent to the upstream after payment; value may be env:NAME */}
        <div className="space-y-3 rounded-xl border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-semibold text-white">Auth Headers</p><p className="text-xs text-neutral-500">Sent upstream after payment. Use <span className="font-mono">env:NAME</span> to read a server secret.</p></div>
            <Button variant="outline" onClick={() => setHeaders((h) => [...h, { name: "", value: "" }])}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <Input placeholder="Authorization" value={h.name} onChange={(e) => setHeaders((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="font-mono" />
              <Input placeholder="Bearer env:OPENAI_KEY" value={h.value} onChange={(e) => setHeaders((a) => a.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} className="font-mono" />
              <button onClick={() => setHeaders((a) => a.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <Field label="Example Response" hint="(optional)"><Textarea rows={4} value={f.example_response} onChange={(e) => set("example_response")(e.target.value)} /></Field>
        <Field label="Price per Request (USDC)" hint="charged per API call"><Input type="number" step="0.01" value={f.price} onChange={(e) => set("price")(e.target.value)} /></Field>
        <Toggle on={f.is_public} onChange={(v) => setF((s) => ({ ...s, is_public: v }))} label="Make API Public" desc="List this API in the public marketplace" />

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.name || !f.target_url}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Proxy</Button>
        </div>
      </Panel>
    </div>
  );
}
