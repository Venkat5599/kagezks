import type { ReactNode } from "react";

export default function NotFound(): ReactNode {
  return (
    <main
      id="main-content"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="text-6xl font-black tracking-tighter text-muted-foreground/30">
        404
      </p>
      <h2 className="text-lg font-semibold tracking-tight">Page not found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <a
        href="/"
        className="mt-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Go home
      </a>
    </main>
  );
}
