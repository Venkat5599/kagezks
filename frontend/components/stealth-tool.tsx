"use client";

// Kage Stealth Address & Note Tool — runs entirely in the browser.
//
// Every value here is computed locally from the same Soroban SDK primitives
// the contracts use (X25519 ECDH + Poseidon), so a developer can mint a
// stealth meta-address, derive a payment note, and recognise an announced
// note for themselves without touching the network. Nothing is transmitted.
import { useMemo, useState } from "react";
import {
  generateMetaAddress,
  deriveNoteForRecipient,
  recognizeNote,
  nullifierHash,
  bigToHex,
  type Note,
} from "@/lib/kage-browser";

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-2 break-all text-sm text-foreground ${mono ? "font-mono" : ""}`}
        data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {value}
      </div>
    </div>
  );
}

export function StealthTool() {
  const [scanPriv, setScanPriv] = useState("");
  const [scanPub, setScanPub] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [recognized, setRecognized] = useState<boolean | null>(null);

  const newAddress = () => {
    const a = generateMetaAddress();
    setScanPriv(a.scanPriv);
    setScanPub(a.scanPub);
    setNote(null);
    setRecognized(null);
  };

  const derive = () => {
    if (!scanPub) return;
    const amt = amount ? BigInt(amount) : 0n;
    setNote(deriveNoteForRecipient(scanPub, amt));
    setRecognized(null);
  };

  const recognise = async () => {
    if (!note || !scanPriv) return;
    const re = recognizeNote(scanPriv, note.ephemeralPub, note.amount, note.commitment);
    setRecognized(re !== null && re.commitment === note.commitment);
  };

  const nullifier = useMemo(
    () => (note ? bigToHex(nullifierHash(note.nullifier)) : ""),
    [note],
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Stealth Address &amp; Note Generator
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        A local developer tool that mints a Kage stealth meta-address and derives a
        private payment note. All cryptography runs in your browser — nothing is sent
        to a server.
      </p>

      <div className="mt-10 grid gap-6">
        <section className="rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">1 — Meta-address</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A scan keypair is the recipient&apos;s public identity in the Kage pool.
          </p>
          <button
            onClick={newAddress}
            className="mt-4 inline-flex items-center rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Generate fresh meta-address
          </button>
          {scanPub && (
            <div className="mt-5 grid gap-3">
              <Field label="Scan public key" value={scanPub} />
              <Field label="Scan private key (never share)" value={scanPriv} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">2 — Derive a payment note</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Amount (stroops)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 100000000"
                inputMode="numeric"
                className="w-44 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={derive}
              className="inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
            >
              Derive note
            </button>
          </div>

          {note && (
            <div className="mt-5 grid gap-3">
              <Field label="Ephemeral public key (announced on-chain)" value={note.ephemeralPub} />
              <Field label="Commitment" value={bigToHex(note.commitment)} />
              <Field label="Nullifier secret" value={bigToHex(note.nullifier)} />
              <Field label="Note secret" value={bigToHex(note.secret)} />
              <Field label="Nullifier hash (spends the note once)" value={nullifier} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">3 — Recognise an announced note</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The recipient recomputes the note from the announced ephemeral key; it only
            matches if it was genuinely derived for them.
          </p>
          <button
            onClick={recognise}
            disabled={!note || !scanPriv}
            className="mt-4 inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Recognise with scan key
          </button>
          {recognized !== null && (
            <p className="mt-4 text-sm">
              {recognized ? (
                <span className="text-green-500">✓ Note recognised — you can spend it.</span>
              ) : (
                <span className="text-red-500">✗ Commitment mismatch — not your note.</span>
              )}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
