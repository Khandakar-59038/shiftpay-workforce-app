import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { requireRole } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/dates";
import { formatCents } from "../../../../lib/money";
import { notify } from "../../../../lib/notify";
import { getSettings } from "../../../../lib/settings";
import {
  computeWorkerPayroll,
  hasOverlappingPayment,
  periodBounds,
} from "../../../../lib/payroll-db";

const runSchema = z.object({
  frequency: z.enum(["WEEKLY", "MONTHLY"]),
  periodStart: z.string(),
  workerIds: z.array(z.string()).optional(),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "MANAGER", "ADMIN");
  const body = await parseBody(req, runSchema);
  const [from, to] = periodBounds(body.frequency, body.periodStart);

  const settings = await getSettings();
  const workers = await prisma.user.findMany({
    where: {
      role: "WORKER",
      isActive: true,
      ...(body.workerIds ? { id: { in: body.workerIds } } : {}),
    },
    orderBy: { name: "asc" },
  });
  if (workers.length === 0) {
    throw new ApiError(400, "No active workers selected for this payroll run");
  }

  for (const worker of workers) {
    if (await hasOverlappingPayment(worker.id, from, to)) {
      throw new ApiError(
        409,
        `${worker.name} already has a payment covering ${formatDate(from)} – ${formatDate(to)}. Deselect them or choose another period.`,
      );
    }
  }

  const results = await Promise.all(
    workers.map((worker) => computeWorkerPayroll(worker, from, to, settings)),
  );

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: {
        periodStart: from,
        periodEnd: to,
        frequency: body.frequency,
        processedById: session.userId,
        settingsSnapshot: JSON.stringify({
          weeklyHourLimit: settings.weeklyHourLimit,
          overtimeMultiplier: settings.overtimeMultiplier,
          standardDayHours: settings.standardDayHours,
          currencyCode: settings.currencyCode,
        }),
      },
    });

    for (let i = 0; i < workers.length; i++) {
      const worker = workers[i];
      const result = results[i];
      const payment = await tx.payment.create({
        data: {
          payrollRunId: created.id,
          workerId: worker.id,
          periodStart: from,
          periodEnd: to,
          regularHours: result.regularHours,
          overtimeHours: result.overtimeHours,
          paidLeaveHours: result.paidLeaveHours,
          grossRegularCents: result.grossRegularCents,
          grossOvertimeCents: result.grossOvertimeCents,
          paidLeaveCents: result.paidLeaveCents,
          deductionCents: result.deductionCents,
          netCents: result.netCents,
        },
      });
      await notify(tx, worker.id, {
        type: "PAYMENT_PROCESSED",
        title: "Payment processed",
        body: `Your ${body.frequency.toLowerCase()} payment of ${formatCents(result.netCents, settings.currencyCode)} for ${formatDate(from)} – ${formatDate(to)} has been disbursed.`,
        href: `/payslip/${payment.id}`,
      });
    }

    return tx.payrollRun.findUniqueOrThrow({
      where: { id: created.id },
      include: { payments: { include: { worker: { select: { id: true, name: true } } } } },
    });
  });

  return NextResponse.json({ run }, { status: 201 });
});
