"use client";

import { useState, type ReactNode } from "react";
import {
  requestAccess,
  getAddress,
  signTransaction,
  isConnected as freighterInstalled,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Dice5,
  CircleAlert,
} from "lucide-react";
import { generateMetaAddress, stealthSeed } from "@/lib/veil-browser";
import { deposit, withdraw, type SignFn } from "@/lib/veil-chain";
import { Keypair } from "@stellar/stellar-sdk";

const sign: SignFn = async (x) => {
  const res = await signTransaction(x, { networkPassphrase: Networks.TESTNET });
  if (typeof res === "string") return res;
  if (res?.signedTxXdr) return res.signedTxXdr;
  throw new Error(res?.error ? String(res.error) : "wallet did not sign");
};

const txUrl = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-black/[0.05] bg-black/[0.03] p-1.5 dark:border-white/[0.06] dark:bg-white/[0.05]">
      <div className="rounded-[1.4rem] bg-white/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/[0.04] backdrop-blur-xl dark:bg-[#0b0b0b]/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/[0.05]">
        {children}
      </div>
    </div>
  );
}
function Label({ children }: { children: ReactNode }) {
  return <label className="text-xs font-medium text-neutral-500">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      suppressHydrationWarning
      className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 font-mono text-sm focus:border-accent focus:outline-none dark:border-white/10"
    />
  );
}
function Btn({ children, disabled, onClick, kind = "solid" }: { children: ReactNode; disabled?: boolean; onClick: () => void; kind?: "solid" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
        kind === "solid"
          ? "bg-accent text-black hover:brightness-105"
          : "border border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
function Status({ step, error, hash }: { step?: string | undefined; error?: string | undefined; hash?: string | undefined }) {
  if (error)
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
        <CircleAlert className="h-4 w-4 shrink-0" /> {error}
      </p>
    );
  if (hash)
    return (
      <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm text-accent">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> confirmed on testnet — view tx <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  if (step)
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-black/5 p-3 text-sm text-neutral-500 dark:bg-white/5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {step}…
      </p>
    );
  return null;
}

export function VeilActions({ address, onConnect }: { address: string | null; onConnect: (a: string) => void }) {
  // a self-contained note the user can deposit then withdraw
  const [meta, setMeta] = useState<{ scanPriv: string; scanPub: string } | null>(null);
  const [amount, setAmount] = useState("1.00");
  const [ephemeralPub, setEphemeralPub] = useState("");
  const [payout, setPayout] = useState("");

  const [dStep, setDStep] = useState<string>();
  const [dErr, setDErr] = useState<string>();
  const [dHash, setDHash] = useState<string>();
  const [wStep, setWStep] = useState<string>();
  const [wErr, setWErr] = useState<string>();
  const [wHash, setWHash] = useState<string>();

  const connect = async () => {
    try {
      const inst = await freighterInstalled();
      if (typeof inst === "object" && inst?.isConnected === false)
        throw new Error("Freighter not detected — install the extension");
      const acc = await requestAccess();
      const addr = typeof acc === "string" ? acc : acc?.address || (await getAddress()).address;
      if (!addr) throw new Error("no address from wallet");
      onConnect(addr);
      if (!payout) setPayout(addr);
    } catch (e) {
      setDErr(String((e as Error).message || e));
    }
  };

  const newNote = () => {
    const m = generateMetaAddress();
    setMeta(m);
    setDHash(undefined);
    setDErr(undefined);
  };

  const toBase = (v: string) => BigInt(Math.round(parseFloat(v || "0") * 1e7));

  const doDeposit = async () => {
    if (!address || !meta) return;
    setDErr(undefined); setDHash(undefined);
    try {
      const res = await deposit(address, meta.scanPub, toBase(amount), sign, setDStep);
      setDStep(undefined);
      setDHash(res.hash);
      // auto-fill the withdraw side so the loop is runnable
      setEphemeralPub(res.note.ephemeralPub);
      const kp = Keypair.fromRawEd25519Seed(Buffer.from(stealthSeed(meta.scanPriv, res.note.ephemeralPub)));
      void kp; // stealth addr would need funding; default payout stays the connected wallet
    } catch (e) {
      setDStep(undefined);
      setDErr(String((e as Error).message || e));
    }
  };

  const doWithdraw = async () => {
    if (!address || !meta) return;
    setWErr(undefined); setWHash(undefined);
    try {
      const res = await withdraw(address, meta.scanPriv, ephemeralPub, toBase(amount), payout || address, sign, setWStep);
      setWStep(undefined);
      setWHash(res.hash);
    } catch (e) {
      setWStep(undefined);
      setWErr(String((e as Error).message || e));
    }
  };

  return (
    <div className="space-y-5">
      {/* CONNECT */}
      <Panel>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium">Wallet</p>
              <p className="font-mono text-xs text-neutral-500">
                {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "not connected"}
              </p>
            </div>
          </div>
          {address ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" /> connected
            </span>
          ) : (
            <Btn onClick={connect}>
              <Wallet className="h-4 w-4" /> Connect Freighter
            </Btn>
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Stellar testnet. Your wallet signs the deposit/withdraw and pays fees. Get testnet
          XLM from <a className="text-accent" href="https://lab.stellar.org/account/fund" target="_blank" rel="noreferrer">the friendbot</a>.
        </p>
      </Panel>

      {/* DEPOSIT */}
      <Panel>
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="h-5 w-5 text-accent" />
          <p className="font-medium">Deposit a private payment note</p>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Generates a stealth note, proves the Merkle insert in your browser, and deposits the
          commitment. The chain never sees who it is for.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Amount (USDC)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label>Recipient scan key</Label>
            <div className="mt-1 flex gap-2">
              <input
                value={meta?.scanPub ?? ""}
                readOnly
                placeholder="generate a note →"
                suppressHydrationWarning
                className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 font-mono text-xs focus:outline-none dark:border-white/10"
              />
              <Btn kind="ghost" onClick={newNote}>
                <Dice5 className="h-4 w-4" />
              </Btn>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Btn onClick={doDeposit} disabled={!address || !meta || !!dStep}>
            {dStep ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            Deposit
          </Btn>
        </div>
        <Status step={dStep} error={dErr} hash={dHash} />
      </Panel>

      {/* WITHDRAW */}
      <Panel>
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-5 w-5 text-accent" />
          <p className="font-medium">Withdraw your funds</p>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Proves membership of your note in zero-knowledge (without revealing which leaf) and
          pays out to the address you choose — bound into the proof.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Ephemeral key (from your deposit)</Label>
            <Input value={ephemeralPub} onChange={(e) => setEphemeralPub(e.target.value)} placeholder="auto-filled after deposit" />
          </div>
          <div>
            <Label>Amount (USDC)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label>Payout address</Label>
            <Input value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="G… (must exist/funded)" />
          </div>
        </div>

        <div className="mt-4">
          <Btn onClick={doWithdraw} disabled={!address || !meta || !ephemeralPub || !!wStep}>
            {wStep ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
            Withdraw
          </Btn>
        </div>
        <Status step={wStep} error={wErr} hash={wHash} />
        <p className="mt-3 text-xs text-neutral-400">
          Tip: deposit first (fills the ephemeral key), keep the same note generated above, then
          withdraw to your own funded address to see the full loop.
        </p>
      </Panel>
    </div>
  );
}
