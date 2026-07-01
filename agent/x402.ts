// x402 usage-based metering for Veil agent tools.
//
// x402 is "HTTP 402 Payment Required, done properly": a paid endpoint answers an
// unpaid request with a 402 + a machine-readable quote; the caller retries with a
// payment proof in a header; the server verifies and then runs the tool. This
// gives pay-per-call economics for an agent's tool use.
//
// Native x402 is EVM-oriented; here the settlement asset is **Stellar USDC** — the
// per-call fee is a tiny USDC payment to the operator. Honest scope (see
// frontend/Plans): the 402 handshake, the quote, and the retry path are real; the
// on-chain settlement *verification* is a documented stub for the demo (any
// non-empty, well-formed X-PAYMENT proof for a live nonce is accepted). Swapping
// the stub for a real Horizon payment lookup is a one-function change (`verifyPayment`).
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";

export type Quote = {
  scheme: "stellar-usdc";
  network: "testnet" | "mainnet";
  /** stroops-style 7-decimal USDC amount, as string */
  amount: string;
  /** operator address the fee is paid to */
  payTo: string;
  /** one-time challenge the caller echoes back in its payment proof */
  nonce: string;
  /** unix seconds after which this quote is dead */
  expiresAt: number;
};

export type PaymentProof = {
  nonce: string;
  /** a Stellar payment tx hash (or signed intent) — verified by `verifyPayment` */
  txHash?: string;
  payer?: string;
};

const NONCE_TTL_SECONDS = 300;
const issued = new Map<string, Quote>(); // nonce -> quote (in-memory; fine for a demo)

function gc() {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, q] of issued) if (q.expiresAt < now) issued.delete(nonce);
}

export function quoteFor(amountUsdc: string, payTo: string, network: Quote["network"] = "testnet"): Quote {
  gc();
  const nonce = randomBytes(16).toString("hex");
  const quote: Quote = {
    scheme: "stellar-usdc",
    network,
    amount: amountUsdc,
    payTo,
    nonce,
    expiresAt: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
  };
  issued.set(nonce, quote);
  return quote;
}

// Stub — accept any well-formed proof for a live, unexpired nonce. Replace with a
// real Horizon lookup: confirm a USDC payment of `quote.amount` to `quote.payTo`
// referencing `nonce` (memo) landed and is SUCCESS. Kept isolated on purpose.
export async function verifyPayment(proof: PaymentProof): Promise<{ ok: boolean; reason?: string }> {
  gc();
  const quote = issued.get(proof.nonce);
  if (!quote) return { ok: false, reason: "unknown or expired nonce" };
  if (!proof.txHash && !proof.payer) return { ok: false, reason: "empty payment proof" };
  issued.delete(proof.nonce); // one-shot: a paid nonce can't be replayed
  return { ok: true };
}

function parseProofHeader(raw: string | undefined): PaymentProof | null {
  if (!raw) return null;
  try {
    // Support both base64(JSON) and raw JSON in the X-PAYMENT header.
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const p = JSON.parse(json) as PaymentProof;
    return p?.nonce ? p : null;
  } catch {
    return null;
  }
}

// Express middleware factory. `price(req)` returns the USDC amount for this call.
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
      res.status(402).json({
        error: "payment required",
        x402Version: 1,
        accepts: [quote],
        hint: "retry with an X-PAYMENT header: base64(JSON) of { nonce, txHash, payer }",
      });
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
