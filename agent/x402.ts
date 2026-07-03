// x402 usage-based metering for Kage agent tools.
//
// x402 is "HTTP 402 Payment Required, done properly": a paid endpoint answers an
// unpaid request with a 402 + a machine-readable quote; the caller retries with a
// payment proof; the server verifies the payment ON-CHAIN and then runs the tool.
// This gives real pay-per-call economics for an agent's tool use.
//
// Settlement asset is Stellar (testnet) — a tiny native payment to the operator,
// bound to the quote via a memo-hash of the one-time nonce. Verification is REAL:
// `verifyPayment` looks the tx up on Horizon and confirms it succeeded, is a
// payment of >= the quoted amount to the operator, and carries the nonce's memo.
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "node:crypto";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Networks,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";

const HORIZON = process.env.VEIL_HORIZON ?? "https://horizon-testnet.stellar.org";
const memoHash = (nonce: string) => createHash("sha256").update(nonce).digest();

export type Quote = {
  scheme: "stellar-native";
  network: "testnet" | "mainnet";
  amount: string; // 7-decimal, as string
  payTo: string; // operator address the fee is paid to
  nonce: string; // one-time challenge, bound into the payment memo
  expiresAt: number;
};

export type PaymentProof = { nonce: string; txHash?: string; payer?: string };

const NONCE_TTL_SECONDS = 600;
const issued = new Map<string, Quote>();
const consumed = new Set<string>(); // spent txHashes — no replay

function gc() {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, q] of issued) if (q.expiresAt < now) issued.delete(nonce);
}

export function quoteFor(amount: string, payTo: string, network: Quote["network"] = "testnet"): Quote {
  gc();
  const nonce = randomBytes(16).toString("hex");
  const quote: Quote = {
    scheme: "stellar-native",
    network,
    amount,
    payTo,
    nonce,
    expiresAt: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
  };
  issued.set(nonce, quote);
  return quote;
}

// Client helper: actually pay the x402 fee. Sends a native payment of the quoted
// amount to the operator, memo = sha256(nonce), and returns the tx hash to echo back.
export async function payX402(secret: string, quote: Pick<Quote, "amount" | "payTo" | "nonce">): Promise<string> {
  const kp = Keypair.fromSecret(secret);
  const server = new Horizon.Server(HORIZON);
  const account = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({ destination: quote.payTo, asset: Asset.native(), amount: (Number(quote.amount) / 1e7).toFixed(7) }),
    )
    .addMemo(Memo.hash(memoHash(quote.nonce)))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  return res.hash;
}

// Real verification against Horizon.
export async function verifyPayment(proof: PaymentProof): Promise<{ ok: boolean; reason?: string }> {
  gc();
  const quote = issued.get(proof.nonce);
  if (!quote) return { ok: false, reason: "unknown or expired nonce" };
  if (!proof.txHash) return { ok: false, reason: "missing txHash" };
  if (consumed.has(proof.txHash)) return { ok: false, reason: "payment already used" };

  const server = new Horizon.Server(HORIZON);
  let tx: Horizon.ServerApi.TransactionRecord;
  try {
    tx = await server.transactions().transaction(proof.txHash).call();
  } catch {
    return { ok: false, reason: "payment tx not found (not yet on ledger?)" };
  }
  if (!tx.successful) return { ok: false, reason: "payment tx failed" };
  if (tx.memo_type !== "hash" || !tx.memo || Buffer.from(tx.memo, "base64").toString("hex") !== memoHash(quote.nonce).toString("hex")) {
    return { ok: false, reason: "payment memo does not bind the quote nonce" };
  }
  const ops = await server.operations().forTransaction(proof.txHash).limit(20).call();
  const paid = ops.records.some(
    (o) =>
      o.type === "payment" &&
      (o as Horizon.ServerApi.PaymentOperationRecord).to === quote.payTo &&
      (o as Horizon.ServerApi.PaymentOperationRecord).asset_type === "native" &&
      Math.round(Number((o as Horizon.ServerApi.PaymentOperationRecord).amount) * 1e7) >= Number(quote.amount),
  );
  if (!paid) return { ok: false, reason: "no matching payment to the operator" };

  consumed.add(proof.txHash);
  issued.delete(proof.nonce);
  return { ok: true };
}

function parseProofHeader(raw: string | undefined): PaymentProof | null {
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const p = JSON.parse(json) as PaymentProof;
    return p?.nonce ? p : null;
  } catch {
    return null;
  }
}

// Express middleware factory.
export function x402({
  price,
  payTo,
  network = "testnet",
}: {
  price: (req: Request) => string;
  payTo: string;
  network?: Quote["network"];
}) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const proof = parseProofHeader(req.header("x-payment") ?? req.header("X-PAYMENT"));
    if (!proof) {
      const quote = quoteFor(price(req), payTo, network);
      res.status(402).json({ error: "payment required", x402Version: 1, accepts: [quote] });
      return;
    }
    const v = await verifyPayment(proof);
    if (!v.ok) {
      res.status(402).json({ error: "payment invalid", reason: v.reason });
      return;
    }
    next();
  };
}
