"use client";

// In-app feedback. Fields match the Google Form one-for-one so in-app answers
// and form answers merge into a single export without remapping columns.
//
// Deliberately not a modal: it never traps focus or blocks the page, and it
// stays closed until asked for. A tester should be able to rate the thing in
// ten seconds without losing their place.
import { useState, type FormEvent } from "react";
import { useWallet } from "@/lib/wallet";

const RATINGS = [1, 2, 3, 4, 5] as const;

export function FeedbackWidget() {
  const { address } = useWallet();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [mostUseful, setMostUseful] = useState("");
  const [friction, setFriction] = useState("");
  const [wanted, setWanted] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating == null) return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, rating, mostUseful, friction, wanted, email }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
      >
        Give feedback
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-background p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          {state === "sent" ? "Thanks — that's logged." : "How was Kage?"}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close feedback"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Close
        </button>
      </div>

      {state === "sent" ? (
        <p className="text-sm text-muted-foreground">
          Your answer shapes what gets built next. It counts toward the public total on{" "}
          <a href="/metrics" className="text-accent underline underline-offset-4">
            /metrics
          </a>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm text-muted-foreground">Rate it, 1 to 5</legend>
            <div className="flex gap-2">
              {RATINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-pressed={rating === n}
                  className={`h-10 w-10 rounded-lg border text-sm font-medium transition-colors ${
                    rating === n
                      ? "border-accent bg-accent text-card-foreground"
                      : "border-border text-muted-foreground hover:border-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">Which part would you actually use?</span>
            <input
              value={mostUseful}
              onChange={(e) => setMostUseful(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">What confused or blocked you?</span>
            <input
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">What should we build next?</span>
            <input
              value={wanted}
              onChange={(e) => setWanted(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">Email, if you want a reply</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
          </label>

          {state === "error" && (
            <p className="text-sm text-red-500">Could not send. Try once more.</p>
          )}

          <button
            type="submit"
            disabled={rating == null || state === "sending"}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-card-foreground transition-opacity disabled:opacity-40"
          >
            {state === "sending" ? "Sending" : "Send feedback"}
          </button>
        </form>
      )}
    </div>
  );
}
