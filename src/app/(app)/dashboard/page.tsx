import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { addDays, formatDate, mondayOf, todayStr } from "../../../lib/dates";
import { summarize } from "../../../lib/hours";
import { getLeaveBalance } from "../../../lib/leave-db";
import { formatCents, formatHours } from "../../../lib/money";
import { getSettings } from "../../../lib/settings";
import { Card, EmptyState, PageHeader, Stamp, StatCard } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "WORKER") return <WorkerDashboard userId={session.userId} name={session.name} />;
  if (session.role === "MANAGER") return <ManagerDashboard name={session.name} />;
  return <AdminDashboard name={session.name} />;
}

/* ── Worker ──────────────────────────────────────────── */

async function WorkerDashboard({ userId, name }: { userId: string; name: string }) {
  const settings = await getSettings();
  const today = todayStr();
  const monday = mondayOf(today);

  const [schedule, week, balance, lastPayment, pendingLeaves] = await Promise.all([
    prisma.schedule.findFirst({
      where: { workerId: userId, periodStart: monday, status: { not: "SUPERSEDED" } },
      orderBy: { submittedAt: "desc" },
      include: { days: { orderBy: { date: "asc" } } },
    }),
    summarize(userId, monday, addDays(monday, 6), settings),
    getLeaveBalance(userId, today),
    prisma.payment.findFirst({ where: { workerId: userId }, orderBy: { createdAt: "desc" } }),
    prisma.leaveRequest.count({ where: { workerId: userId, status: "PENDING" } }),
  ]);

  const scheduledThisWeek = schedule?.days.reduce((s, d) => s + d.hours, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={`Good day, ${name.split(" ")[0]}`}
        sub={`Week of ${formatDate(monday)} · ${formatDate(today)}`}
      />
      <div className="rise rise-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Worked this week"
          value={formatHours(week.totalHours)}
          hint={`of ${formatHours(scheduledThisWeek)} scheduled`}
        />
        <StatCard
          label="Overtime"
          value={formatHours(week.overtimeHours)}
          tone={week.overtimeHours > 0 ? "amber" : "ink"}
          hint={`limit ${settings.weeklyHourLimit}h/week`}
        />
        <StatCard
          label="Paid leave left"
          value={`${balance.remaining}d`}
          hint={`${balance.used} of ${balance.allowance} used`}
          tone="accent"
        />
        <StatCard
          label="Last payment"
          value={lastPayment ? formatCents(lastPayment.netCents, settings.currencyCode) : "—"}
          hint={
            lastPayment
              ? `${formatDate(lastPayment.periodStart)} – ${formatDate(lastPayment.periodEnd)}`
              : "no payments yet"
          }
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          className="rise rise-2"
          title="This week's schedule"
          actions={
            <Link href="/schedule" className="text-xs font-medium text-accent hover:underline">
              Manage →
            </Link>
          }
        >
          {schedule ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Stamp value={schedule.status} />
                {schedule.managerNote && (
                  <span className="text-xs text-ink-soft">“{schedule.managerNote}”</span>
                )}
              </div>
              <ul className="grid grid-cols-7 gap-1 text-center">
                {schedule.days.map((d) => (
                  <li key={d.id} className="rounded-md border border-line-soft bg-paper px-1 py-2">
                    <div className="font-mono text-[0.6rem] uppercase text-ink-faint">
                      {formatDate(d.date).split(" ")[0]} {d.date.slice(8)}
                    </div>
                    <div className="tnum mt-1 text-sm font-semibold">{d.hours}h</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState
              title="No schedule submitted for this week"
              hint="Set your hours so your manager can approve them."
            />
          )}
        </Card>

        <Card
          className="rise rise-3"
          title="Leave & payments"
          actions={
            <Link href="/leave" className="text-xs font-medium text-accent hover:underline">
              Request leave →
            </Link>
          }
        >
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">Pending leave requests</span>
              <span className="tnum font-semibold">{pendingLeaves}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">Paid-leave balance</span>
              <span className="tnum font-semibold">{balance.remaining} days</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">Payment status</span>
              {lastPayment ? <Stamp value={lastPayment.status} /> : <span>—</span>}
            </li>
            {lastPayment && (
              <li className="pt-1">
                <Link
                  href={`/payslip/${lastPayment.id}`}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  View latest payslip →
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}

/* ── Manager ─────────────────────────────────────────── */

async function ManagerDashboard({ name }: { name: string }) {
  const settings = await getSettings();
  const [pendingSchedules, pendingLeaves, workers, lastRun, otAlerts] = await Promise.all([
    prisma.schedule.count({ where: { status: "PENDING" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: "WORKER", isActive: true } }),
    prisma.payrollRun.findFirst({
      orderBy: { createdAt: "desc" },
      include: { payments: true },
    }),
    prisma.notification.findMany({
      where: { type: "OVERTIME_ALERT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      distinct: ["href"],
    }),
  ]);

  const lastRunTotal = lastRun?.payments.reduce((s, p) => s + p.netCents, 0) ?? 0;

  return (
    <>
      <PageHeader title={`The floor is yours, ${name.split(" ")[0]}`} sub="Team overview" />
      <div className="rise rise-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Schedules pending"
          value={pendingSchedules}
          tone={pendingSchedules > 0 ? "amber" : "ink"}
          hint={<Link href="/approvals" className="text-accent hover:underline">review →</Link>}
        />
        <StatCard
          label="Leave pending"
          value={pendingLeaves}
          tone={pendingLeaves > 0 ? "amber" : "ink"}
          hint={<Link href="/leave-approvals" className="text-accent hover:underline">review →</Link>}
        />
        <StatCard label="Active workers" value={workers} hint="on the roster" />
        <StatCard
          label="Last payroll"
          value={lastRun ? formatCents(lastRunTotal, settings.currencyCode) : "—"}
          hint={
            lastRun
              ? `${lastRun.payments.length} payments · ${formatDate(lastRun.periodEnd)}`
              : "no runs yet"
          }
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="rise rise-2" title="Overtime alerts">
          {otAlerts.length === 0 ? (
            <EmptyState title="No overtime alerts" hint="You'll hear about it here first." />
          ) : (
            <ul className="space-y-2">
              {otAlerts.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href ?? "/team-time"}
                    className="block rounded-md border border-amber/30 bg-amber-soft px-3 py-2 text-sm text-amber hover:border-amber"
                  >
                    {n.body}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          className="rise rise-3"
          title="Run payroll"
          actions={
            <Link href="/payroll" className="text-xs font-medium text-accent hover:underline">
              Open payroll →
            </Link>
          }
        >
          <p className="text-sm text-ink-soft">
            Disburse weekly or monthly payments. The ledger computes regular hours,
            overtime at ×{settings.overtimeMultiplier}, paid leave, and unpaid-leave
            deductions for every worker before you confirm.
          </p>
        </Card>
      </div>
    </>
  );
}

/* ── Admin ───────────────────────────────────────────── */

async function AdminDashboard({ name }: { name: string }) {
  const settings = await getSettings();
  const [workers, managers, admins, inactive, schedules, leaves, payments] = await Promise.all([
    prisma.user.count({ where: { role: "WORKER" } }),
    prisma.user.count({ where: { role: "MANAGER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.schedule.count(),
    prisma.leaveRequest.count(),
    prisma.payment.aggregate({ _sum: { netCents: true }, _count: true }),
  ]);

  return (
    <>
      <PageHeader title={`System ledger, ${name.split(" ")[0]}`} sub="Company administration" />
      <div className="rise rise-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Workers" value={workers} hint={`${inactive} deactivated`} />
        <StatCard label="Managers" value={managers} hint={`${admins} admin(s)`} />
        <StatCard label="Schedules filed" value={schedules} hint={`${leaves} leave requests`} />
        <StatCard
          label="Total disbursed"
          value={formatCents(payments._sum.netCents ?? 0, settings.currencyCode)}
          hint={`${payments._count} payments`}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          className="rise rise-2"
          title="Company policy"
          actions={
            <Link href="/settings" className="text-xs font-medium text-accent hover:underline">
              Configure →
            </Link>
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-ink-faint">Weekly hour limit</dt>
              <dd className="tnum font-semibold">{settings.weeklyHourLimit}h</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Overtime rate</dt>
              <dd className="tnum font-semibold">×{settings.overtimeMultiplier}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">OT alert threshold</dt>
              <dd className="tnum font-semibold">{settings.overtimeAlertThreshold}h/week</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Paid leave / year</dt>
              <dd className="tnum font-semibold">{settings.paidLeaveDaysPerYear} days</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Standard day</dt>
              <dd className="tnum font-semibold">{settings.standardDayHours}h</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Currency</dt>
              <dd className="tnum font-semibold">{settings.currencyCode}</dd>
            </div>
          </dl>
        </Card>
        <Card
          className="rise rise-3"
          title="User management"
          actions={
            <Link href="/users" className="text-xs font-medium text-accent hover:underline">
              Manage users →
            </Link>
          }
        >
          <p className="text-sm text-ink-soft">
            Create worker and manager accounts, assign roles and hourly rates,
            reset passwords, and deactivate accounts that should no longer sign in.
          </p>
        </Card>
      </div>
    </>
  );
}
