import { beforeEach, describe, expect, it } from "vitest";
import { GET as listSchedules, POST as submitSchedule } from "../../src/app/api/schedules/route";
import { POST as decideSchedule } from "../../src/app/api/schedules/[id]/decision/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

const nextMonday = () => mondayOf(addDays(todayStr(), 7));

function weekDays(monday: string, hours = 8, count = 5) {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(monday, i), hours }));
}

async function submit(worker: Awaited<ReturnType<typeof createUser>>, monday = nextMonday()) {
  return submitSchedule(
    jsonRequest("/api/schedules", {
      cookie: await authCookie(worker),
      body: { periodType: "WEEKLY", periodStart: monday, days: weekDays(monday) },
    }),
  );
}

describe("POST /api/schedules", () => {
  it("creates a pending schedule and notifies managers", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");

    const res = await submit(worker);
    expect(res.status).toBe(201);
    const { schedule } = await res.json();
    expect(schedule.status).toBe("PENDING");

    const notes = await prisma.notification.findMany({ where: { userId: manager.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("SCHEDULE_SUBMITTED");
  });

  it("supersedes an existing schedule for the same period", async () => {
    const worker = await createUser("WORKER");
    await createUser("MANAGER");

    const first = await (await submit(worker)).json();
    const second = await (await submit(worker)).json();

    const old = await prisma.schedule.findUnique({ where: { id: first.schedule.id } });
    expect(old?.status).toBe("SUPERSEDED");
    expect(second.schedule.status).toBe("PENDING");
  });

  it("rejects hours that are not quarter-hour steps", async () => {
    const worker = await createUser("WORKER");
    const monday = nextMonday();
    const res = await submitSchedule(
      jsonRequest("/api/schedules", {
        cookie: await authCookie(worker),
        body: {
          periodType: "WEEKLY",
          periodStart: monday,
          days: [{ date: monday, hours: 8.1 }],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects days outside the period", async () => {
    const worker = await createUser("WORKER");
    const monday = nextMonday();
    const res = await submitSchedule(
      jsonRequest("/api/schedules", {
        cookie: await authCookie(worker),
        body: {
          periodType: "WEEKLY",
          periodStart: monday,
          days: [{ date: addDays(monday, 10), hours: 8 }],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("requires a worker session", async () => {
    const res = await submitSchedule(
      jsonRequest("/api/schedules", {
        body: { periodType: "WEEKLY", periodStart: nextMonday(), days: weekDays(nextMonday()) },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/schedules/[id]/decision", () => {
  it("approves and notifies the worker", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { schedule } = await (await submit(worker)).json();

    const res = await decideSchedule(
      jsonRequest(`/api/schedules/${schedule.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: schedule.id }) },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.schedule.findUnique({ where: { id: schedule.id } });
    expect(updated?.status).toBe("APPROVED");
    expect(updated?.decidedById).toBe(manager.id);

    const note = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "SCHEDULE_APPROVED" },
    });
    expect(note).not.toBeNull();
  });

  it("rejects with a note and allows resubmission", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { schedule } = await (await submit(worker)).json();

    const res = await decideSchedule(
      jsonRequest(`/api/schedules/${schedule.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "REJECT", note: "Too many hours on Friday" },
      }),
      { params: Promise.resolve({ id: schedule.id }) },
    );
    expect(res.status).toBe(200);

    const rejected = await prisma.schedule.findUnique({ where: { id: schedule.id } });
    expect(rejected?.status).toBe("REJECTED");
    expect(rejected?.managerNote).toBe("Too many hours on Friday");

    const resubmit = await submit(worker);
    expect(resubmit.status).toBe(201);
    // Rejected schedule stays rejected (not superseded).
    const still = await prisma.schedule.findUnique({ where: { id: schedule.id } });
    expect(still?.status).toBe("REJECTED");
  });

  it("forbids workers from deciding", async () => {
    const worker = await createUser("WORKER");
    await createUser("MANAGER");
    const { schedule } = await (await submit(worker)).json();

    const res = await decideSchedule(
      jsonRequest(`/api/schedules/${schedule.id}/decision`, {
        cookie: await authCookie(worker),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: schedule.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when deciding twice", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { schedule } = await (await submit(worker)).json();

    const decide = async () =>
      decideSchedule(
        jsonRequest(`/api/schedules/${schedule.id}/decision`, {
          cookie: await authCookie(manager),
          body: { action: "APPROVE" },
        }),
        { params: Promise.resolve({ id: schedule.id }) },
      );
    expect((await decide()).status).toBe(200);
    expect((await decide()).status).toBe(409);
  });

  it("alerts managers when approval pushes weekly overtime past the threshold", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    // Past week with 55h → 15h OT ≥ default threshold 10.
    const monday = mondayOf(addDays(todayStr(), -14));
    const res = await submitSchedule(
      jsonRequest("/api/schedules", {
        cookie: await authCookie(worker),
        body: {
          periodType: "WEEKLY",
          periodStart: monday,
          days: weekDays(monday, 11, 5),
        },
      }),
    );
    const { schedule } = await res.json();

    await decideSchedule(
      jsonRequest(`/api/schedules/${schedule.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: schedule.id }) },
    );

    const alert = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "OVERTIME_ALERT" },
    });
    expect(alert).not.toBeNull();
  });
});

describe("GET /api/schedules", () => {
  it("workers see only their own schedules", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    await createUser("MANAGER");
    await submit(worker);
    await submit(other);

    const res = await listSchedules(
      jsonRequest("/api/schedules", { method: "GET", cookie: await authCookie(worker) }),
    );
    const { schedules } = await res.json();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].workerId).toBe(worker.id);
  });

  it("managers see all schedules", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    await submit(worker);
    await submit(other);

    const res = await listSchedules(
      jsonRequest("/api/schedules", { method: "GET", cookie: await authCookie(manager) }),
    );
    const { schedules } = await res.json();
    expect(schedules).toHaveLength(2);
  });
});
