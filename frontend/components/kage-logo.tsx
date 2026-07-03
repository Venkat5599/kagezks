import type { ReactNode } from "react";

// Kage mark: the brand initial "K" — a stem with two arms meeting mid-stem, the
// convergence motif. Uses currentColor so it inherits the tile/text color.
export function KageMark({ className = "h-5 w-5" }: { className?: string }): ReactNode {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* stem */}
      <path d="M11 7 V25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* upper arm */}
      <path d="M11 16.5 L21.5 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* lower arm */}
      <path d="M11 16.5 L21.5 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Full lockup: mark in a rounded tile + the wordmark.
export function KageLogo({
  className = "",
  tile = "bg-foreground text-background",
  word = true,
}: {
  className?: string;
  tile?: string;
  word?: boolean;
}): ReactNode {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tile}`}>
        <KageMark className="h-4 w-4" />
      </span>
      {word && <span className="text-lg font-semibold leading-none tracking-tight">Kage</span>}
    </span>
  );
}
