"use client";

// Send XLM on Stellar testnet — the core White Belt requirement.
// Works with both Freighter (real wallet) and generated (browser keypair) wallets.
import { useState, type FormEvent } from "react";
import { Send, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Panel } from "./ui";
import {
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Operation,
  Asset,
  Keypair,
} from "@stellar/stellar-sdk";

const RPC_URL = "https://mainnet.sorobanrpc.com";

type TxResult = { ok: true; hash: string } | { ok: false; error: string };

type SignResult = { ok: true; xdr: string } | { ok: false; error: string };

// Sign an XDR with Freighter. Prefers the official @stellar/freighter-api adapter
// (v6 talks over an extension messaging bridge and injects nothing on the page),
// and falls back to the legacy `window.freighterApi` object for Freighter <=v5.
// Imported lazily so the module never evaluates during SSR.
async function signWithFreighter(xdr: string): Promise<SignResult> {
  try {
    const api = await import("@stellar/freighter-api");
    const res = await api.signTransaction(xdr, {
      networkPassphrase: Networks.PUBLIC,
    });
    if (!res.error && res.signedTxXdr) return { ok: true, xdr: res.signedTxXdr };
  } catch {
    /* fall through to the legacy object */
  }

  const legacy =
    typeof window !== "undefined"
      ? (
          window as unknown as {
            freighterApi?: {
              signTransaction?: (x: string, o?: unknown) => Promise<unknown>;
            };
          }
        ).freighterApi
      : undefined;
  if (legacy?.signTransaction) {
    try {
      const r = await legacy.signTransaction(xdr, {
        networkPassphrase: Networks.PUBLIC,
      });
      // <=v5 returned the XDR string directly; v6-shaped objects carry signedTxXdr.
      const signed =
        typeof r === "string" ? r : (r as { signedTxXdr?: string })?.signedTxXdr;
      if (signed) return { ok: true, xdr: signed };
    } catch {
      /* reported below */
    }
  }

  return {
    ok: false,
    error:
      "Freighter could not sign. Unlock the extension, make sure it is set to Testnet, and approve the signing prompt — then try again.",
  };
}

export function SendXlm() {
  const { address, secret, real } = useWallet();
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  if (!address) return null; // only show when wallet is connected

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dest || !amount) return;
    setSending(true);
    setResult(null);

    try {
      // Validate destination
      let destKeypair: Keypair;
      try {
        destKeypair = Keypair.fromPublicKey(dest.trim());
      } catch {
        setResult({ ok: false, error: "Invalid destination Stellar address" });
        setSending(false);
        return;
      }

      const amountXlm = amount.trim();

      const server = new rpc.Server(RPC_URL);
      const srcAccount = await server.getAccount(address);

      const tx = new TransactionBuilder(srcAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.PUBLIC,
      })
        .addOperation(
          Operation.payment({
            destination: destKeypair.publicKey(),
            asset: Asset.native(),
            amount: amountXlm,
          })
        )
        .setTimeout(60)
        .build();

      const prepared = await server.prepareTransaction(tx);
      let signedXdr: string;

      if (real) {
        // Freighter wallet — sign in the extension. Uses the official adapter:
        // Freighter v6 no longer injects `window.freighterApi`, so probing the
        // window object alone fails on every current install.
        const signed = await signWithFreighter(prepared.toXDR());
        if (!signed.ok) {
          setResult({ ok: false, error: signed.error });
          setSending(false);
          return;
        }
        signedXdr = signed.xdr;
      } else if (secret) {
        // Generated wallet — sign with stored secret
        const kp = Keypair.fromSecret(secret);
        prepared.sign(kp);
        signedXdr = prepared.toXDR();
      } else {
        setResult({ ok: false, error: "No signing key available. Reconnect your wallet." });
        setSending(false);
        return;
      }

      const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.PUBLIC);
      const sent = await server.sendTransaction(signedTx);

      if (sent.status === "ERROR") {
        const msg =
          sent.errorResult && typeof sent.errorResult === "object"
            ? String(
                (sent.errorResult as unknown as Record<string, unknown>).result ||
                  JSON.stringify(sent.errorResult)
              )
            : "Transaction failed";
        setResult({ ok: false, error: msg.substring(0, 200) });
      } else {
        setResult({ ok: true, hash: sent.hash });
      }
    } catch (e) {
      setResult({ ok: false, error: String((e as Error).message).substring(0, 200) });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setDest("");
    setAmount("");
    setResult(null);
  };

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-accent" />
        <p className="text-lg font-semibold text-white">Send XLM</p>
        <span className="text-xs text-neutral-500">· Stellar testnet</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Send XLM to any Stellar testnet address. Sign with your connected wallet.
      </p>

      {result ? (
        // --- RESULT STATE ---
        <div
          className={`mt-5 rounded-xl border p-5 ${
            result.ok
              ? "border-accent/30 bg-accent/[0.06]"
              : "border-red-500/30 bg-red-500/[0.06]"
          }`}
        >
          {result.ok ? (
            <>
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Transaction successful</span>
              </div>
              <div className="mt-3 space-y-1 font-mono text-xs text-neutral-300">
                <p>
                  <span className="text-neutral-500">TX hash:</span> {result.hash}
                </p>
              </div>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${result.hash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
              >
                View on Stellar Expert <ExternalLink className="h-3 w-3" />
              </a>
              <button
                onClick={reset}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-neutral-300 transition hover:border-accent/40 hover:text-white"
              >
                Send another
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Transaction failed</span>
              </div>
              <p className="mt-2 text-sm text-red-300/80">{result.error}</p>
              <button
                onClick={reset}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-neutral-300 transition hover:border-accent/40 hover:text-white"
              >
                Try again
              </button>
            </>
          )}
        </div>
      ) : (
        // --- FORM STATE ---
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-neutral-400">Destination address</span>
            <input
              type="text"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="G…"
              className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-accent/60"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-400">Amount (XLM)</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
              className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-accent/60"
              required
            />
            <p className="mt-1 text-[11px] text-neutral-600">
              Enter amount in XLM. Fee: 0.00001 XLM per transaction.
            </p>
          </label>

          <button
            type="submit"
            disabled={sending || !dest.trim() || !amount.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send XLM
              </>
            )}
          </button>
        </form>
      )}
    </Panel>
  );
}
