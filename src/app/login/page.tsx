"use client";

import { useState } from "react";
import { api } from "../../lib/client";
import { Button, Field, Input } from "../../components/ui";

const DEMO_ACCOUNTS = [
  { label: "Worker", email: "alice@shiftpay.demo" },
  { label: "Manager", email: "manager@shiftpay.demo" },
  { label: "Admin", email: "admin@shiftpay.demo" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="ledger-lines relative flex flex-col justify-between bg-night px-8 py-10 text-white lg:w-[44%] lg:px-14 lg:py-14">
        <div className="rise font-mono text-[0.65rem] uppercase tracking-[0.2em] text-night-text">
          Est. 2026 · Ledger no. 001
        </div>
        <div>
          <h1 className="rise rise-1 font-display text-6xl font-bold leading-none tracking-tight lg:text-7xl">
            Shift
            <br />
            Pay<span className="text-accent-soft">.</span>
          </h1>
          <p className="rise rise-2 mt-6 max-w-sm text-sm leading-relaxed text-night-text">
            Schedules set and approved. Hours counted, overtime flagged. Leave
            balanced, payroll disbursed — every entry in one honest ledger.
          </p>
        </div>
        <dl className="rise rise-3 hidden gap-8 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-night-text lg:flex">
          <div>
            <dt className="text-night-text/60">Schedules</dt>
            <dd className="mt-1 text-white">approve / reject</dd>
          </div>
          <div>
            <dt className="text-night-text/60">Overtime</dt>
            <dd className="mt-1 text-white">auto-counted</dd>
          </div>
          <div>
            <dt className="text-night-text/60">Payroll</dt>
            <dd className="mt-1 text-white">weekly / monthly</dd>
          </div>
        </dl>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="rise font-display text-2xl font-semibold">Sign in</h2>
          <p className="rise rise-1 mt-1 text-sm text-ink-soft">
            Use your ShiftPay account to open the ledger.
          </p>

          <form onSubmit={submit} className="rise rise-2 mt-7 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="rise rise-3 mt-8 rounded-lg border border-dashed border-line bg-card px-4 py-3">
            <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Demo accounts · password “demo1234”
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword("demo1234");
                  }}
                  className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent"
                >
                  {acct.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
