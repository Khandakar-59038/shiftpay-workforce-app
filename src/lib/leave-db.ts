// DB-backed leave queries shared by the leave and payroll APIs.

import { prisma } from "./db";
import { leaveDaysInRange, paidLeaveBalance } from "./leave";
import { getSettings } from "./settings";

export interface LeaveBalanceSummary {
  allowance: number;
  used: number;
  remaining: number;
}

/** Paid-leave balance for the calendar year containing `onDate`. */
export async function getLeaveBalance(
  workerId: string,
  onDate: string,
): Promise<LeaveBalanceSummary> {
  const settings = await getSettings();
  const year = onDate.slice(0, 4);
  const approved = await prisma.leaveRequest.findMany({
    where: {
      workerId,
      type: "PAID",
      status: "APPROVED",
      startDate: { lte: `${year}-12-31` },
      endDate: { gte: `${year}-01-01` },
    },
  });
  const used = approved.reduce(
    (sum, l) =>
      sum + leaveDaysInRange(l.startDate, l.endDate, `${year}-01-01`, `${year}-12-31`),
    0,
  );
  return {
    allowance: settings.paidLeaveDaysPerYear,
    used,
    remaining: paidLeaveBalance(settings.paidLeaveDaysPerYear, used),
  };
}

/** Approved leave weekdays that fall inside a payroll period. */
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
    if (leave.type === "PAID") paidDays += days;
    else unpaidDays += days;
  }
  return { paidDays, unpaidDays };
}
