"use client";

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export const short = (s: string | null | undefined, head = 8, tail = 6) =>
  !s ? "—" : s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
export const usdc = (raw: string | number | null | undefined) =>
  raw == null ? "—" : `${(Number(raw) / (Number(raw) > 1000 ? 1e7 : 1)).toFixed(2)} USDC`;

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 ${className}`}>{children}</div>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string | undefined }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-white">
        {children}
        {hint && <span className="ml-1.5 font-normal text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none transition focus:border-accent/60 focus:bg-white/[0.05] ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-neutral-600 outline-none transition focus:border-accent/60 focus:bg-white/[0.05] ${props.className ?? ""}`}
    />
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "outline";
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-accent text-black hover:brightness-105"
      : variant === "outline"
        ? "border border-white/[0.14] text-white hover:bg-white/[0.05]"
        : "text-neutral-400 hover:text-white";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-start gap-3 text-left">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${on ? "border-accent bg-accent" : "border-white/20 bg-white/[0.03]"}`}>
        {on && <span className="h-2 w-2 rounded-sm bg-black" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {desc && <span className="block text-xs text-neutral-500">{desc}</span>}
      </span>
    </button>
  );
}

export function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${accent ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-neutral-400"}`}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.1] px-6 py-10 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}
