import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { formatDate } from "../../../lib/dates";
import { formatCents, formatHours } from "../../../lib/money";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { paymentId } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      worker: { select: { id: true, name: true, email: true, hourlyRateCents: true } },
      payrollRun: true,
    },
  });
  if (!payment) notFound();
  if (session.role === "WORKER" && payment.workerId !== session.userId) {
    redirect("/dashboard");
  }

  const snapshot = JSON.parse(payment.payrollRun.settingsSnapshot) as {
    overtimeMultiplier?: number;
    currencyCode?: string;
  };
  const currency = snapshot.currencyCode ?? "USD";
  const rate = payment.worker.hourlyRateCents;

  const lines = [
    {
      label: "Regular hours",
      detail: `${formatHours(payment.regularHours)} × ${formatCents(rate, currency)}/h`,
      amount: payment.grossRegularCents,
    },
    {
      label: `Overtime (×${snapshot.overtimeMultiplier ?? 1.5})`,
      detail: formatHours(payment.overtimeHours),
      amount: payment.grossOvertimeCents,
    },
    {
      label: "Paid leave",
      detail: formatHours(payment.paidLeaveHours),
      amount: payment.paidLeaveCents,
    },
  ].filter((l) => l.amount > 0 || l.label === "Regular hours");

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="no-print mx-auto mb-6 flex max-w-2xl items-center justify-between">
        <Link href="/dashboard" className="text-sm text-accent hover:underline">
          ← Back to ShiftPay
        </Link>
        <PrintButton />
      </div>

      <div className="print-page mx-auto max-w-2xl rounded-lg border border-line bg-card p-10 shadow-sm">
        <header className="flex items-start justify-between border-b-2 border-ink pb-6">
          <div>
            <div className="font-display text-3xl font-bold tracking-tight">
              ShiftPay<span className="text-accent">.</span>
            </div>
            <div className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink-soft">
              Payslip · {payment.payrollRun.frequency.toLowerCase()} payroll
            </div>
          </div>
          <span className="stamp text-accent">
            {payment.status.toLowerCase()}
          </span>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">Paid to</dt>
            <dd className="mt-0.5 font-semibold">{payment.worker.name}</dd>
            <dd className="text-xs text-ink-soft">{payment.worker.email}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">Pay period</dt>
            <dd className="mt-0.5 font-semibold">
              {formatDate(payment.periodStart)} – {formatDate(payment.periodEnd)}
            </dd>
            <dd className="text-xs text-ink-soft">
              processed {formatDate(payment.createdAt.toISOString().slice(0, 10))}
            </dd>
          </div>
        </dl>

        <table className="tnum mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-[0.62rem] uppercase tracking-wider text-ink-soft">
              <th className="py-2 font-semibold">Earnings</th>
              <th className="py-2 text-right font-semibold">Basis</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className="border-b border-line-soft">
                <td className="py-2.5">{l.label}</td>
                <td className="py-2.5 text-right text-ink-soft">{l.detail}</td>
                <td className="py-2.5 text-right font-medium">{formatCents(l.amount, currency)}</td>
              </tr>
            ))}
            {payment.deductionCents > 0 && (
              <>
                <tr className="border-b border-line-soft">
                  <td className="py-2.5 text-ink-soft">Gross</td>
                  <td />
                  <td className="py-2.5 text-right">
                    {formatCents(payment.netCents + payment.deductionCents, currency)}
                  </td>
                </tr>
                <tr className="border-b border-line-soft text-red">
                  <td className="py-2.5">Unpaid leave deduction</td>
                  <td />
                  <td className="py-2.5 text-right">−{formatCents(payment.deductionCents, currency)}</td>
                </tr>
              </>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-display text-lg font-semibold">Net pay</td>
              <td />
              <td className="pt-4 text-right font-display text-2xl font-bold text-accent">
                {formatCents(payment.netCents, currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        <footer className="mt-10 flex items-center justify-between border-t border-line pt-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">
          <span>Ref {payment.id.slice(-8)}</span>
          <span>ShiftPay ledger — generated {formatDate(new Date().toISOString().slice(0, 10))}</span>
        </footer>
      </div>
    </div>
  );
}
