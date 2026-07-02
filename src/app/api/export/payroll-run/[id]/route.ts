import { prisma } from "../../../../../lib/db";
import { ApiError, handle } from "../../../../../lib/api";
import { requireRole } from "../../../../../lib/auth";
import { csvResponse } from "../../../../../lib/csv";

type Ctx = { params: Promise<{ id: string }> };

const money = (cents: number) => (cents / 100).toFixed(2);

export const GET = handle<Ctx>(async (req, { params }) => {
  await requireRole(req, "MANAGER", "ADMIN");
  const { id } = await params;

  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: { payments: { include: { worker: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!run) throw new ApiError(404, "Payroll run not found");

  const snapshot = JSON.parse(run.settingsSnapshot) as { currencyCode?: string };
  const rows: (string | number)[][] = [
    ["Payroll run", `${run.periodStart} to ${run.periodEnd} (${run.frequency.toLowerCase()})`],
    ["Currency", snapshot.currencyCode ?? "USD"],
    [],
    [
      "Worker",
      "Email",
      "Regular hours",
      "Overtime hours",
      "Paid leave hours",
      "Regular pay",
      "Overtime pay",
      "Paid leave pay",
      "Unpaid leave deduction",
      "Net pay",
      "Status",
    ],
    ...run.payments.map((p) => [
      p.worker.name,
      p.worker.email,
      p.regularHours,
      p.overtimeHours,
      p.paidLeaveHours,
      money(p.grossRegularCents),
      money(p.grossOvertimeCents),
      money(p.paidLeaveCents),
      money(p.deductionCents),
      money(p.netCents),
      p.status,
    ]),
  ];

  return csvResponse(`payroll-${run.periodStart}-to-${run.periodEnd}.csv`, rows);
});
