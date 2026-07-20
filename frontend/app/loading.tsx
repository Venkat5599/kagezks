export default function Loading(): React.ReactNode {
  return (
    <main
      id="main-content"
      className="flex min-h-[60dvh] items-center justify-center"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
          aria-hidden="true"
        />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </main>
  );
}
