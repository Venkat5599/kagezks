// Landing section: the Stellar MCP servers any AI assistant can connect to. Server
// component: the list comes straight from the built-in catalog, so it never drifts
// from what the endpoints actually serve.
import type { ReactNode } from "react";
import { ArrowUpRight, Server } from "lucide-react";
import { builtinMcpRowsFull } from "@/lib/builtin-workflows";

export function AgentToolkit(): ReactNode {
  const servers = builtinMcpRowsFull();
  const all = servers.find((s) => s.slug === "stellar-tools");
  const rest = servers.filter((s) => s.slug !== "stellar-tools");
  const abilities = all?.cards.length ?? 0;

  return (
    <section id="agent-tools" className="relative w-full bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="max-w-2xl">
          <span className="text-sm font-medium text-muted-foreground">Agent tools</span>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Give your AI assistant Stellar.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-foreground/60">
            Connect Claude, ChatGPT or Cursor to a Kage MCP server and your assistant can check wallets, read transactions, quote swaps and price tokens on Stellar, live, on mainnet or testnet.
            {abilities > 0 && ` ${abilities} abilities, free, no account and no API key.`}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {rest.map((s) => (
            <div key={s.slug} className="flex flex-col rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-accent" />
                <p className="font-semibold text-foreground">{s.display_name}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/60">{s.description}</p>
              <div className="mt-4 space-y-1.5">
                {s.cards.slice(0, 3).map((c) => (
                  <p key={c.tool} className="rounded-lg bg-foreground/[0.04] px-3 py-2 text-xs italic text-foreground/80">
                    &quot;{c.ask}&quot;
                  </p>
                ))}
              </div>
              <p className="mt-auto pt-4 font-mono text-[11px] text-foreground/50">kageai.me/mcp/{s.slug}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-foreground/10 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-foreground">Want everything in one connection?</p>
            <p className="mt-1 font-mono text-sm text-foreground/60">https://kageai.me/mcp/stellar-tools</p>
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Try them in the dashboard <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
