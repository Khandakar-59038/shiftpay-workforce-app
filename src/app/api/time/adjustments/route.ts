import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { requireRole } from "../../../../lib/auth";
import { formatDate, isValidDate } from "../../../../lib/dates";
import { maybeOvertimeAlert, notify } from "../../../../lib/notify";

const adjustmentSchema = z.object({
  workerId: z.string().min(1),
  date: z.string(),
  deltaHours: z.number().min(-24).max(24),
  reason: z.string().min(1).max(500),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "MANAGER", "ADMIN");
  const body = await parseBody(req, adjustmentSchema);

  if (!isValidDate(body.date)) throw new ApiError(400, "date must be YYYY-MM-DD");
  if (body.deltaHours === 0) throw new ApiError(400, "Adjustment cannot be zero hours");
  if (!Number.isInteger(body.deltaHours * 4)) {
    throw new ApiError(400, "Adjustments must be in quarter-hour steps");
  }

  const worker = await prisma.user.findUnique({ where: { id: body.workerId } });
  if (!worker || worker.role !== "WORKER") throw new ApiError(404, "Worker not found");

  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await tx.timeAdjustment.create({
      data: { ...body, createdById: session.userId },
    });
    const direction = body.deltaHours > 0 ? "added to" : "deducted from";
    await notify(tx, worker.id, {
      type: "HOURS_ADJUSTED",
      title: "Working hours adjusted",
      body: `${session.name} ${direction} your hours on ${formatDate(body.date)} (${body.deltaHours > 0 ? "+" : ""}${body.deltaHours}h): ${body.reason}`,
      href: "/time",
    });
    return created;
  });

  await maybeOvertimeAlert(worker.id, body.date);

  return NextResponse.json({ adjustment }, { status: 201 });
});
