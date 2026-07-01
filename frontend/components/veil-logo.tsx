import type { ReactNode } from "react";

// Veil mark: a "V" whose two arms converge to a single node (the shielded pool).
// Reads as the brand initial and the convergence motif at once. Uses
// currentColor so it inherits whatever color the tile/text sets.
export function VeilMark({ className = "h-5 w-5" }: { className?: string }): ReactNode {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* converging arms */}
      <path
        d="M8.5 9.5 L16 21.5 L23.5 9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* faint veil bar across the top of the arms */}
      <path
        d="M11 7.25 H21"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* the pool node at the convergence point */}
      <circle cx="16" cy="24.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

// Full lockup: mark in a rounded tile + the wordmark.
export function VeilLogo({
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
        <VeilMark className="h-4 w-4" />
      </span>
      {word && <span className="text-lg font-semibold leading-none tracking-tight">Veil</span>}
    </span>
  );
}
