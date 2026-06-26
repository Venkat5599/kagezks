"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  ShieldCheck,
  Eye,
  UserCheck,
  Building2,
  ExternalLink,
  CheckCircle2,
  Lock,
} from "lucide-react";

type PathNode = { siblingHash: string; siblingSum: string; currentIsLeft: boolean };
type Customer = {
  id: string;
  balance: string;
  leafHash: string;
  path: PathNode[];
  verified: boolean;
};
type Data = {
  deployment: {
    network: string;
    contract_id: string;
    reserve_sac: string;
    reserves: string;
    explorer_tx: string;
    explorer_contract: string;
  };
  attestation: {
    solvent: boolean;
    reserves: string;
    liabilities_root_dec: string;
    total_liabilities: string;
    customer_count: number;
  };
  customers: Customer[];
};

const tabs = [
  { key: "public", label: "Public", icon: Eye },
  { key: "customer", label: "Customer", icon: UserCheck },
  { key: "issuer", label: "Issuer", icon: Building2 },
] as const;
type TabKey = (typeof tabs)[number]["key"];

const fmt = (n: string) => {
  // display as a currency-ish figure (demo units)
  const v = BigInt(n);
  return v.toLocaleString("en-US");
};
const short = (s: string, head = 10, tail = 8) =>
  s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-sm break-all">{children}</span>;
}

export function LedgerproofApp(): ReactNode {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<TabKey>("public");
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetch("/ledgerproof.json")
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d);
        setSelected(d.customers[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-neutral-500">
        Loading on-chain attestation…
      </div>
    );
  }

  const cust = data.customers.find((c) => c.id === selected);

  return (
    <section id="app" className="mx-auto max-w-3xl px-6 py-16">
      {/* tab switch */}
      <div className="mx-auto mb-8 flex w-fit items-center gap-1 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-1 backdrop-blur">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        {/* PUBLIC */}
        {tab === "public" && (
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">On-chain attestation</p>
                <div className="mt-1 flex items-center gap-2">
                  <ShieldCheck className="h-7 w-7 text-accent" />
                  <span className="text-3xl font-semibold tracking-tight">
                    {data.attestation.solvent ? "SOLVENT" : "NOT SOLVENT"}
                  </span>
                </div>
              </div>
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                {data.deployment.network}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-black/5 dark:bg-white/5 p-4">
                <p className="text-xs text-neutral-500">Reserves (read on-chain)</p>
                <p className="mt-1 text-xl font-semibold">{fmt(data.attestation.reserves)}</p>
              </div>
              <div className="rounded-xl bg-black/5 dark:bg-white/5 p-4">
                <p className="text-xs text-neutral-500">Customers covered</p>
                <p className="mt-1 text-xl font-semibold">{data.attestation.customer_count}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-black/10 dark:border-white/10 p-4">
              <p className="text-xs text-neutral-500">Liabilities Merkle root</p>
              <Mono>{data.attestation.liabilities_root_dec}</Mono>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Zero customer balances appear on-chain. Only the reserve total and a Merkle
                root are public.
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={data.deployment.explorer_tx}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                View attestation tx <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={data.deployment.explorer_contract}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium"
              >
                View contract <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </Card>
        )}

        {/* CUSTOMER */}
        {tab === "customer" && (
          <Card>
            <p className="text-sm text-neutral-500">
              Act as a customer — verify your balance was counted in the proven total,
              without trusting the issuer.
            </p>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-4 w-full rounded-xl border border-black/10 dark:border-white/10 bg-transparent px-4 py-2.5 text-sm"
            >
              {data.customers.map((c) => (
                <option key={c.id} value={c.id} className="text-black">
                  Customer #{c.id}
                </option>
              ))}
            </select>

            {cust && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-black/5 dark:bg-white/5 p-4">
                    <p className="text-xs text-neutral-500">Your balance (only you see this)</p>
                    <p className="mt-1 text-xl font-semibold">{fmt(cust.balance)}</p>
                  </div>
                  <div className="rounded-xl bg-black/5 dark:bg-white/5 p-4">
                    <p className="text-xs text-neutral-500">Merkle path length</p>
                    <p className="mt-1 text-xl font-semibold">{cust.path.length}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
                  <p className="text-xs text-neutral-500">Your leaf hash</p>
                  <Mono>{short(cust.leafHash, 18, 14)}</Mono>
                </div>

                <div
                  className={`flex items-center gap-2 rounded-xl p-4 text-sm ${
                    cust.verified
                      ? "bg-accent/10 text-accent"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>
                    {cust.verified
                      ? "Verified — your balance is included in the proven liabilities root. If the issuer had dropped you, this check would fail."
                      : "NOT included."}
                  </span>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ISSUER */}
        {tab === "issuer" && (
          <Card>
            <p className="text-sm text-neutral-500">
              The issuer proves solvency from its private ledger — and cannot lie about
              reserves, because the contract reads them itself.
            </p>
            <ol className="mt-5 space-y-3">
              {[
                "Contract reads live reserve balances on-chain (SAC) → R",
                "Issuer generates a Groth16 proof: Σ liabilities ≤ R, every balance in range, all hidden",
                "attest() binds the proof's total_reserves to R, verifies the proof (BN254) in-contract",
                "Publishes SOLVENT + liabilities root on-chain — no balance revealed",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-xl bg-black/90 p-4 font-mono text-xs text-neutral-200">
              <p className="text-neutral-400"># reproduce</p>
              <p>bun run scripts/prove.ts</p>
              <p>
                stellar contract invoke --id &lt;CONTRACT&gt; -- attest \
              </p>
              <p className="pl-4">
                --proof-file-path sdk/build/proof.json --liabilities_root &lt;root&gt;
              </p>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Drop reserves below liabilities and the proof can&apos;t be generated — and any
                stale proof is rejected on-chain (InvalidProof).
              </span>
            </div>
          </Card>
        )}
      </motion.div>
    </section>
  );
}
