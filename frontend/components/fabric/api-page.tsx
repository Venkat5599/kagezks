"use client";

// One page for every API: what it does, a form to try it, a readable answer, and plain
// instructions for using it from an AI assistant or from code. Works for built-in
// APIs (free, run by Kage) and for APIs users publish (paid per call by agents).
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Store, Play, Loader2, Bot, Code2, TerminalSquare, ChevronDown, ExternalLink } from "lucide-react";
import { Panel, Chip, CopyBtn, Input, Button } from "./ui";
import { useNetwork } from "@/lib/network";

export type ApiVariable = {
  name: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

export type ApiForPage = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  price: string;
  payment_address: string | null;
  is_public: boolean;
  request_count: number;
  success_count?: number;
  earnings?: string;
  builtin?: boolean;
  variables?: ApiVariable[];
  example_args?: Record<string, string>;
  ask?: string;
  servers?: { slug: string; name: string }[];
};

const humanize = (k: string) =>
  /^[A-Z0-9]{2,6}$/.test(k)
    ? k // currency / ticker codes stay as-is
    : k
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/^Xlm\b/, "XLM")
    .replace(/ c$/, " (°C)")
    .replace(/ kmh$/, " (km/h)")
    .replace(/ pct$/, " (%)")
    .replace(/ usd$/, " (USD)")
    .replace(/ xlm$/, " (XLM)");

