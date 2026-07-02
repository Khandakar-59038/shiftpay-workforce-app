import { beforeEach, describe, expect, it } from "vitest";
import { GET as preview } from "../../src/app/api/payroll/preview/route";
import { POST as runPayroll } from "../../src/app/api/payroll/run/route";
import { GET as listRuns } from "../../src/app/api/payroll/route";
import { GET as getPayment } from "../../src/app/api/payroll/payments/[id]/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

const lastMonday = () => mondayOf(addDays(todayStr(), -14));

/**
 * Fixture: $20/h worker, approved Mon–Fri 9h/day (45h scheduled), with
 * approved PAID leave on Thursday and UNPAID leave on Friday.
 * Worked = 27h (3 days × 9h). Paid leave 1 day, unpaid 1 day.
 * regular 27h → $540; paid leave 8h → $160; deduction 8h → $160; net $700.
 */
async function fixture() {
  const worker = await createUser("WORKER", { hourlyRateCents: 2000 });
  const monday = lastMonday();
  await prisma.schedule.create({
    data: {
      workerId: worker.id,
      periodType: "WEEKLY",
      periodStart: monday,
      status: "APPROVED",
      days: {
        create: [0, 1, 2, 3, 4].map((i) => ({ date: addDays(monday, i), hours: 9 })),
      },
    },
  });
  await prisma.leaveRequest.create({
    data: {
      workerId: worker.id,
      type: "PAID",
      startDate: addDays(monday, 3),
      endDate: addDays(monday, 3),
      reason: "family",
      status: "APPROVED",
    },
  });
  await prisma.leaveRequest.create({
    data: {
      workerId: worker.id,
      type: "UNPAID",
      startDate: addDays(monday, 4),
      endDate: addDays(monday, 4),
      reason: "personal",
      status: "APPROVED",
    },
  });
  return { worker, monday };
}

function previewReq(cookie: string, periodStart: string) {
  return jsonRequest(`/api/payroll/preview?frequency=WEEKLY&periodStart=${periodStart}`, {
    method: "GET",
    cookie,
  });
}

describe("GET /api/payroll/preview", () => {
  it("computes the full breakdown for each worker", async () => {
    const { worker, monday } = await fixture();
    const manager = await createUser("MANAGER");

    const res = await preview(previewReq(await authCookie(manager), monday));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.periodEnd).toBe(addDays(monday, 6));

    const line = data.workers.find((w: { worker: { id: string } }) => w.worker.id === worker.id);
    expect(line.result).toMatchObject({
      regularHours: 27,
      overtimeHours: 0,
      paidLeaveHours: 8,
      grossRegularCents: 54_000,
      paidLeaveCents: 16_000,
      deductionCents: 16_000,
      netCents: 70_000,
    });
    expect(line.alreadyPaid).toBe(false);
  });
});

describe("POST /api/payroll/run", () => {
  it("creates payments matching the computation and notifies workers", async () => {
    const { worker, monday } = await fixture();
    const manager = await createUser("MANAGER");

    const res = await runPayroll(
      jsonRequest("/api/payroll/run", {
        cookie: await authCookie(manager),
        body: { frequency: "WEEKLY", periodStart: monday },
      }),
    );
    expect(res.status).toBe(201);
    const { run } = await res.json();
    expect(run.payments).toHaveLength(1);
    expect(run.payments[0].netCents).toBe(70_000);
    expect(run.payments[0].workerId).toBe(worker.id);

    const note = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "PAYMENT_PROCESSED" },
    });
    expect(note).not.toBeNull();
  });

  it("refuses to pay the same period twice", async () => {
    const { monday } = await fixture();
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(manager);

    const first = await runPayroll(
      jsonRequest("/api/payroll/run", {
        cookie,
        body: { frequency: "WEEKLY", periodStart: monday },
      }),
    );
    expect(first.status).toBe(201);

    const second = await runPayroll(
      jsonRequest("/api/payroll/run", {
        cookie,
        body: { frequency: "WEEKLY", periodStart: monday },
      }),
    );
    expect(second.status).toBe(409);
  });

  it("forbids workers from running payroll", async () => {
    const { worker, monday } = await fixture();
    const res = await runPayroll(
      jsonRequest("/api/payroll/run", {
        cookie: await authCookie(worker),
        body: { frequency: "WEEKLY", periodStart: monday },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/payroll and payments", () => {
  it("lists runs for managers and serves payslips to their owner only", async () => {
    const { worker, monday } = await fixture();
    const other = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(manager);

    await runPayroll(
      jsonRequest("/api/payroll/run", {
        cookie,
        body: { frequency: "WEEKLY", periodStart: monday },
      }),
    );

    const listRes = await listRuns(jsonRequest("/api/payroll", { method: "GET", cookie }));
    const { runs } = await listRes.json();
    expect(runs).toHaveLength(1);
    const paymentId = runs[0].payments[0].id;

    const own = await getPayment(
      jsonRequest(`/api/payroll/payments/${paymentId}`, {
        method: "GET",
        cookie: await authCookie(worker),
      }),
      { params: Promise.resolve({ id: paymentId }) },
    );
    expect(own.status).toBe(200);

    const stranger = await getPayment(
      jsonRequest(`/api/payroll/payments/${paymentId}`, {
        method: "GET",
        cookie: await authCookie(other),
      }),
      { params: Promise.resolve({ id: paymentId }) },
    );
    expect(stranger.status).toBe(403);
  });
});
