"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Store, Loader2, Terminal, Search } from "lucide-react";
import { Panel, Field, Input, Textarea, Button, Toggle, Chip, Empty, short } from "./ui";

type Api = {
  id: string; name: string; slug: string | null; description: string | null; category: string | null;
  tags: string[]; payment_address: string | null; target_url: string; http_method: string;
  price: string; is_public: boolean; request_count: number;
};

export function ApisSection() {
  const [creating, setCreating] = useState(false);
  const [apis, setApis] = useState<Api[] | null>(null);
  const [q, setQ] = useState("");

  const load = () => fetch("/api/apis").then((r) => r.json()).then((d) => setApis(d.apis ?? [])).catch(() => setApis([]));
  useEffect(() => { load(); }, []);

  if (creating) return <CreateApiForm onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;

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
            <Panel key={a.id} className="transition hover:border-accent/40">
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
          ))}
        </div>
      )}
    </div>
  );
}

function CreateApiForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: "", slug: "", description: "", category: "", tags: "", payment_address: "",
    target_url: "", http_method: "GET", content_type: "application/json", query_params: "",
    example_response: '{\n  "data": [ ... ],\n  "success": true\n}', price: "0.01", is_public: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, price: Number(f.price), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
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
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" hint="(optional)"><Input placeholder="Payments, Data, AI…" value={f.category} onChange={(e) => set("category")(e.target.value)} /></Field>
          <Field label="Tags" hint="(comma-separated)"><Input placeholder="stellar, zk, x402" value={f.tags} onChange={(e) => set("tags")(e.target.value)} /></Field>
        </div>
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
        <Field label="Query Parameters Template" hint="(optional) use {{var}}"><Textarea rows={2} placeholder="param1={{variable1}}&param2={{variable2}}" value={f.query_params} onChange={(e) => set("query_params")(e.target.value)} /></Field>
        <Field label="Example Response" hint="(optional)"><Textarea rows={4} value={f.example_response} onChange={(e) => set("example_response")(e.target.value)} /></Field>
        <Field label="Price per Request (USDC)" hint="charged per API call"><Input type="number" step="0.01" value={f.price} onChange={(e) => set("price")(e.target.value)} /></Field>
        <Toggle on={f.is_public} onChange={(v) => setF((s) => ({ ...s, is_public: v }))} label="Make API Public" desc="List this API in the public marketplace" />

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.name || !f.target_url}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create API</Button>
        </div>
      </Panel>
    </div>
  );
}
