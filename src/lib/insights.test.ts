import { describe, expect, it } from "vitest";
import { laborCost, projectedOvertime } from "./insights";

const SETTINGS = { weeklyHourLimit: 40, overtimeMultiplier: 1.5 };
const RATE = 2000; // $20/h

describe("projectedOvertime", () => {
  it("reports no added overtime when the week stays under the limit", () => {
    const impacts = projectedOvertime(
      [{ weekKey: "2026-W27", hours: 30 }],
      [{ weekKey: "2026-W27", hours: 8 }],
      SETTINGS,
      RATE,
    );
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      weekKey: "2026-W27",
      totalHours: 38,
      addedOvertime: 0,
      addedOvertimeCostCents: 0,
    });
  });

  it("computes overtime introduced by crossing the limit", () => {
    const impacts = projectedOvertime(
      [{ weekKey: "2026-W27", hours: 38 }],
      [{ weekKey: "2026-W27", hours: 6 }],
      SETTINGS,
      RATE,
    );
    expect(impacts[0].addedOvertime).toBe(4);
    expect(impacts[0].addedOvertimeCostCents).toBe(12_000); // 4h × $20 × 1.5
  });

  it("only counts the newly added overtime when already over the limit", () => {
    const impacts = projectedOvertime(
      [{ weekKey: "2026-W27", hours: 45 }],
      [{ weekKey: "2026-W27", hours: 5 }],
      SETTINGS,
      RATE,
    );
    expect(impacts[0].addedOvertime).toBe(5);
    expect(impacts[0].totalHours).toBe(50);
  });

  it("handles weeks with no prior hours and ignores untouched weeks", () => {
    const impacts = projectedOvertime(
      [{ weekKey: "2026-W26", hours: 44 }], // untouched by the new schedule
      [{ weekKey: "2026-W27", hours: 42 }],
      SETTINGS,
      RATE,
    );
    expect(impacts).toHaveLength(1);
    expect(impacts[0].weekKey).toBe("2026-W27");
    expect(impacts[0].addedOvertime).toBe(2);
  });
});

describe("laborCost", () => {
  it("splits regular and overtime cost for a week", () => {
    const cost = laborCost(45, RATE, SETTINGS);
    expect(cost).toEqual({
      regularHours: 40,
      overtimeHours: 5,
      regularCents: 80_000,
      overtimeCents: 15_000,
      totalCents: 95_000,
    });
  });

  it("is plain hours × rate under the limit", () => {
    const cost = laborCost(32, RATE, SETTINGS);
    expect(cost.totalCents).toBe(64_000);
    expect(cost.overtimeHours).toBe(0);
  });
});
