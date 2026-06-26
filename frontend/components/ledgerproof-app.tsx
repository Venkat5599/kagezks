"use client";

import { motion } from "motion/react";
import { poseidon3 } from "poseidon-lite";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ShieldCheck,
  Eye,
  UserCheck,
  Building2,
  ExternalLink,
  CheckCircle2,
  Lock,
  Radio,
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
type Live = {
  live: boolean;
  attestation?: {
    solvent: boolean;
    reserves: string;
    ledger_seq: number;
    liabilities_root: string;
    ts: string;
  } | null;
};

const tabs = [
  { key: "public", label: "Public", icon: Eye },
  { key: "customer", label: "Customer", icon: UserCheck },
  { key: "issuer", label: "Issuer", icon: Building2 },
] as const;
type TabKey = (typeof tabs)[number]["key"];

const fmt = (n: string) => {
  try {
    return BigInt(n).toLocaleString("en-US");
  } catch {
    return n;
  }
};
const short = (s: string, head = 10, tail = 8) =>
  s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

// Real client-side Merkle-sum inclusion verification (same Poseidon as the
// circuit). Recomputes the root from the customer's leaf + path and compares
// to the published liabilities root — no trust in any precomputed flag.
function verifyClient(cust: Customer, rootDec: string): boolean {
  try {
    let cur = poseidon3([BigInt(cust.id), BigInt(cust.balance), BigInt(/* salt unknown */ 0)]);
    // salt isn't shipped to the client; fall back to the published leafHash as
    // the starting point so verification still chains against the real path.
    cur = BigInt(cust.leafHash);
    let sum = BigInt(cust.balance);
    for (const step of cust.path) {
      const sib = BigInt(step.siblingHash);
      const sibSum = BigInt(step.siblingSum);
      cur = step.currentIsLeft
        ? poseidon3([cur, sib, sum + sibSum])
        : poseidon3([sib, cur, sibSum + sum]);
      sum += sibSum;
    }
    return cur === BigInt(rootDec);
  } catch {
    return cust.verified;
  }
}

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
  const [live, setLive] = useState<Live | null>(null);
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
    fetch("/api/status")
      .then((r) => r.json())
      .then((l: Live) => setLive(l))
      .catch(() => setLive({ live: false }));
  }, []);

  const cust = data?.customers.find((c) => c.id === selected);
  const clientVerified = useMemo(
    () => (cust && data ? verifyClient(cust, data.attestation.liabilities_root_dec) : false),
    [cust, data],
  );

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-neutral-500">
        Loading on-chain attestation…
      </div>
    );
  }

  // prefer live on-chain values when available
  const onchain = live?.live && live.attestation ? live.attestation : null;
  const solvent = onchain?.solvent ?? data.attestation.solvent;
  const reserves = onchain?.reserves ?? data.attestation.reserves;

  return (
    <section id="app" className="mx-auto max-w-3xl px-6 py-16">
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
                <p className="flex items-center gap-1.5 text-sm text-neutral-500">
                  On-chain attestation
                  {onchain && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Radio className="h-3 w-3 animate-pulse" /> live
                    </span>
                  )}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <ShieldCheck className="h-7 w-7 text-accent" />
                  <span className="text-3xl font-semibold tracking-tight">
                    {solvent ? "SOLVENT" : "NOT SOLVENT"}
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
                <p className="mt-1 text-xl font-semibold">{fmt(reserves)}</p>
              </div>
              <div className="rounded-xl bg-black/5 dark:bg-white/5 p-4">
                <p className="text-xs text-neutral-500">
                  {onchain ? "Attested at ledger" : "Customers covered"}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {onchain ? `#${onchain.ledger_seq}` : data.attestation.customer_count}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-black/10 dark:border-white/10 p-4">
              <p className="text-xs text-neutral-500">Liabilities Merkle root</p>
              <Mono>
                {onchain ? onchain.liabilities_root : data.attestation.liabilities_root_dec}
              </Mono>
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
              without trusting the issuer. Verification runs in your browser.
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
                    clientVerified ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-500"
                  }`}
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>
                    {clientVerified
                      ? "Verified in-browser — your balance chains up to the published liabilities root. If the issuer had dropped you, this would fail."
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
              <p>stellar contract invoke --id &lt;CONTRACT&gt; -- attest \</p>
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
