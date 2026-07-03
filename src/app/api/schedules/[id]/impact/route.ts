import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { ApiError, handle } from "../../../../../lib/api";
import { requireRole } from "../../../../../lib/auth";
import { addDays, isoWeekKey, mondayOf } from "../../../../../lib/dates";
import { projectedOvertime } from "../../../../../lib/insights";
import type { WeekHours } from "../../../../../lib/payroll";
import { getSettings } from "../../../../../lib/settings";

type Ctx = { params: Promise<{ id: string }> };

function bucketByWeek(days: { date: string; hours: number }[]): WeekHours[] {
  const buckets = new Map<string, number>();
  for (const day of days) {
    const key = isoWeekKey(day.date);
    buckets.set(key, (buckets.get(key) ?? 0) + day.hours);
  }
  return [...buckets.entries()].map(([weekKey, hours]) => ({ weekKey, hours }));
}

export const GET = handle<Ctx>(async (req, { params }) => {
  await requireRole(req, "MANAGER", "ADMIN");
  const { id } = await params;

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      days: true,
      worker: { select: { id: true, name: true, hourlyRateCents: true } },
    },
  });
  if (!schedule) throw new ApiError(404, "Schedule not found");

  const settings = await getSettings();
  if (schedule.days.length === 0) {
    return NextResponse.json({ impacts: [], totalAddedOvertime: 0, totalAddedOvertimeCostCents: 0 });
  }

  // Full Mon–Sun span of every week the pending schedule touches.
  const dates = schedule.days.map((d) => d.date).sort();
  const from = mondayOf(dates[0]);
  const to = addDays(mondayOf(dates[dates.length - 1]), 6);

  const approvedDays = await prisma.scheduleDay.findMany({
    where: {
      date: { gte: from, lte: to },
      schedule: { workerId: schedule.workerId, status: "APPROVED" },
    },
  });

  const impacts = projectedOvertime(
    bucketByWeek(approvedDays),
    bucketByWeek(schedule.days),
    settings,
    schedule.worker.hourlyRateCents,
  );

  return NextResponse.json({
    scheduleId: schedule.id,
    worker: schedule.worker,
    impacts,
    totalAddedOvertime: impacts.reduce((s, i) => s + i.addedOvertime, 0),
    totalAddedOvertimeCostCents: impacts.reduce((s, i) => s + i.addedOvertimeCostCents, 0),
    settings: {
      weeklyHourLimit: settings.weeklyHourLimit,
      overtimeMultiplier: settings.overtimeMultiplier,
      currencyCode: settings.currencyCode,
    },
  });
});
