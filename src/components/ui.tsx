import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ── Buttons ─────────────────────────────────────────── */

const buttonVariants = {
  primary:
    "bg-accent text-white hover:bg-accent-deep active:translate-y-px disabled:opacity-50 disabled:hover:bg-accent",
  outline:
    "border border-line bg-card text-ink hover:border-accent hover:text-accent disabled:opacity-50",
  ghost: "text-ink-soft hover:text-ink hover:bg-line-soft disabled:opacity-50",
  danger:
    "border border-red/40 bg-card text-red hover:bg-red hover:text-white disabled:opacity-50",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: "sm" | "md";
}) {
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizes} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

/* ── Status stamp ────────────────────────────────────── */

const stampColors: Record<string, string> = {
  PENDING: "text-amber bg-amber-soft",
  APPROVED: "text-accent bg-accent-soft",
  REJECTED: "text-red bg-red-soft",
  SUPERSEDED: "text-ink-faint bg-line-soft",
  PAID: "text-accent bg-accent-soft",
  UNPAID: "text-ink-soft bg-line-soft",
  WORKER: "text-ink-soft bg-line-soft",
  MANAGER: "text-accent bg-accent-soft",
  ADMIN: "text-amber bg-amber-soft",
};

export function Stamp({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`stamp ${stampColors[value] ?? "text-ink-soft bg-line-soft"} ${className}`}>
      {value.toLowerCase()}
    </span>
  );
}

/* ── Cards & layout ──────────────────────────────────── */

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-card shadow-[0_1px_2px_rgba(27,30,32,0.05)] ${className}`}
    >
      {(title || actions) && (
        <header className="rule flex items-center justify-between gap-3 px-5 py-3">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ink" | "accent" | "amber" | "red";
}) {
  const tones = {
    ink: "text-ink",
    accent: "text-accent",
    amber: "text-amber",
    red: "text-red",
  } as const;
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3">
      <div className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-ink-faint">
        {label}
      </div>
      <div className={`tnum mt-1 font-display text-2xl font-semibold ${tones[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-base text-ink-soft">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-faint" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/* ── Forms ───────────────────────────────────────────── */

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-ink-soft">
        {label}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}
