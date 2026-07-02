"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, formatDate, mondayOf, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatCents, formatHours } from "../../../lib/money";
import { useToast } from "../../../components/toast";
import { Icon } from "../../../components/icons";
import { Button, Card, EmptyState, PageHeader, Spinner, Stamp } from "../../../components/ui";

interface PayrollLine {
  worker: { id: string; name: string; email: string; hourlyRateCents: number };
  result: {
    regularHours: number;
    overtimeHours: number;
    paidLeaveHours: number;
    grossRegularCents: number;
    grossOvertimeCents: number;
    paidLeaveCents: number;
    deductionCents: number;
    grossCents: number;
    netCents: number;
  };
  alreadyPaid: boolean;
}
interface Preview {
  frequency: string;
  periodStart: string;
  periodEnd: string;
  workers: PayrollLine[];
  totals: { workers: number; netCents: number };
  settings: { currencyCode: string; weeklyHourLimit: number; overtimeMultiplier: number };
}
interface Run {
  id: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  createdAt: string;
  payments: {
    id: string;
    netCents: number;
    status: string;
    worker: { id: string; name: string };
  }[];
}

export default function PayrollPage() {
  const toast = useToast();
  const [frequency, setFrequency] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [weekStart, setWeekStart] = useState(() => mondayOf(addDays(todayStr(), -7)));
  const [month, setMonth] = useState(() => {
    const [from] = [todayStr().slice(0, 7)];
    return from;
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const periodStart = frequency === "WEEKLY" ? weekStart : `${month}-01`;

  const loadRuns = useCallback(async () => {
    const data = await api<{ runs: Run[] }>("/api/payroll");
    setRuns(data.runs);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const loadPreview = useCallback(async () => {
    setPreview(null);
    setError(null);
    try {
      const data = await api<Preview>(
        `/api/payroll/preview?frequency=${frequency}&periodStart=${periodStart}`,
      );
      setPreview(data);
      setSelected(new Set(data.workers.filter((w) => !w.alreadyPaid).map((w) => w.worker.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }, [frequency, periodStart]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const currency = preview?.settings.currencyCode ?? "USD";
  const selectedLines = useMemo(
    () => preview?.workers.filter((w) => selected.has(w.worker.id)) ?? [],
    [preview, selected],
  );
  const selectedTotal = selectedLines.reduce((s, l) => s + l.result.netCents, 0);

  async function confirm() {
    if (selectedLines.length === 0) return;
    if (!window.confirm(
      `Disburse ${formatCents(selectedTotal, currency)} to ${selectedLines.length} worker(s) for ${formatDate(preview!.periodStart)} – ${formatDate(preview!.periodEnd)}?`,
    ))
      return;
    setBusy(true);
    try {
      await api("/api/payroll/run", {
        body: { frequency, periodStart, workerIds: [...selected] },
      });
      toast("success", "Payroll disbursed — workers have been notified");
      await Promise.all([loadPreview(), loadRuns()]);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Payroll run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        sub="Preview every worker's computed pay, then disburse in one transaction."
      />

      <Card
        className="rise rise-1"
        title="Run payroll"
        actions={
          <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
            {(["WEEKLY", "MONTHLY"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className={`cursor-pointer rounded px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wide ${
                  frequency === f ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {f.toLowerCase()}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {frequency === "WEEKLY" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                ‹ Prev week
              </Button>
              <span className="tnum px-2 text-sm font-medium">
                {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next week ›
              </Button>
            </>
          ) : (
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-md border border-line bg-card px-3 py-1.5 text-sm"
              aria-label="Payroll month"
            />
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        )}
        {!preview && !error && <Spinner label="Computing…" />}

        {preview && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="rule text-left font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
                    <th className="py-2 pr-3" aria-label="Include" />
                    <th className="py-2 pr-4 font-semibold">Worker</th>
                    <th className="py-2 pr-4 text-right font-semibold">Regular</th>
                    <th className="py-2 pr-4 text-right font-semibold">Overtime</th>
                    <th className="py-2 pr-4 text-right font-semibold">Paid leave</th>
                    <th className="py-2 pr-4 text-right font-semibold">Deduction</th>
                    <th className="py-2 pr-4 text-right font-semibold">Net pay</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.workers.map((line) => (
                    <tr key={line.worker.id} className={`rule last:border-b-0 ${line.alreadyPaid ? "opacity-50" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          aria-label={`Include ${line.worker.name}`}
                          checked={selected.has(line.worker.id)}
                          disabled={line.alreadyPaid}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(line.worker.id);
                              else next.delete(line.worker.id);
                              return next;
                            });
                          }}
                          className="size-4 accent-[var(--color-accent)]"
                        />
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{line.worker.name}</div>
                        <div className="font-mono text-[0.65rem] text-ink-faint">
                          {formatCents(line.worker.hourlyRateCents, currency)}/h
                        </div>
                      </td>
                      <td className="tnum py-2.5 pr-4 text-right">
                        {formatHours(line.result.regularHours)}
                        <div className="text-xs text-ink-faint">{formatCents(line.result.grossRegularCents, currency)}</div>
                      </td>
                      <td className="tnum py-2.5 pr-4 text-right">
                        <span className={line.result.overtimeHours > 0 ? "text-amber" : ""}>
                          {formatHours(line.result.overtimeHours)}
                        </span>
                        <div className="text-xs text-ink-faint">{formatCents(line.result.grossOvertimeCents, currency)}</div>
                      </td>
                      <td className="tnum py-2.5 pr-4 text-right">
                        {formatHours(line.result.paidLeaveHours)}
                        <div className="text-xs text-ink-faint">{formatCents(line.result.paidLeaveCents, currency)}</div>
                      </td>
                      <td className="tnum py-2.5 pr-4 text-right text-red">
                        {line.result.deductionCents > 0 ? `−${formatCents(line.result.deductionCents, currency)}` : "—"}
                      </td>
                      <td className="tnum py-2.5 pr-4 text-right font-display text-base font-semibold">
                        {formatCents(line.result.netCents, currency)}
                      </td>
                      <td className="py-2.5">{line.alreadyPaid && <Stamp value="PAID" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="text-sm text-ink-soft">
                {selectedLines.length} worker(s) selected · total{" "}
                <span className="tnum font-display text-lg font-semibold text-ink">
                  {formatCents(selectedTotal, currency)}
                </span>
              </div>
              <Button onClick={confirm} disabled={busy || selectedLines.length === 0}>
                {busy ? "Disbursing…" : "Confirm & disburse"}
              </Button>
            </div>
          </>
        )}
      </Card>

      <h2 className="rise rise-2 mb-3 mt-8 font-display text-xl font-semibold">Run history</h2>
      {runs === null ? (
        <Spinner />
      ) : runs.length === 0 ? (
        <EmptyState title="No payroll runs yet" hint="Completed runs are recorded here." />
      ) : (
        <div className="rise rise-3 space-y-3">
          {runs.map((run) => (
            <Card
              key={run.id}
              title={
                <span>
                  {formatDate(run.periodStart)} – {formatDate(run.periodEnd)}
                  <span className="ml-2 font-mono text-[0.65rem] uppercase text-ink-faint">
                    {run.frequency.toLowerCase()}
                  </span>
                </span>
              }
              actions={
                <a
                  href={`/api/export/payroll-run/${run.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Icon name="download" className="size-3.5" /> CSV
                </a>
              }
            >
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {run.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md border border-line-soft bg-paper px-3 py-2 text-sm">
                    <span>{p.worker.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tnum font-semibold">{formatCents(p.netCents, currency)}</span>
                      <Link href={`/payslip/${p.id}`} className="text-xs text-accent hover:underline">
                        payslip →
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
