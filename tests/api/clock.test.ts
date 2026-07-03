import { beforeEach, describe, expect, it } from "vitest";
import { POST as clockIn } from "../../src/app/api/clock/in/route";
import { POST as clockOut } from "../../src/app/api/clock/out/route";
import { GET as getClock } from "../../src/app/api/clock/route";
import { GET as listEntries } from "../../src/app/api/time-entries/route";
import { POST as decideEntry } from "../../src/app/api/time-entries/[id]/decision/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { workedHoursByDate } from "../../src/lib/hours";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

async function approvedShiftToday(workerId: string, hours = 8) {
  const today = todayStr();
  return prisma.schedule.create({
    data: {
      workerId,
      periodType: "WEEKLY",
      periodStart: mondayOf(today),
      status: "APPROVED",
      days: { create: [{ date: today, hours }] },
    },
  });
}

/** Move the active entry's clock-in time into the past. */
async function backdateActiveEntry(workerId: string, minutesAgo: number) {
  const active = await prisma.timeEntry.findFirst({ where: { workerId, status: "ACTIVE" } });
  await prisma.timeEntry.update({
    where: { id: active!.id },
    data: { clockIn: new Date(Date.now() - minutesAgo * 60_000) },
  });
}

describe("POST /api/clock/in", () => {
  it("clocks into today's assigned shift", async () => {
    const worker = await createUser("WORKER");
    await approvedShiftToday(worker.id);

    const res = await clockIn(
      jsonRequest("/api/clock/in", { cookie: await authCookie(worker), body: { kind: "SCHEDULED" } }),
    );
    expect(res.status).toBe(201);
    const { entry } = await res.json();
    expect(entry.status).toBe("ACTIVE");
    expect(entry.kind).toBe("SCHEDULED");
    expect(entry.scheduleDayId).toBeTruthy();
  });

  it("rejects a scheduled clock-in when no approved shift exists today", async () => {
    const worker = await createUser("WORKER");
    const res = await clockIn(
      jsonRequest("/api/clock/in", { cookie: await authCookie(worker), body: { kind: "SCHEDULED" } }),
    );
    expect(res.status).toBe(400);
  });

  it("allows extra work without a shift but requires a note", async () => {
    const worker = await createUser("WORKER");
    const cookie = await authCookie(worker);

    const missingNote = await clockIn(
      jsonRequest("/api/clock/in", { cookie, body: { kind: "EXTRA" } }),
    );
    expect(missingNote.status).toBe(400);

    const res = await clockIn(
      jsonRequest("/api/clock/in", {
        cookie,
        body: { kind: "EXTRA", note: "Inventory count for the warehouse" },
      }),
    );
    expect(res.status).toBe(201);
    const { entry } = await res.json();
    expect(entry.kind).toBe("EXTRA");
  });

  it("prevents a second active clock-in", async () => {
    const worker = await createUser("WORKER");
    await approvedShiftToday(worker.id);
    const cookie = await authCookie(worker);
    await clockIn(jsonRequest("/api/clock/in", { cookie, body: { kind: "SCHEDULED" } }));
    const second = await clockIn(jsonRequest("/api/clock/in", { cookie, body: { kind: "SCHEDULED" } }));
    expect(second.status).toBe(409);
  });
});

describe("POST /api/clock/out", () => {
  it("rounds hours to quarter steps, submits for approval, and notifies managers", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    await approvedShiftToday(worker.id);
    const cookie = await authCookie(worker);

    await clockIn(jsonRequest("/api/clock/in", { cookie, body: { kind: "SCHEDULED" } }));
    await backdateActiveEntry(worker.id, 230); // 3h50m → 3.75h

    const res = await clockOut(
      jsonRequest("/api/clock/out", { cookie, body: { note: "Handover done" } }),
    );
    expect(res.status).toBe(200);
    const { entry } = await res.json();
    expect(entry.hours).toBe(3.75);
    expect(entry.status).toBe("PENDING");
    expect(entry.note).toBe("Handover done");

    const note = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "TIMESHEET_SUBMITTED" },
    });
    expect(note).not.toBeNull();
  });

  it("409s when not clocked in", async () => {
    const worker = await createUser("WORKER");
    const res = await clockOut(
      jsonRequest("/api/clock/out", { cookie: await authCookie(worker), body: {} }),
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/clock", () => {
  it("returns active entry, today's entries, and today's shift", async () => {
    const worker = await createUser("WORKER");
    await approvedShiftToday(worker.id, 7.5);
    const cookie = await authCookie(worker);
    await clockIn(jsonRequest("/api/clock/in", { cookie, body: { kind: "SCHEDULED" } }));

    const res = await getClock(jsonRequest("/api/clock", { method: "GET", cookie }));
    const data = await res.json();
    expect(data.active).not.toBeNull();
    expect(data.todayShift.hours).toBe(7.5);
    expect(data.today).toHaveLength(1);
  });
});

describe("time entry decisions", () => {
  async function pendingEntry(workerCookie: string, workerId: string) {
    await clockIn(
      jsonRequest("/api/clock/in", {
        cookie: workerCookie,
        body: { kind: "EXTRA", note: "Stocktake" },
      }),
    );
    await backdateActiveEntry(workerId, 120); // 2h
    const res = await clockOut(jsonRequest("/api/clock/out", { cookie: workerCookie, body: {} }));
    return (await res.json()).entry as { id: string };
  }

  it("approval counts the hours and notifies the worker", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(worker);
    const entry = await pendingEntry(cookie, worker.id);

    const res = await decideEntry(
      jsonRequest(`/api/time-entries/${entry.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(res.status).toBe(200);

    const byDate = await workedHoursByDate(worker.id, todayStr(), todayStr());
    expect(byDate[0].worked).toBe(2);

    const note = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "TIMESHEET_APPROVED" },
    });
    expect(note).not.toBeNull();
  });

  it("rejection leaves hours uncounted", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(worker);
    const entry = await pendingEntry(cookie, worker.id);

    await decideEntry(
      jsonRequest(`/api/time-entries/${entry.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "REJECT", note: "No stocktake was requested" },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    const byDate = await workedHoursByDate(worker.id, todayStr(), todayStr());
    expect(byDate[0].worked).toBe(0);
  });

  it("workers cannot decide and double decisions 409", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(worker);
    const entry = await pendingEntry(cookie, worker.id);

    const forbidden = await decideEntry(
      jsonRequest(`/api/time-entries/${entry.id}/decision`, {
        cookie,
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(forbidden.status).toBe(403);

    const managerCookie = await authCookie(manager);
    const first = await decideEntry(
      jsonRequest(`/api/time-entries/${entry.id}/decision`, {
        cookie: managerCookie,
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(first.status).toBe(200);
    const second = await decideEntry(
      jsonRequest(`/api/time-entries/${entry.id}/decision`, {
        cookie: managerCookie,
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: entry.id }) },
    );
    expect(second.status).toBe(409);
  });

  it("lists pending entries for managers only", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(worker);
    await pendingEntry(cookie, worker.id);

    const forbidden = await listEntries(
      jsonRequest("/api/time-entries?status=PENDING", { method: "GET", cookie }),
    );
    expect(forbidden.status).toBe(403);

    const res = await listEntries(
      jsonRequest("/api/time-entries?status=PENDING", {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].worker.name).toBeTruthy();
  });
});
