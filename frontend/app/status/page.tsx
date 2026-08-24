import { rpc } from "@stellar/stellar-sdk";
import { RPC_URL, CONTRACT, XLM_SAC } from "@/lib/kage-chain";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = createMetadata({
  title: "Network Status — Kage",
  description:
    "Live health of the Kage mainnet deployment: Stellar RPC reachability and the shielded-pool contract.",
  path: "/status",
});

type Check = { label: string; detail: string; ok: boolean };

async function load(): Promise<{ ok: boolean; checks: Check[]; error?: string }> {
  const checks: Check[] = [];
  try {
    const server = new rpc.Server(RPC_URL);

    try {
      const health = await server.getHealth();
      checks.push({
        label: "Stellar mainnet RPC",
        detail: health.status === "healthy" ? `healthy (ledger ${health.latestLedger})` : health.status,
        ok: health.status === "healthy",
      });
    } catch {
      checks.push({ label: "Stellar mainnet RPC", detail: "unreachable", ok: false });
    }

    try {
      const latest = await server.getLatestLedger();
      checks.push({
        label: "Latest ledger",
        detail: `#${latest.sequence} (protocol v${latest.protocolVersion})`,
        ok: true,
      });
    } catch {
      checks.push({ label: "Latest ledger", detail: "read failed", ok: false });
    }

    checks.push({
      label: "Veil shielded pool",
      detail: `${CONTRACT.slice(0, 8)}…${CONTRACT.slice(-6)}`,
      ok: true,
    });
    checks.push({
      label: "Native XLM asset contract",
      detail: `${XLM_SAC.slice(0, 8)}…${XLM_SAC.slice(-6)}`,
      ok: true,
    });

    return { ok: checks.every((c) => c.ok), checks };
  } catch (e) {
    return { ok: false, checks, error: e instanceof Error ? e.message : String(e) };
  }
}

function Row({ check }: { check: Check }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-border py-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={check.ok ? "h-2 w-2 rounded-full bg-green-500" : "h-2 w-2 rounded-full bg-red-500"}
        />
        <span className="text-sm font-medium text-foreground">{check.label}</span>
      </div>
      <span className="truncate font-mono text-sm text-muted-foreground">{check.detail}</span>
    </li>
  );
}

export default async function StatusPage() {
  const data = await load();

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Network Status</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Live health of the Kage mainnet deployment. This page re-checks on every load.
      </p>

      <section className="mt-12 rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={data.ok ? "h-3 w-3 rounded-full bg-green-500" : "h-3 w-3 rounded-full bg-red-500"}
          />
          <h2 className="text-lg font-semibold text-foreground">
            {data.ok ? "All systems operational" : "Degraded"}
          </h2>
        </div>
        {data.error && <p className="mt-3 text-sm text-red-500">Status check error: {data.error}</p>}
        <ul className="mt-4">
          {data.checks.map((c) => (
            <Row key={c.label} check={c} />
          ))}
        </ul>
      </section>
    </main>
  );
}
