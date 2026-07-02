// Worked-hours aggregation. Hours come from APPROVED schedule days for dates
// up to today, zeroed on approved-leave days, plus manager time adjustments.

import { prisma } from "./db";
import { eachDate, isoWeekKey, todayStr } from "./dates";
import { splitOvertime, type WeekHours } from "./payroll";

export interface DayHours {
  date: string;
  scheduled: number;
  adjustment: number;
  worked: number;
  onLeave: "PAID" | "UNPAID" | null;
}

export async function workedHoursByDate(
  workerId: string,
  from: string,
  to: string,
): Promise<DayHours[]> {
  const today = todayStr();

  const [scheduleDays, leaves, adjustments] = await Promise.all([
    prisma.scheduleDay.findMany({
      where: {
        date: { gte: from, lte: to },
        schedule: { workerId, status: "APPROVED" },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { workerId, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
    }),
    prisma.timeAdjustment.findMany({
      where: { workerId, date: { gte: from, lte: to } },
    }),
  ]);

  const scheduledByDate = new Map<string, number>();
  for (const day of scheduleDays) {
    scheduledByDate.set(day.date, (scheduledByDate.get(day.date) ?? 0) + day.hours);
  }

  const leaveByDate = new Map<string, "PAID" | "UNPAID">();
  for (const leave of leaves) {
    for (const date of eachDate(leave.startDate, leave.endDate)) {
      leaveByDate.set(date, leave.type as "PAID" | "UNPAID");
    }
  }

  const adjustmentByDate = new Map<string, number>();
  for (const adj of adjustments) {
    adjustmentByDate.set(adj.date, (adjustmentByDate.get(adj.date) ?? 0) + adj.deltaHours);
  }

  return eachDate(from, to).map((date) => {
    const inFuture = date > today;
    const onLeave = leaveByDate.get(date) ?? null;
    const scheduled = inFuture ? 0 : (scheduledByDate.get(date) ?? 0);
    const adjustment = inFuture ? 0 : (adjustmentByDate.get(date) ?? 0);
    const base = onLeave ? 0 : scheduled;
    return {
      date,
      scheduled,
      adjustment,
      worked: Math.max(0, base + adjustment),
      onLeave,
    };
  });
}

export function bucketWeeks(byDate: Pick<DayHours, "date" | "worked">[]): WeekHours[] {
  const buckets = new Map<string, number>();
  for (const day of byDate) {
    if (day.worked === 0) continue;
    const key = isoWeekKey(day.date);
    buckets.set(key, (buckets.get(key) ?? 0) + day.worked);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekKey, hours]) => ({ weekKey, hours }));
}

export interface HoursSummary {
  byDate: DayHours[];
  weeks: WeekHours[];
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
}

export async function summarize(
  workerId: string,
  from: string,
  to: string,
  settings: { weeklyHourLimit: number },
): Promise<HoursSummary> {
  const byDate = await workedHoursByDate(workerId, from, to);
  const weeks = bucketWeeks(byDate);
  const { regularHours, overtimeHours } = splitOvertime(weeks, settings.weeklyHourLimit);
  return {
    byDate,
    weeks,
    totalHours: regularHours + overtimeHours,
    regularHours,
    overtimeHours,
  };
}
