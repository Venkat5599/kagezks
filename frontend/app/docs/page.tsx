import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "API Reference — Kage",
  description:
    "Developer reference for the Kage API: pool reads, agent fabric, feedback, metrics, MCP servers, and workflows.",
  path: "/docs",
});

type Endpoint = {
  method: string;
  path: string;
  desc: string;
};

const endpoints: Endpoint[] = [
  { method: "GET", path: "/api/kage", desc: "Live on-chain pool state — current root, leaf count, spent nullifiers, SAC balance, and real deposit/withdraw events straight from Stellar RPC." },
  { method: "GET", path: "/api/stats", desc: "Dashboard aggregates (APIs, requests, earnings) plus live on-chain session + pool reads for the scoped-key panel." },
  { method: "GET", path: "/api/activity", desc: "Recent fabric activity feed — newest published APIs, workflows, and MCP servers, unioned by creation time." },
  { method: "GET", path: "/api/metrics", desc: "Growth metrics: wallets onboarded, wallets that transacted, on-chain actions, and feedback rating distribution." },
  { method: "GET", path: "/api/logs", desc: "Recent on-chain action log with per-transaction explorer links." },
  { method: "POST", path: "/api/feedback", desc: "Capture in-app feedback, mirroring the Google Form fields one-for-one so responses merge into a single sheet." },
  { method: "GET", path: "/api/users", desc: "Onboarded users and their on-chain status." },
  { method: "GET", path: "/api/wallet-status", desc: "Wallet connection and balance status." },
  { method: "POST", path: "/api/fabric/provision", desc: "Provision a scoped per-user SessionAccount with cap and expiry policy." },
  { method: "POST", path: "/api/fabric/run", desc: "Run an agent-facing action through the provisioned session key." },
  { method: "POST", path: "/api/agent/run", desc: "Execute an agent request under its bounded session policy." },
  { method: "GET", path: "/api/agent/status", desc: "Agent session and policy status." },
  { method: "GET", path: "/api/apis", desc: "Public APIs published on the agent marketplace." },
  { method: "GET", path: "/api/mcp-servers", desc: "List registered MCP servers." },
  { method: "GET", path: "/api/mcp-servers/[slug]", desc: "Resolve a single MCP server by slug." },
  { method: "GET", path: "/api/workflows", desc: "Available workflows." },
];

function EndpointRow({ ep }: { ep: Endpoint }) {
  const methodColor =
    ep.method === "GET"
      ? "bg-accent/10 text-accent"
      : "bg-foreground/10 text-foreground";
  return (
    <li className="border-t border-border py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${methodColor}`}>
          {ep.method}
        </span>
        <code className="font-mono text-sm text-foreground">{ep.path}</code>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{ep.desc}</p>
    </li>
  );
}

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">API Reference</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Every endpoint the Kage product exposes. All reads are live — backed by real
        on-chain state and real database rows, never seeded values.
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
        <ul className="mt-2">
          {endpoints.map((ep) => (
            <EndpointRow key={ep.path + ep.method} ep={ep} />
          ))}
        </ul>
      </section>
    </main>
  );
}
