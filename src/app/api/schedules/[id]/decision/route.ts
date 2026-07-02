import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../../lib/api";
import { requireRole } from "../../../../../lib/auth";
import { formatDate, mondayOf } from "../../../../../lib/dates";
import { maybeOvertimeAlert, notify } from "../../../../../lib/notify";

const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const session = await requireRole(req, "MANAGER", "ADMIN");
  const { id } = await params;
  const { action, note } = await parseBody(req, decisionSchema);

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { days: true },
  });
  if (!schedule) throw new ApiError(404, "Schedule not found");
  if (schedule.status !== "PENDING") {
    throw new ApiError(409, `This schedule was already ${schedule.status.toLowerCase()}`);
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const period = `${schedule.periodType.toLowerCase()} schedule starting ${formatDate(schedule.periodStart)}`;

  await prisma.$transaction(async (tx) => {
    await tx.schedule.update({
      where: { id },
      data: {
        status,
        decidedById: session.userId,
        decidedAt: new Date(),
        managerNote: note ?? null,
      },
    });
    await notify(tx, schedule.workerId, {
      type: `SCHEDULE_${status}`,
      title: `Schedule ${status.toLowerCase()}`,
      body:
        status === "APPROVED"
          ? `Your ${period} was approved by ${session.name}.`
          : `Your ${period} was rejected${note ? `: “${note}”` : ""}. Please update and resubmit.`,
      href: "/schedule",
    });
  });

  if (status === "APPROVED") {
    const weeks = new Set(schedule.days.map((d) => mondayOf(d.date)));
    for (const monday of weeks) {
      await maybeOvertimeAlert(schedule.workerId, monday);
    }
  }

  return NextResponse.json({ ok: true, status });
});
