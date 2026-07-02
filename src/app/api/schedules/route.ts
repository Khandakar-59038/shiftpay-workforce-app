import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireRole, requireUser } from "../../../lib/auth";
import { addDays, formatDate, isValidDate, mondayOf, monthRange } from "../../../lib/dates";
import { notifyManagers } from "../../../lib/notify";

const submitSchema = z.object({
  periodType: z.enum(["WEEKLY", "MONTHLY"]),
  periodStart: z.string(),
  days: z
    .array(z.object({ date: z.string(), hours: z.number().min(0).max(24) }))
    .min(1)
    .max(31),
});

function periodEndFor(periodType: "WEEKLY" | "MONTHLY", periodStart: string): string {
  if (periodType === "WEEKLY") {
    if (mondayOf(periodStart) !== periodStart) {
      throw new ApiError(400, "Weekly schedules must start on a Monday");
    }
    return addDays(periodStart, 6);
  }
  if (!periodStart.endsWith("-01")) {
    throw new ApiError(400, "Monthly schedules must start on the 1st of the month");
  }
  return monthRange(periodStart.slice(0, 7))[1];
}

export const POST = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const body = await parseBody(req, submitSchema);

  if (!isValidDate(body.periodStart)) {
    throw new ApiError(400, "periodStart must be a valid YYYY-MM-DD date");
  }
  const periodEnd = periodEndFor(body.periodType, body.periodStart);

  const seen = new Set<string>();
  let total = 0;
  for (const day of body.days) {
    if (!isValidDate(day.date)) {
      throw new ApiError(400, `Invalid date: ${day.date}`);
    }
    if (day.date < body.periodStart || day.date > periodEnd) {
      throw new ApiError(400, `${formatDate(day.date)} is outside the schedule period`);
    }
    if (!Number.isInteger(day.hours * 4)) {
      throw new ApiError(400, "Hours must be in quarter-hour steps (e.g. 7.75)");
    }
    if (seen.has(day.date)) {
      throw new ApiError(400, `Duplicate date: ${day.date}`);
    }
    seen.add(day.date);
    total += day.hours;
  }
  if (total === 0) {
    throw new ApiError(400, "Schedule must contain at least one working hour");
  }

  const schedule = await prisma.$transaction(async (tx) => {
    // Editing/resubmitting replaces any live schedule for the same period.
    await tx.schedule.updateMany({
      where: {
        workerId: session.userId,
        periodType: body.periodType,
        periodStart: body.periodStart,
        status: { in: ["PENDING", "APPROVED"] },
      },
      data: { status: "SUPERSEDED" },
    });
    const created = await tx.schedule.create({
      data: {
        workerId: session.userId,
        periodType: body.periodType,
        periodStart: body.periodStart,
        days: { create: body.days.filter((d) => d.hours > 0) },
      },
      include: { days: { orderBy: { date: "asc" } } },
    });
    await notifyManagers(tx, {
      type: "SCHEDULE_SUBMITTED",
      title: "Schedule awaiting approval",
      body: `${session.name} submitted a ${body.periodType.toLowerCase()} schedule starting ${formatDate(body.periodStart)}.`,
      href: "/approvals",
    });
    return created;
  });

  return NextResponse.json({ schedule }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const workerId =
    session.role === "WORKER"
      ? session.userId
      : (url.searchParams.get("workerId") ?? undefined);

  const schedules = await prisma.schedule.findMany({
    where: { ...(workerId ? { workerId } : {}), ...(status ? { status } : {}) },
    include: {
      days: { orderBy: { date: "asc" } },
      worker: { select: { id: true, name: true, email: true } },
    },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json({ schedules });
});
