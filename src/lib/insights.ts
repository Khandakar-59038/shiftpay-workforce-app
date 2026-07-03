// Scheduling insights: overtime a manager is about to approve, and
// OT-aware labor cost. Pure functions — the industry lesson (Deputy,
// Shiftboard) is to surface cost and overtime *before* publishing.

import type { WeekHours } from "./payroll";

interface InsightSettings {
  weeklyHourLimit: number;
  overtimeMultiplier: number;
}

export interface WeekImpact {
  weekKey: string;
  existingHours: number;
  addedHours: number;
  totalHours: number;
  addedOvertime: number;
  addedOvertimeCostCents: number;
}

/**
 * For each week touched by a pending schedule, how much overtime would
 * approving it introduce on top of already-approved hours?
 */
export function projectedOvertime(
  existing: WeekHours[],
  added: WeekHours[],
  settings: InsightSettings,
  hourlyRateCents: number,
): WeekImpact[] {
  const existingByWeek = new Map(existing.map((w) => [w.weekKey, w.hours]));

  return added
    .filter((w) => w.hours > 0)
    .sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1))
    .map((week) => {
      const existingHours = existingByWeek.get(week.weekKey) ?? 0;
      const totalHours = existingHours + week.hours;
      const existingOvertime = Math.max(0, existingHours - settings.weeklyHourLimit);
      const totalOvertime = Math.max(0, totalHours - settings.weeklyHourLimit);
      const addedOvertime = totalOvertime - existingOvertime;
      return {
        weekKey: week.weekKey,
        existingHours,
        addedHours: week.hours,
        totalHours,
        addedOvertime,
        addedOvertimeCostCents: Math.round(
          addedOvertime * hourlyRateCents * settings.overtimeMultiplier,
        ),
      };
    });
}

export interface WeekCost {
  regularHours: number;
  overtimeHours: number;
  regularCents: number;
  overtimeCents: number;
  totalCents: number;
}

/** OT-aware cost of one worker-week of scheduled hours. */
export function laborCost(
  weekHours: number,
  hourlyRateCents: number,
  settings: InsightSettings,
): WeekCost {
  const overtimeHours = Math.max(0, weekHours - settings.weeklyHourLimit);
  const regularHours = weekHours - overtimeHours;
  const regularCents = Math.round(regularHours * hourlyRateCents);
  const overtimeCents = Math.round(
    overtimeHours * hourlyRateCents * settings.overtimeMultiplier,
  );
  return {
    regularHours,
    overtimeHours,
    regularCents,
    overtimeCents,
    totalCents: regularCents + overtimeCents,
  };
}
