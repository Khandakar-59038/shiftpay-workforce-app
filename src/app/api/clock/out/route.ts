import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { requireRole } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/dates";
import { notifyManagers } from "../../../../lib/notify";

const clockOutSchema = z.object({
  note: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const body = await parseBody(req, clockOutSchema);

  const active = await prisma.timeEntry.findFirst({
    where: { workerId: session.userId, status: "ACTIVE" },
  });
  if (!active) throw new ApiError(409, "You are not clocked in");

  const clockOut = new Date();
  const rawHours = (clockOut.getTime() - active.clockIn.getTime()) / 3_600_000;
  // Quarter-hour steps, minimum one quarter, capped at a day.
  const hours = Math.min(24, Math.max(0.25, Math.round(rawHours * 4) / 4));
  const note = body.note?.trim() || active.note;

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.timeEntry.update({
      where: { id: active.id },
      data: { clockOut, hours, note, status: "PENDING" },
    });
    await notifyManagers(tx, {
      type: "TIMESHEET_SUBMITTED",
      title: "Shift awaiting approval",
      body: `${session.name} clocked ${hours}h on ${formatDate(updated.date)} (${
        updated.kind === "SCHEDULED" ? "assigned shift" : "extra work"
      })${note ? `: “${note}”` : ""}.`,
      href: "/approvals",
    });
    return updated;
  });

  return NextResponse.json({ entry });
});
