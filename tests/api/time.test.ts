import { beforeEach, describe, expect, it } from "vitest";
import { GET as getTime } from "../../src/app/api/time/route";
import { POST as adjust } from "../../src/app/api/time/adjustments/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

async function approvedWeek(workerId: string, monday: string, hoursPerDay = 8, days = 5) {
  return prisma.schedule.create({
    data: {
      workerId,
      periodType: "WEEKLY",
      periodStart: monday,
      status: "APPROVED",
      days: {
        create: Array.from({ length: days }, (_, i) => ({
          date: addDays(monday, i),
          hours: hoursPerDay,
        })),
      },
    },
  });
}

function timeUrl(from: string, to: string, workerId?: string) {
  const params = new URLSearchParams({ from, to });
  if (workerId) params.set("workerId", workerId);
  return `/api/time?${params}`;
}

describe("GET /api/time", () => {
  it("returns a worker's own summary", async () => {
    const worker = await createUser("WORKER");
    const monday = mondayOf(addDays(todayStr(), -14));
    await approvedWeek(worker.id, monday);

    const res = await getTime(
      jsonRequest(timeUrl(monday, addDays(monday, 6)), {
        method: "GET",
        cookie: await authCookie(worker),
      }),
    );
    expect(res.status).toBe(200);
    const { summary } = await res.json();
    expect(summary.totalHours).toBe(40);
    expect(summary.overtimeHours).toBe(0);
  });

  it("forbids workers from reading someone else's hours", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const res = await getTime(
      jsonRequest(timeUrl(todayStr(), todayStr(), other.id), {
        method: "GET",
        cookie: await authCookie(worker),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("lets managers read any worker's hours", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const monday = mondayOf(addDays(todayStr(), -14));
    await approvedWeek(worker.id, monday);

    const res = await getTime(
      jsonRequest(timeUrl(monday, addDays(monday, 6), worker.id), {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    const { summary } = await res.json();
    expect(summary.totalHours).toBe(40);
  });
});

describe("POST /api/time/adjustments", () => {
  it("applies the adjustment and notifies the worker", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const monday = mondayOf(addDays(todayStr(), -14));
    await approvedWeek(worker.id, monday);

    const res = await adjust(
      jsonRequest("/api/time/adjustments", {
        cookie: await authCookie(manager),
        body: { workerId: worker.id, date: monday, deltaHours: -2, reason: "Left early" },
      }),
    );
    expect(res.status).toBe(201);

    const timeRes = await getTime(
      jsonRequest(timeUrl(monday, addDays(monday, 6), worker.id), {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    const { summary } = await timeRes.json();
    expect(summary.totalHours).toBe(38);

    const note = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "HOURS_ADJUSTED" },
    });
    expect(note).not.toBeNull();
  });

  it("creates an overtime alert when the adjustment crosses the threshold", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const monday = mondayOf(addDays(todayStr(), -14));
    await approvedWeek(worker.id, monday, 9.75, 5); // 48.75h → 8.75 OT (< 10)

    await adjust(
      jsonRequest("/api/time/adjustments", {
        cookie: await authCookie(manager),
        body: { workerId: worker.id, date: monday, deltaHours: 2, reason: "Late shift" },
      }),
    ); // 50.75h → 10.75 OT ≥ 10

    const alert = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "OVERTIME_ALERT" },
    });
    expect(alert).not.toBeNull();
  });

  it("rejects zero and non-quarter deltas", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    for (const deltaHours of [0, 1.3]) {
      const res = await adjust(
        jsonRequest("/api/time/adjustments", {
          cookie: await authCookie(manager),
          body: { workerId: worker.id, date: todayStr(), deltaHours, reason: "x" },
        }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("forbids workers from adjusting hours", async () => {
    const worker = await createUser("WORKER");
    const res = await adjust(
      jsonRequest("/api/time/adjustments", {
        cookie: await authCookie(worker),
        body: { workerId: worker.id, date: todayStr(), deltaHours: 1, reason: "x" },
      }),
    );
    expect(res.status).toBe(403);
  });
});
