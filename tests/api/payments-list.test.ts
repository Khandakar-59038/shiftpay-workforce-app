import { beforeEach, describe, expect, it } from "vitest";
import { GET as listPayments } from "../../src/app/api/payroll/payments/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

async function paymentFor(workerId: string, processedById: string) {
  const monday = mondayOf(addDays(todayStr(), -7));
  const run = await prisma.payrollRun.create({
    data: {
      periodStart: monday,
      periodEnd: addDays(monday, 6),
      frequency: "WEEKLY",
      processedById,
      settingsSnapshot: "{}",
    },
  });
  return prisma.payment.create({
    data: {
      payrollRunId: run.id,
      workerId,
      periodStart: monday,
      periodEnd: addDays(monday, 6),
      regularHours: 40,
      overtimeHours: 0,
      paidLeaveHours: 0,
      grossRegularCents: 80_000,
      grossOvertimeCents: 0,
      paidLeaveCents: 0,
      deductionCents: 0,
      netCents: 80_000,
    },
  });
}

describe("GET /api/payroll/payments", () => {
  it("returns only the worker's own payments", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    await paymentFor(worker.id, manager.id);
    await paymentFor(other.id, manager.id);

    const res = await listPayments(
      jsonRequest("/api/payroll/payments", { method: "GET", cookie: await authCookie(worker) }),
    );
    const { payments } = await res.json();
    expect(payments).toHaveLength(1);
    expect(payments[0].workerId).toBe(worker.id);
  });
});
