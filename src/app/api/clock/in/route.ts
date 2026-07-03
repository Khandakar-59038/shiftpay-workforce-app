import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { requireRole } from "../../../../lib/auth";
import { todayStr } from "../../../../lib/dates";

const clockInSchema = z.object({
  kind: z.enum(["SCHEDULED", "EXTRA"]),
  note: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const body = await parseBody(req, clockInSchema);
  const today = todayStr();

  const active = await prisma.timeEntry.findFirst({
    where: { workerId: session.userId, status: "ACTIVE" },
  });
  if (active) throw new ApiError(409, "You are already clocked in — clock out first");

  let scheduleDayId: string | null = null;
  if (body.kind === "SCHEDULED") {
    const shift = await prisma.scheduleDay.findFirst({
      where: {
        date: today,
        hours: { gt: 0 },
        schedule: { workerId: session.userId, status: "APPROVED" },
      },
    });
    if (!shift) {
      throw new ApiError(
        400,
        "No approved shift is assigned to you today. Clock in as extra work instead.",
      );
    }
    scheduleDayId = shift.id;
  } else if (!body.note?.trim()) {
    throw new ApiError(400, "Add a short note about what you're working on");
  }

  const entry = await prisma.timeEntry.create({
    data: {
      workerId: session.userId,
      date: today,
      kind: body.kind,
      scheduleDayId,
      clockIn: new Date(),
      note: body.note?.trim() || null,
    },
  });
  return NextResponse.json({ entry }, { status: 201 });
});
