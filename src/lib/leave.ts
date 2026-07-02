// Pure leave-management logic. Leave days are business days (Mon–Fri).

import { weekdayCount } from "./dates";

export function paidLeaveBalance(allowanceDays: number, usedDays: number): number {
  return Math.max(0, allowanceDays - usedDays);
}

/**
 * Weekday count of a leave range, optionally clipped to a period window
 * (used when valuing leave inside a payroll period).
 */
export function leaveDaysInRange(
  startDate: string,
  endDate: string,
  clipFrom?: string,
  clipTo?: string,
): number {
  const from = clipFrom && clipFrom > startDate ? clipFrom : startDate;
  const to = clipTo && clipTo < endDate ? clipTo : endDate;
  if (to < from) return 0;
  return weekdayCount(from, to);
}

interface ExistingLeave {
  startDate: string;
  endDate: string;
  status: string; // PENDING | APPROVED | REJECTED
}

interface LeaveRequestInput {
  type: "PAID" | "UNPAID";
  startDate: string;
  endDate: string;
  existing: ExistingLeave[];
  balance: number; // remaining paid-leave days
}

export type LeaveValidation = { ok: true; days: number } | { ok: false; error: string };

export function validateLeaveRequest(input: LeaveRequestInput): LeaveValidation {
  if (input.endDate < input.startDate) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  const blocking = input.existing.filter(
    (l) => l.status === "PENDING" || l.status === "APPROVED",
  );
  const overlaps = blocking.some(
    (l) => input.startDate <= l.endDate && input.endDate >= l.startDate,
  );
  if (overlaps) {
    return { ok: false, error: "This request overlaps an existing pending or approved leave." };
  }

  const days = weekdayCount(input.startDate, input.endDate);
  if (days === 0) {
    return { ok: false, error: "The selected range contains no working days (Mon–Fri)." };
  }

  if (input.type === "PAID" && days > input.balance) {
    return {
      ok: false,
      error: `Not enough paid-leave balance: requested ${days} day(s), remaining ${input.balance}.`,
    };
  }

  return { ok: true, days };
}
