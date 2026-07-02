// Pure payroll math. All money is integer cents; hours are decimal.
// Worked hours arrive already bucketed by ISO week with leave days excluded.
// Unpaid leave is valued and shown as a deduction line so the payslip
// balances: gross − deduction = net (SRS 2.2.3).

export interface WeekHours {
  weekKey: string;
  hours: number;
}

export interface PayrollInputs {
  hourlyRateCents: number;
  weeklyHourLimit: number;
  overtimeMultiplier: number;
  standardDayHours: number;
  weeks: WeekHours[];
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

export interface PayrollResult {
  regularHours: number;
  overtimeHours: number;
  paidLeaveHours: number;
  grossRegularCents: number;
  grossOvertimeCents: number;
  paidLeaveCents: number;
  deductionCents: number;
  grossCents: number;
  netCents: number;
}

export function splitOvertime(weeks: WeekHours[], weeklyHourLimit: number) {
  let regularHours = 0;
  let overtimeHours = 0;
  for (const week of weeks) {
    const overtime = Math.max(0, week.hours - weeklyHourLimit);
    overtimeHours += overtime;
    regularHours += week.hours - overtime;
  }
  return { regularHours, overtimeHours };
}

export function computePayroll(inputs: PayrollInputs): PayrollResult {
  const { regularHours, overtimeHours } = splitOvertime(inputs.weeks, inputs.weeklyHourLimit);
  const paidLeaveHours = inputs.paidLeaveDays * inputs.standardDayHours;
  const unpaidLeaveHours = inputs.unpaidLeaveDays * inputs.standardDayHours;

  const grossRegularCents = Math.round(regularHours * inputs.hourlyRateCents);
  const grossOvertimeCents = Math.round(
    overtimeHours * inputs.hourlyRateCents * inputs.overtimeMultiplier,
  );
  const paidLeaveCents = Math.round(paidLeaveHours * inputs.hourlyRateCents);
  const deductionCents = Math.round(unpaidLeaveHours * inputs.hourlyRateCents);

  const netCents = grossRegularCents + grossOvertimeCents + paidLeaveCents;
  const grossCents = netCents + deductionCents;

  return {
    regularHours,
    overtimeHours,
    paidLeaveHours,
    grossRegularCents,
    grossOvertimeCents,
    paidLeaveCents,
    deductionCents,
    grossCents,
    netCents,
  };
}
