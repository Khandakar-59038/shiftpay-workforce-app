import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { handle } from "../../../../lib/api";
import { requireRole } from "../../../../lib/auth";
import { getSettings } from "../../../../lib/settings";
import {
  computeWorkerPayroll,
  hasOverlappingPayment,
  periodBounds,
  type PayFrequency,
} from "../../../../lib/payroll-db";

export const GET = handle(async (req) => {
  await requireRole(req, "MANAGER", "ADMIN");
  const url = new URL(req.url);
  const frequency = (url.searchParams.get("frequency") ?? "WEEKLY") as PayFrequency;
  const periodStart = url.searchParams.get("periodStart") ?? "";
  const [from, to] = periodBounds(frequency, periodStart);

  const settings = await getSettings();
  const workers = await prisma.user.findMany({
    where: { role: "WORKER", isActive: true },
    orderBy: { name: "asc" },
  });

  const lines = await Promise.all(
    workers.map(async (worker) => ({
      worker: {
        id: worker.id,
        name: worker.name,
        email: worker.email,
        hourlyRateCents: worker.hourlyRateCents,
      },
      result: await computeWorkerPayroll(worker, from, to, settings),
      alreadyPaid: await hasOverlappingPayment(worker.id, from, to),
    })),
  );

  const payable = lines.filter((l) => !l.alreadyPaid);
  return NextResponse.json({
    frequency,
    periodStart: from,
    periodEnd: to,
    workers: lines,
    totals: {
      workers: payable.length,
      netCents: payable.reduce((sum, l) => sum + l.result.netCents, 0),
    },
    settings: {
      currencyCode: settings.currencyCode,
      weeklyHourLimit: settings.weeklyHourLimit,
      overtimeMultiplier: settings.overtimeMultiplier,
    },
  });
});
