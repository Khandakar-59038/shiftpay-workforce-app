import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { addDays, isoWeekKey, mondayOf, todayStr } from "../../src/lib/dates";
import { summarize, workedHoursByDate } from "../../src/lib/hours";
import { createUser, resetDb } from "./helpers";

beforeEach(resetDb);

const SETTINGS = { weeklyHourLimit: 40, overtimeMultiplier: 1.5 };

async function makeSchedule(
  workerId: string,
  status: string,
  days: { date: string; hours: number }[],
) {
  return prisma.schedule.create({
    data: {
      workerId,
      periodType: "WEEKLY",
      periodStart: mondayOf(days[0].date),
      status,
      days: { create: days },
    },
  });
}

describe("workedHoursByDate", () => {
  it("counts only APPROVED schedules", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await makeSchedule(worker.id, "PENDING", [{ date: yesterday, hours: 8 }]);

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked ?? 0).toBe(0);
  });

  it("excludes future dates", async () => {
    const worker = await createUser("WORKER");
    const tomorrow = addDays(todayStr(), 1);
    await makeSchedule(worker.id, "APPROVED", [{ date: tomorrow, hours: 8 }]);

    const byDate = await workedHoursByDate(worker.id, tomorrow, tomorrow);
    expect(byDate.find((d) => d.date === tomorrow)?.worked ?? 0).toBe(0);
  });

  it("zeroes days inside approved leave", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await makeSchedule(worker.id, "APPROVED", [{ date: yesterday, hours: 8 }]);
    await prisma.leaveRequest.create({
      data: {
        workerId: worker.id,
        type: "PAID",
        startDate: yesterday,
        endDate: yesterday,
        reason: "trip",
        status: "APPROVED",
      },
    });

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    const day = byDate.find((d) => d.date === yesterday)!;
    expect(day.worked).toBe(0);
    expect(day.onLeave).toBe("PAID");
  });

  it("applies manager adjustments", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const yesterday = addDays(todayStr(), -1);
    await makeSchedule(worker.id, "APPROVED", [{ date: yesterday, hours: 8 }]);
    await prisma.timeAdjustment.create({
      data: {
        workerId: worker.id,
        date: yesterday,
        deltaHours: -2,
        reason: "left early",
        createdById: manager.id,
      },
    });

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked).toBe(6);
  });
});

describe("workedHoursByDate with clock entries (actuals override plan)", () => {
  const entry = (
    workerId: string,
    date: string,
    hours: number,
    status = "APPROVED",
    kind = "SCHEDULED",
  ) =>
    prisma.timeEntry.create({
      data: {
        workerId,
        date,
        kind,
        clockIn: new Date(`${date}T09:00:00`),
        clockOut: new Date(`${date}T17:00:00`),
        hours,
        status,
      },
    });

  it("approved punches replace scheduled hours for that date", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await approvedWeekFor(worker.id, yesterday, 8);
    await entry(worker.id, yesterday, 6.5);

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    const day = byDate.find((d) => d.date === yesterday)!;
    expect(day.worked).toBe(6.5);
    expect(day.actual).toBe(6.5);
  });

  it("pending punches do not count yet", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await approvedWeekFor(worker.id, yesterday, 8);
    await entry(worker.id, yesterday, 6.5, "PENDING");

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked).toBe(8);
  });

  it("extra work on an unscheduled day counts", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await entry(worker.id, yesterday, 3, "APPROVED", "EXTRA");

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked).toBe(3);
  });

  it("multiple approved punches on one day sum, and adjustments still apply", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const yesterday = addDays(todayStr(), -1);
    await entry(worker.id, yesterday, 6);
    await entry(worker.id, yesterday, 2, "APPROVED", "EXTRA");
    await prisma.timeAdjustment.create({
      data: {
        workerId: worker.id,
        date: yesterday,
        deltaHours: 1,
        reason: "forgot to punch first hour",
        createdById: manager.id,
      },
    });

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked).toBe(9);
  });

  it("punches on an approved-leave day still count", async () => {
    const worker = await createUser("WORKER");
    const yesterday = addDays(todayStr(), -1);
    await prisma.leaveRequest.create({
      data: {
        workerId: worker.id,
        type: "PAID",
        startDate: yesterday,
        endDate: yesterday,
        reason: "trip",
        status: "APPROVED",
      },
    });
    await entry(worker.id, yesterday, 4, "APPROVED", "EXTRA");

    const byDate = await workedHoursByDate(worker.id, yesterday, yesterday);
    expect(byDate.find((d) => d.date === yesterday)?.worked).toBe(4);
  });
});

async function approvedWeekFor(workerId: string, date: string, hours: number) {
  return prisma.schedule.create({
    data: {
      workerId,
      periodType: "WEEKLY",
      periodStart: mondayOf(date),
      status: "APPROVED",
      days: { create: [{ date, hours }] },
    },
  });
}

describe("summarize", () => {
  it("buckets by ISO week and splits overtime", async () => {
    const worker = await createUser("WORKER");
    // Build a full past week (Mon–Sat, 45h) two weeks ago.
    const monday = mondayOf(addDays(todayStr(), -14));
    const days = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: addDays(monday, i),
      hours: 7.5,
    }));
    await makeSchedule(worker.id, "APPROVED", days);

    const summary = await summarize(worker.id, monday, addDays(monday, 6), SETTINGS);
    expect(summary.totalHours).toBe(45);
    expect(summary.overtimeHours).toBe(5);
    expect(summary.regularHours).toBe(40);
    expect(summary.weeks).toEqual([{ weekKey: isoWeekKey(monday), hours: 45 }]);
  });

  it("splits hours across week boundaries", async () => {
    const worker = await createUser("WORKER");
    const monday = mondayOf(addDays(todayStr(), -14));
    const prevSunday = addDays(monday, -1);
    await makeSchedule(worker.id, "APPROVED", [{ date: prevSunday, hours: 4 }]);
    await makeSchedule(worker.id, "APPROVED", [{ date: monday, hours: 8 }]);

    const summary = await summarize(worker.id, prevSunday, monday, SETTINGS);
    expect(summary.weeks).toHaveLength(2);
    expect(summary.totalHours).toBe(12);
  });
});
