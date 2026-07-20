"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h2 className="text-lg font-semibold tracking-tight">
        Something went wrong
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
