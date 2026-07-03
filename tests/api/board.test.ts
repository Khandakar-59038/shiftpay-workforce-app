import { beforeEach, describe, expect, it } from "vitest";
import { GET as getBoard } from "../../src/app/api/schedule-board/route";
import { GET as getImpact } from "../../src/app/api/schedules/[id]/impact/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

const week = () => mondayOf(addDays(todayStr(), 7));

async function schedule(
  workerId: string,
  monday: string,
  status: string,
  hoursByDay: number[],
) {
  return prisma.schedule.create({
    data: {
      workerId,
      periodType: "WEEKLY",
      periodStart: monday,
      status,
      days: {
        create: hoursByDay
          .map((hours, i) => ({ date: addDays(monday, i), hours }))
          .filter((d) => d.hours > 0),
      },
    },
  });
}

describe("GET /api/schedule-board", () => {
  it("gives workers a privacy-safe view: approved shifts only, no pay data", async () => {
    const worker = await createUser("WORKER");
    const colleague = await createUser("WORKER", { hourlyRateCents: 9999 });
    const monday = week();
    await schedule(colleague.id, monday, "APPROVED", [8, 8, 8, 8, 8]);
    await schedule(worker.id, monday, "PENDING", [8, 8, 0, 0, 0]);

    const res = await getBoard(
      jsonRequest(`/api/schedule-board?weekStart=${monday}`, {
        method: "GET",
        cookie: await authCookie(worker),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.viewer).toBe("WORKER");
    expect(JSON.stringify(data)).not.toContain("9999");
    expect(data.totals.weekCostCents).toBeUndefined();
    expect(data.pendingSchedules).toHaveLength(0);

    const colleagueRow = data.workers.find(
      (w: { worker: { id: string } }) => w.worker.id === colleague.id,
    );
    expect(colleagueRow.cells[monday].approved).toBe(8);
    expect(colleagueRow.cost).toBeUndefined();
    // Pending schedules are not shown to workers.
    const ownRow = data.workers.find((w: { worker: { id: string } }) => w.worker.id === worker.id);
    expect(ownRow.cells[monday].pending).toBe(0);
  });

  it("returns the grid with per-worker and week totals and OT-aware cost", async () => {
    const manager = await createUser("MANAGER");
    const alice = await createUser("WORKER", { hourlyRateCents: 2000 });
    const bob = await createUser("WORKER", { hourlyRateCents: 1000 });
    const monday = week();
    await schedule(alice.id, monday, "APPROVED", [9, 9, 9, 9, 9]); // 45h → 5h OT
    await schedule(bob.id, monday, "PENDING", [8, 8, 0, 0, 0]); // 16h pending

    const res = await getBoard(
      jsonRequest(`/api/schedule-board?weekStart=${monday}`, {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    const aliceRow = data.workers.find((w: { worker: { id: string } }) => w.worker.id === alice.id);
    expect(aliceRow.totalHours).toBe(45);
    expect(aliceRow.overtimeHours).toBe(5);
    // 40×$20 + 5×$20×1.5 = $950
    expect(aliceRow.cost.totalCents).toBe(95_000);
    expect(aliceRow.cells[monday]).toMatchObject({ approved: 9, pending: 0 });

    const bobRow = data.workers.find((w: { worker: { id: string } }) => w.worker.id === bob.id);
    expect(bobRow.pendingHours).toBe(16);
    expect(bobRow.cells[monday]).toMatchObject({ approved: 0, pending: 8 });

    // Week cost = alice 95000 + bob 16×$10 = 16000
    expect(data.totals.weekCostCents).toBe(111_000);
    expect(data.totals.byDate[monday].hours).toBe(17);
    expect(data.pendingSchedules).toHaveLength(1);
  });

  it("marks approved leave days on the grid", async () => {
    const manager = await createUser("MANAGER");
    const worker = await createUser("WORKER");
    const monday = week();
    await schedule(worker.id, monday, "APPROVED", [8, 8, 8, 8, 8]);
    await prisma.leaveRequest.create({
      data: {
        workerId: worker.id,
        type: "PAID",
        startDate: addDays(monday, 2),
        endDate: addDays(monday, 2),
        reason: "family",
        status: "APPROVED",
      },
    });

    const res = await getBoard(
      jsonRequest(`/api/schedule-board?weekStart=${monday}`, {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    const data = await res.json();
    const row = data.workers.find((w: { worker: { id: string } }) => w.worker.id === worker.id);
    expect(row.cells[addDays(monday, 2)].onLeave).toBe("PAID");
  });
});

describe("GET /api/schedules/[id]/impact", () => {
  it("computes overtime the approval would introduce", async () => {
    const manager = await createUser("MANAGER");
    const worker = await createUser("WORKER", { hourlyRateCents: 2000 });
    const monday = week();
    await schedule(worker.id, monday, "APPROVED", [8, 8, 8, 8, 6]); // 38h approved
    const pending = await schedule(worker.id, addDays(monday, 5), "PENDING", [6]); // +6h Sat

    const res = await getImpact(
      jsonRequest(`/api/schedules/${pending.id}/impact`, {
        method: "GET",
        cookie: await authCookie(manager),
      }),
      { params: Promise.resolve({ id: pending.id }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.impacts).toHaveLength(1);
    expect(data.impacts[0].addedOvertime).toBe(4); // 38+6 = 44 → 4h over
    expect(data.impacts[0].addedOvertimeCostCents).toBe(12_000);
    expect(data.totalAddedOvertime).toBe(4);
  });

  it("returns zero impact for an under-limit schedule", async () => {
    const manager = await createUser("MANAGER");
    const worker = await createUser("WORKER");
    const pending = await schedule(worker.id, week(), "PENDING", [8, 8, 8, 8, 8]);

    const res = await getImpact(
      jsonRequest(`/api/schedules/${pending.id}/impact`, {
        method: "GET",
        cookie: await authCookie(manager),
      }),
      { params: Promise.resolve({ id: pending.id }) },
    );
    const data = await res.json();
    expect(data.totalAddedOvertime).toBe(0);
  });
});