export function ApiPage({ api, onBack }: { api: ApiForPage; onBack: () => void }) {
  const { network } = useNetwork();
  const vars = useMemo(() => api.variables ?? [], [api.variables]);
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const x of vars) v[x.name] = x.name === "network" ? network : (api.example_args?.[x.name] ?? "");
    return v;
  }, [vars, api.example_args, network]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null);
  const free = api.builtin || Number(api.price) === 0;

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRes(null);
    const args = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
    try {
      if (api.builtin) {
        const r = await fetch(`/api/catalog/${api.slug}?${new URLSearchParams(args)}`);
        const d = await r.json();
        setRes(d.ok ? { ok: true, data: d.data } : { ok: false, error: d.error });
      } else {
        const r = await fetch("/api/fabric/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "api", slug: api.slug ?? api.id, args }),
        });
        const d = await r.json();
        const okHttp = d.ok && (!d.status || d.status < 400);
        setRes(okHttp ? { ok: true, data: d.body } : { ok: false, error: d.error ?? `The API answered with an error (HTTP ${d.status}).`, data: d.body });
      }
    } catch (err) {
      setRes({ ok: false, error: `Couldn't reach the API: ${String((err as Error).message)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to APIs
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10">
          <Store className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{api.name}</h1>
          <p className="mt-1 max-w-2xl text-neutral-400">{api.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip accent>{free ? "Free" : `$${Number(api.price).toFixed(2)} per call`}</Chip>
            {api.builtin && <Chip>by Kage</Chip>}
            {api.category && <Chip>{api.category}</Chip>}
          </div>
        </div>
      </div>

      {/* Try it */}
      <Panel>
        <p className="text-lg font-semibold text-white">Try it</p>
        <p className="mt-1 text-sm text-neutral-500">Fill in the fields and press Run. This makes a real call, so the answer is live.</p>
        <form onSubmit={run} className="mt-5 space-y-4">
          {vars.length === 0 && <p className="text-sm text-neutral-400">Nothing to fill in. Just press Run.</p>}
          {vars.map((v) => (
            <div key={v.name}>
              <label className="block text-sm font-medium text-neutral-200">
                {v.label ?? humanize(v.name)}
                {!v.required && <span className="ml-1.5 text-xs font-normal text-neutral-500">optional</span>}
              </label>
              {v.description && <p className="mt-0.5 text-xs text-neutral-500">{v.description}</p>}
              {v.options ? (
                <div className="mt-2 inline-flex rounded-lg border border-white/[0.1] p-0.5">
                  {v.options.map((o) => (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => setValues((s) => ({ ...s, [v.name]: o.value }))}
                      className={`rounded-md px-3 py-1.5 text-sm transition ${values[v.name] === o.value ? "bg-accent text-black" : "text-neutral-400 hover:text-white"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  className="mt-2"
                  value={values[v.name] ?? ""}
                  placeholder={v.placeholder ?? ""}
                  required={v.required}
                  onChange={(e) => setValues((s) => ({ ...s, [v.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {busy ? "Running…" : "Run"}
          </Button>
        </form>

        {res && (
          <div className="mt-5">
            {res.ok ? <ResultView data={res.data} /> : <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-200">{res.error}</p>}
            {res.data != null && (
              <details className="group mt-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300">
                  <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /> Raw response
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 font-mono text-xs text-neutral-300">
                  {typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Panel>

      <UseIt api={api} values={values} />

      {!api.builtin && (
        <Panel>
          <p className="text-lg font-semibold text-white">Earnings</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Calls" value={api.request_count ?? 0} />
            <Stat label="Successful" value={api.success_count ?? 0} />
            <Stat label="Earned" value={`$${Number(api.earnings ?? 0).toFixed(2)}`} />
          </div>
          {api.payment_address && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-xs">
              <span className="text-neutral-500">Payments go to</span>
              <span className="flex-1 truncate font-mono text-neutral-200">{api.payment_address}</span>
              <CopyBtn text={api.payment_address} />
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

// ---- answer rendering ---------------------------------------------------------------

function Value({ v }: { v: unknown }): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-neutral-600">—</span>;
  if (typeof v === "boolean") return <span className={v ? "text-accent" : "text-red-300"}>{v ? "Yes" : "No"}</span>;
  if (typeof v === "number") return <span>{v.toLocaleString(undefined, { maximumFractionDigits: 7 })}</span>;
  if (typeof v === "string") {
    if (/^https?:\/\//.test(v))
      return (
        <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          Open <ExternalLink className="h-3 w-3" />
        </a>
      );
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return <span>{new Date(v).toLocaleString()}</span>;
    if (v.length > 40 && !v.includes(" "))
      return (
        <span className="inline-flex max-w-full items-center gap-2">
          <span className="truncate font-mono text-xs">{v}</span>
          <CopyBtn text={v} />
        </span>
      );
    return <span>{v}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-neutral-600">none</span>;
    return (
      <div className="space-y-1.5">
        {v.map((item, i) => (
          <div key={i} className="rounded-lg border border-white/[0.06] px-3 py-2">
            {item && typeof item === "object" ? <Rows obj={item as Record<string, unknown>} compact /> : <Value v={item} />}
          </div>
        ))}
      </div>
    );
  }
  if (typeof v === "object") return <Rows obj={v as Record<string, unknown>} compact />;
  return <span>{String(v)}</span>;
}

function Rows({ obj, compact }: { obj: Record<string, unknown>; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1" : "divide-y divide-white/[0.06]"}>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className={`grid grid-cols-[minmax(7rem,12rem)_1fr] gap-3 text-sm ${compact ? "" : "py-2.5"}`}>
          <span className="text-neutral-500">{humanize(k)}</span>
          <div className="min-w-0 text-neutral-100">
            <Value v={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultView({ data }: { data: unknown }) {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Answer</p>
      {data && typeof data === "object" && !Array.isArray(data) ? <Rows obj={data as Record<string, unknown>} /> : <Value v={data} />}
    </div>
  );
}

// ---- how to use it ------------------------------------------------------------------

function UseIt({ api, values }: { api: ApiForPage; values: Record<string, string> }) {
  const [tab, setTab] = useState<"ai" | "code" | "terminal">("ai");
  const qs = new URLSearchParams(Object.entries(values).filter(([, v]) => v.trim() !== "")).toString();
  const url = `https://kageai.me/api/catalog/${api.slug}${qs ? `?${qs}` : ""}`;
  const js = `const res = await fetch("${url}");\nconst { data } = await res.json();\nconsole.log(data);`;
  const curl = `curl "${url}"`;
  const tabs = api.builtin
    ? ([["ai", "AI assistant", Bot], ["code", "Your code", Code2], ["terminal", "Terminal", TerminalSquare]] as const)
    : ([["ai", "AI assistant", Bot]] as const);

  return (
    <Panel>
      <p className="text-lg font-semibold text-white">Use it</p>
      <div className="mt-3 flex gap-1 border-b border-white/[0.08]">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${tab === k ? "border-accent text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <div className="mt-4 space-y-3 text-sm text-neutral-300">
          {api.builtin ? (
            <>
              <p>
                Connect Claude, ChatGPT, Cursor or any assistant that supports MCP to{" "}
                <span className="font-semibold text-white">{api.servers?.[0]?.name ?? "a Kage server"}</span>, then just ask in plain words:
              </p>
              {api.ask && <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white">“{api.ask}”</p>}
              {api.servers?.[0] && (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
                  <span className="text-xs text-neutral-500">Server link</span>
                  <span className="flex-1 truncate font-mono text-xs text-white">https://kageai.me/mcp/{api.servers[0].slug}</span>
                  <CopyBtn text={`https://kageai.me/mcp/${api.servers[0].slug}`} />
                </div>
              )}
              <p className="text-xs text-neutral-500">Paste the link where your assistant asks for a custom connector or MCP server. No account or key needed. Full setup is on the MCP Servers page.</p>
            </>
          ) : (
            <>
              <p>
                Add this API to one of your servers on the <span className="font-semibold text-white">MCP Servers</span> page. Any AI assistant connected to that server can then use it.
              </p>
              <p>
                {Number(api.price) > 0
                  ? `Each call costs $${Number(api.price).toFixed(2)}. The assistant pays it automatically from its Kage session, and the money goes to your payment address.`
                  : "Calls are free."}
              </p>
            </>
          )}
        </div>
      )}

      {tab === "code" && (
        <div className="mt-4">
          <p className="text-sm text-neutral-400">Call it from any website or app. It returns JSON and needs no key.</p>
          <Snippet text={js} />
        </div>
      )}
      {tab === "terminal" && (
        <div className="mt-4">
          <p className="text-sm text-neutral-400">Paste this into a terminal.</p>
          <Snippet text={curl} />
        </div>
      )}
    </Panel>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <div className="relative mt-3">
      <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/60 p-4 pr-12 font-mono text-xs leading-relaxed text-neutral-200">{text}</pre>
      <div className="absolute right-3 top-3">
        <CopyBtn text={text} />
      </div>
    </div>
  );
}
