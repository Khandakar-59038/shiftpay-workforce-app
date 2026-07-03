"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatCents, formatHours } from "../../../lib/money";
import { EmptyState, PageHeader, Spinner, Stamp, StatCard } from "../../../components/ui";

interface Payment {
  id: string;
  periodStart: string;
  periodEnd: string;
  regularHours: number;
  overtimeHours: number;
  paidLeaveHours: number;
  grossRegularCents: number;
  grossOvertimeCents: number;
  paidLeaveCents: number;
  deductionCents: number;
  netCents: number;
  status: string;
  createdAt: string;
  payrollRun: { frequency: string };
}

export default function PayPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    void Promise.all([
      api<{ payments: Payment[] }>("/api/payroll/payments"),
      api<{ settings: { currencyCode: string } }>("/api/settings"),
    ]).then(([pay, settings]) => {
      setPayments(pay.payments);
      setCurrency(settings.settings.currencyCode);
    });
  }, []);

  const year = new Date().getFullYear();
  const ytd = (payments ?? []).filter((p) => new Date(p.createdAt).getFullYear() === year);
  const ytdNet = ytd.reduce((s, p) => s + p.netCents, 0);
  const ytdGross = ytd.reduce((s, p) => s + p.netCents + p.deductionCents, 0);
  const ytdOvertime = ytd.reduce((s, p) => s + p.overtimeHours, 0);

  return (
    <>
      <PageHeader title="Pay" sub="Every payment, with the math behind it." />

      {payments === null ? (
        <Spinner />
      ) : (
        <>
          <div className="rise grid grid-cols-3 gap-3">
            <StatCard label={`Net pay ${year}`} value={formatCents(ytdNet, currency)} tone="accent" />
            <StatCard
              label={`Gross ${year}`}
              value={formatCents(ytdGross, currency)}
              hint={`${ytd.length} payment(s)`}
            />
            <StatCard
              label={`Overtime paid ${year}`}
              value={formatHours(ytdOvertime)}
              tone={ytdOvertime > 0 ? "amber" : "ink"}
            />
          </div>

          <h2 className="rise rise-1 mb-3 mt-7 font-display text-xl font-semibold">Payment history</h2>
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              hint="When your manager runs payroll, your payslips appear here."
            />
          ) : (
            <ul className="rise rise-2 space-y-2">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3"
                >
                  <Stamp value={p.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                      <span className="ml-2 font-mono text-[0.62rem] uppercase text-ink-faint">
                        {p.payrollRun.frequency.toLowerCase()}
                      </span>
                    </div>
                    <div className="tnum text-xs text-ink-soft">
                      {formatHours(p.regularHours)} regular
                      {p.overtimeHours > 0 && <> + {formatHours(p.overtimeHours)} OT</>}
                      {p.paidLeaveHours > 0 && <> + {formatHours(p.paidLeaveHours)} paid leave</>}
                      {p.deductionCents > 0 && (
                        <> − {formatCents(p.deductionCents, currency)} unpaid leave</>
                      )}
                    </div>
                  </div>
                  <span className="tnum font-display text-lg font-semibold">
                    {formatCents(p.netCents, currency)}
                  </span>
                  <Link href={`/payslip/${p.id}`} className="text-xs font-medium text-accent hover:underline">
                    payslip →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
