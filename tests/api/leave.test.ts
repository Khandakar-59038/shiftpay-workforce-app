import { beforeEach, describe, expect, it } from "vitest";
import { GET as listLeave, POST as requestLeave } from "../../src/app/api/leave/route";
import { POST as decideLeave } from "../../src/app/api/leave/[id]/decision/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

// A Monday in the future keeps ranges weekday-only and deterministic.
const monday = () => mondayOf(addDays(todayStr(), 14));

async function request(
  worker: Awaited<ReturnType<typeof createUser>>,
  body: Partial<{ type: string; startDate: string; endDate: string; reason: string }> = {},
) {
  return requestLeave(
    jsonRequest("/api/leave", {
      cookie: await authCookie(worker),
      body: {
        type: "PAID",
        startDate: monday(),
        endDate: addDays(monday(), 1),
        reason: "Family event",
        ...body,
      },
    }),
  );
}

describe("POST /api/leave", () => {
  it("creates a pending request and notifies managers", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");

    const res = await request(worker);
    expect(res.status).toBe(201);
    const { leave } = await res.json();
    expect(leave.status).toBe("PENDING");

    const note = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "LEAVE_REQUESTED" },
    });
    expect(note).not.toBeNull();
  });

  it("rejects paid leave exceeding the balance", async () => {
    const worker = await createUser("WORKER");
    await prisma.companySettings.update({
      where: { id: 1 },
      data: { paidLeaveDaysPerYear: 1 },
    });
    const res = await request(worker); // 2 weekdays > 1 allowance
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/balance/i);
  });

  it("allows unpaid leave regardless of balance", async () => {
    const worker = await createUser("WORKER");
    await prisma.companySettings.update({
      where: { id: 1 },
      data: { paidLeaveDaysPerYear: 0 },
    });
    const res = await request(worker, { type: "UNPAID" });
    expect(res.status).toBe(201);
  });

  it("rejects overlapping requests", async () => {
    const worker = await createUser("WORKER");
    expect((await request(worker)).status).toBe(201);
    const res = await request(worker, {
      startDate: addDays(monday(), 1),
      endDate: addDays(monday(), 2),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/leave/[id]/decision", () => {
  it("approves and notifies the worker; balance reflects usage", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { leave } = await (await request(worker)).json();

    const res = await decideLeave(
      jsonRequest(`/api/leave/${leave.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: leave.id }) },
    );
    expect(res.status).toBe(200);

    const note = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "LEAVE_APPROVED" },
    });
    expect(note).not.toBeNull();

    const listRes = await listLeave(
      jsonRequest("/api/leave", { method: "GET", cookie: await authCookie(worker) }),
    );
    const data = await listRes.json();
    expect(data.balances.vacation.used).toBe(2);
    expect(data.balances.vacation.remaining).toBe(13); // default 15 − 2
    expect(data.balances.sick.used).toBe(0);
  });

  it("forbids workers from deciding", async () => {
    const worker = await createUser("WORKER");
    await createUser("MANAGER");
    const { leave } = await (await request(worker)).json();

    const res = await decideLeave(
      jsonRequest(`/api/leave/${leave.id}/decision`, {
        cookie: await authCookie(worker),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: leave.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when deciding twice", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { leave } = await (await request(worker)).json();
    const decide = async () =>
      decideLeave(
        jsonRequest(`/api/leave/${leave.id}/decision`, {
          cookie: await authCookie(manager),
          body: { action: "REJECT", note: "busy week" },
        }),
        { params: Promise.resolve({ id: leave.id }) },
      );
    expect((await decide()).status).toBe(200);
    expect((await decide()).status).toBe(409);
  });
});

describe("sick leave", () => {
  it("draws down the sick balance, not time off", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const { leave } = await (await request(worker, { type: "SICK" })).json();
    await decideLeave(
      jsonRequest(`/api/leave/${leave.id}/decision`, {
        cookie: await authCookie(manager),
        body: { action: "APPROVE" },
      }),
      { params: Promise.resolve({ id: leave.id }) },
    );
    const data = await (
      await listLeave(jsonRequest("/api/leave", { method: "GET", cookie: await authCookie(worker) }))
    ).json();
    expect(data.balances.sick.used).toBe(2);
    expect(data.balances.vacation.used).toBe(0);
  });

  it("rejects sick leave beyond the sick allowance", async () => {
    const worker = await createUser("WORKER");
    await prisma.companySettings.update({
      where: { id: 1 },
      data: { sickLeaveDaysPerYear: 1 },
    });
    const res = await request(worker, { type: "SICK" }); // 2 weekdays > 1
    expect(res.status).toBe(400);
  });
});

describe("GET /api/leave", () => {
  it("workers see only their own requests", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    await request(worker);
    await request(other);

    const res = await listLeave(
      jsonRequest("/api/leave", { method: "GET", cookie: await authCookie(worker) }),
    );
    const { leaves } = await res.json();
    expect(leaves).toHaveLength(1);
    expect(leaves[0].workerId).toBe(worker.id);
  });
});
