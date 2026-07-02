// DB-backed payroll computation shared by the preview and run endpoints.

import type { CompanySettings, User } from "@prisma/client";
import { prisma } from "./db";
import { addDays, isValidDate, mondayOf, monthRange } from "./dates";
import { summarize } from "./hours";
import { getLeaveDaysInPeriod } from "./leave-db";
import { ApiError } from "./api";
import { computePayroll, type PayrollResult } from "./payroll";

export type PayFrequency = "WEEKLY" | "MONTHLY";

export function periodBounds(frequency: PayFrequency, periodStart: string): [string, string] {
  if (!isValidDate(periodStart)) {
    throw new ApiError(400, "periodStart must be a valid YYYY-MM-DD date");
  }
  if (frequency === "WEEKLY") {
    if (mondayOf(periodStart) !== periodStart) {
      throw new ApiError(400, "Weekly payroll periods must start on a Monday");
    }
    return [periodStart, addDays(periodStart, 6)];
  }
  if (!periodStart.endsWith("-01")) {
    throw new ApiError(400, "Monthly payroll periods must start on the 1st");
  }
  return monthRange(periodStart.slice(0, 7));
}

export async function computeWorkerPayroll(
  worker: Pick<User, "id" | "hourlyRateCents">,
  from: string,
  to: string,
  settings: CompanySettings,
): Promise<PayrollResult> {
  const summary = await summarize(worker.id, from, to, settings);
  const { paidDays, unpaidDays } = await getLeaveDaysInPeriod(worker.id, from, to);
  return computePayroll({
    hourlyRateCents: worker.hourlyRateCents,
    weeklyHourLimit: settings.weeklyHourLimit,
    overtimeMultiplier: settings.overtimeMultiplier,
    standardDayHours: settings.standardDayHours,
    weeks: summary.weeks,
    paidLeaveDays: paidDays,
    unpaidLeaveDays: unpaidDays,
  });
}

/** True if the worker already has a payment overlapping [from, to]. */
export async function hasOverlappingPayment(
  workerId: string,
  from: string,
  to: string,
): Promise<boolean> {
  const existing = await prisma.payment.findFirst({
    where: { workerId, periodStart: { lte: to }, periodEnd: { gte: from } },
  });
  return existing !== null;
}
