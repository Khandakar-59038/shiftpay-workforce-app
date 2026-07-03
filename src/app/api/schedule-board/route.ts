import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { ApiError, handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { addDays, eachDate, isValidDate, mondayOf, todayStr } from "../../../lib/dates";
import { laborCost } from "../../../lib/insights";
import { getSettings } from "../../../lib/settings";

interface Cell {
  approved: number;
  pending: number;
  onLeave: "PAID" | "UNPAID" | null;
}

// Managers see everything including pay data; workers see who works when
// (approved shifts + leave only, no rates or costs — pay is private).
export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const isManager = session.role === "MANAGER" || session.role === "ADMIN";

  const url = new URL(req.url);
  const weekStart = url.searchParams.get("weekStart") ?? mondayOf(todayStr());
  if (!isValidDate(weekStart) || mondayOf(weekStart) !== weekStart) {
    throw new ApiError(400, "weekStart must be a Monday (YYYY-MM-DD)");
  }
  const weekEnd = addDays(weekStart, 6);
  const dates = eachDate(weekStart, weekEnd);
  const settings = await getSettings();
  const visibleStatuses = isManager ? ["APPROVED", "PENDING"] : ["APPROVED"];

  const workers = await prisma.user.findMany({
    where: { role: "WORKER", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, hourlyRateCents: true },
  });
  const workerIds = workers.map((w) => w.id);

  const [scheduleDays, leaves, pendingSchedules] = await Promise.all([
    prisma.scheduleDay.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        schedule: { workerId: { in: workerIds }, status: { in: visibleStatuses } },
      },
      include: { schedule: { select: { id: true, status: true, workerId: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        workerId: { in: workerIds },
        status: "APPROVED",
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
    }),
    isManager
      ? prisma.schedule.findMany({
          where: {
            status: "PENDING",
            workerId: { in: workerIds },
            days: { some: { date: { gte: weekStart, lte: weekEnd } } },
          },
          include: {
            days: { orderBy: { date: "asc" } },
            worker: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const emptyCell = (): Cell => ({ approved: 0, pending: 0, onLeave: null });
  const grid = new Map<string, Map<string, Cell>>();
  for (const worker of workers) {
    grid.set(worker.id, new Map(dates.map((d) => [d, emptyCell()])));
  }

  for (const day of scheduleDays) {
    const cell = grid.get(day.schedule.workerId)?.get(day.date);
    if (!cell) continue;
    if (day.schedule.status === "APPROVED") cell.approved += day.hours;
    else cell.pending += day.hours;
  }
  for (const leave of leaves) {
    const row = grid.get(leave.workerId);
    if (!row) continue;
    for (const date of eachDate(leave.startDate, leave.endDate)) {
      const cell = row.get(date);
      if (cell) cell.onLeave = leave.type as "PAID" | "UNPAID";
    }
  }

  const byDate: Record<string, { hours: number; costCents?: number }> = Object.fromEntries(
    dates.map((d) => [d, isManager ? { hours: 0, costCents: 0 } : { hours: 0 }]),
  );
  let weekCostCents = 0;
  let weekHours = 0;

  const workerRows = workers.map((worker) => {
    const cells: Record<string, Cell> = {};
    let approvedHours = 0;
    let pendingHours = 0;
    for (const date of dates) {
      const cell = grid.get(worker.id)!.get(date)!;
      cells[date] = cell;
      const dayHours = cell.approved + cell.pending;
      approvedHours += cell.approved;
      pendingHours += cell.pending;
      byDate[date].hours += dayHours;
      if (isManager) {
        byDate[date].costCents =
          (byDate[date].costCents ?? 0) + Math.round(dayHours * worker.hourlyRateCents);
      }
    }
    const totalHours = approvedHours + pendingHours;
    const cost = laborCost(totalHours, worker.hourlyRateCents, settings);
    weekCostCents += cost.totalCents;
    weekHours += totalHours;
    return {
      worker: isManager
        ? worker
        : { id: worker.id, name: worker.name },
      cells,
      approvedHours,
      pendingHours,
      totalHours,
      overtimeHours: cost.overtimeHours,
      ...(isManager ? { cost } : {}),
    };
  });

  return NextResponse.json({
    viewer: isManager ? "MANAGER" : "WORKER",
    weekStart,
    weekEnd,
    dates,
    workers: workerRows,
    pendingSchedules: pendingSchedules.map((s) => ({
      id: s.id,
      workerId: s.workerId,
      workerName: s.worker.name,
      periodStart: s.periodStart,
      totalHours: s.days.reduce((t, d) => t + d.hours, 0),
    })),
    totals: {
      byDate,
      weekHours,
      ...(isManager ? { weekCostCents } : {}),
    },
    settings: {
      weeklyHourLimit: settings.weeklyHourLimit,
      overtimeMultiplier: settings.overtimeMultiplier,
      currencyCode: settings.currencyCode,
    },
  });
});
