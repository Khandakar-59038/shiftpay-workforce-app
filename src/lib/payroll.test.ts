import { describe, expect, it } from "vitest";
import { computePayroll, type PayrollInputs } from "./payroll";

const base: PayrollInputs = {
  hourlyRateCents: 2000, // $20/h
  weeklyHourLimit: 40,
  overtimeMultiplier: 1.5,
  standardDayHours: 8,
  weeks: [],
  paidLeaveDays: 0,
  unpaidLeaveDays: 0,
};

describe("computePayroll", () => {
  it("pays regular hours with no overtime under the limit", () => {
    const r = computePayroll({ ...base, weeks: [{ weekKey: "2026-W27", hours: 38 }] });
    expect(r.regularHours).toBe(38);
    expect(r.overtimeHours).toBe(0);
    expect(r.grossRegularCents).toBe(76_000);
    expect(r.grossOvertimeCents).toBe(0);
    expect(r.netCents).toBe(76_000);
  });

  it("splits overtime beyond the weekly limit at the multiplier", () => {
    const r = computePayroll({ ...base, weeks: [{ weekKey: "2026-W27", hours: 45 }] });
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(5);
    expect(r.grossRegularCents).toBe(80_000);
    expect(r.grossOvertimeCents).toBe(15_000); // 5h × $20 × 1.5
    expect(r.netCents).toBe(95_000);
  });

  it("computes overtime per week independently", () => {
    const r = computePayroll({
      ...base,
      weeks: [
        { weekKey: "2026-W27", hours: 45 },
        { weekKey: "2026-W28", hours: 35 },
      ],
    });
    expect(r.overtimeHours).toBe(5);
    expect(r.regularHours).toBe(75);
  });

  it("pays approved paid leave at standard day hours", () => {
    const r = computePayroll({ ...base, paidLeaveDays: 2 });
    expect(r.paidLeaveHours).toBe(16);
    expect(r.paidLeaveCents).toBe(32_000);
    expect(r.netCents).toBe(32_000);
  });

  it("shows unpaid leave as a deduction that balances gross − net", () => {
    const r = computePayroll({
      ...base,
      weeks: [{ weekKey: "2026-W27", hours: 32 }],
      unpaidLeaveDays: 1,
    });
    expect(r.deductionCents).toBe(16_000); // 8h × $20
    expect(r.netCents).toBe(64_000);
    expect(r.grossCents).toBe(80_000);
    expect(r.grossCents - r.deductionCents).toBe(r.netCents);
  });

  it("rounds each line to whole cents", () => {
    const r = computePayroll({
      ...base,
      hourlyRateCents: 1234,
      weeks: [{ weekKey: "2026-W27", hours: 0.25 }],
    });
    expect(r.grossRegularCents).toBe(309); // round(0.25 × 1234 = 308.5)
    expect(Number.isInteger(r.netCents)).toBe(true);
  });

  it("returns all zeros for empty input", () => {
    const r = computePayroll(base);
    expect(r).toEqual({
      regularHours: 0,
      overtimeHours: 0,
      paidLeaveHours: 0,
      grossRegularCents: 0,
      grossOvertimeCents: 0,
      paidLeaveCents: 0,
      deductionCents: 0,
      grossCents: 0,
      netCents: 0,
    });
  });
});
