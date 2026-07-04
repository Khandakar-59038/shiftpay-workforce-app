// DB-backed leave queries shared by the leave and payroll APIs.

import { prisma } from "./db";
import { leaveDaysInRange, paidLeaveBalance, type LeaveType } from "./leave";
import { getSettings } from "./settings";

export interface LeaveBalanceSummary {
  allowance: number;
  used: number;
  remaining: number;
}

export interface LeaveBalances {
  vacation: LeaveBalanceSummary; // PAID time off
  sick: LeaveBalanceSummary;
}

/** Time-off and sick balances for the calendar year containing `onDate`. */
export async function getLeaveBalance(
  workerId: string,
  onDate: string,
): Promise<LeaveBalances> {
  const settings = await getSettings();
  const year = onDate.slice(0, 4);
  const approved = await prisma.leaveRequest.findMany({
    where: {
      workerId,
      type: { in: ["PAID", "SICK"] },
      status: "APPROVED",
      startDate: { lte: `${year}-12-31` },
      endDate: { gte: `${year}-01-01` },
    },
  });

  const usedByType = { PAID: 0, SICK: 0 };
  for (const leave of approved) {
    usedByType[leave.type as "PAID" | "SICK"] += leaveDaysInRange(
      leave.startDate,
      leave.endDate,
      `${year}-01-01`,
      `${year}-12-31`,
    );
  }

  const summary = (allowance: number, used: number): LeaveBalanceSummary => ({
    allowance,
    used,
    remaining: paidLeaveBalance(allowance, used),
  });

  return {
    vacation: summary(settings.paidLeaveDaysPerYear, usedByType.PAID),
    sick: summary(settings.sickLeaveDaysPerYear, usedByType.SICK),
  };
}

/** Remaining days for a specific leave type (Infinity for unpaid). */
export async function remainingForType(
  workerId: string,
  onDate: string,
  type: LeaveType,
): Promise<number> {
  if (type === "UNPAID") return Number.POSITIVE_INFINITY;
  const balances = await getLeaveBalance(workerId, onDate);
  return type === "SICK" ? balances.sick.remaining : balances.vacation.remaining;
}

/**
 * Approved leave weekdays inside a payroll period. Sick leave is paid,
 * so it counts with time off; only UNPAID becomes a deduction.
 */
export async function getLeaveDaysInPeriod(
  workerId: string,
  from: string,
  to: string,
): Promise<{ paidDays: number; unpaidDays: number }> {
  const approved = await prisma.leaveRequest.findMany({
    where: { workerId, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
  });
  let paidDays = 0;
  let unpaidDays = 0;
  for (const leave of approved) {
    const days = leaveDaysInRange(leave.startDate, leave.endDate, from, to);
    if (leave.type === "UNPAID") unpaidDays += days;
    else paidDays += days;
  }
  return { paidDays, unpaidDays };
}
