import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../../lib/api";
import { requireRole } from "../../../../../lib/auth";
import { formatDate } from "../../../../../lib/dates";
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

  const entry = await prisma.timeEntry.findUnique({ where: { id } });
  if (!entry) throw new ApiError(404, "Time entry not found");
  if (entry.status !== "PENDING") {
    throw new ApiError(409, `This entry was already ${entry.status.toLowerCase()}`);
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.update({
      where: { id },
      data: { status, decidedById: session.userId, decidedAt: new Date(), managerNote: note ?? null },
    });
    await notify(tx, entry.workerId, {
      type: `TIMESHEET_${status}`,
      title: `Shift ${status.toLowerCase()}`,
      body:
        status === "APPROVED"
          ? `Your ${entry.hours}h shift on ${formatDate(entry.date)} was approved by ${session.name} and counts toward your pay.`
          : `Your ${entry.hours}h shift on ${formatDate(entry.date)} was rejected${note ? `: “${note}”` : ""}.`,
      href: "/time",
    });
  });

  if (status === "APPROVED") {
    await maybeOvertimeAlert(entry.workerId, entry.date);
  }

  return NextResponse.json({ ok: true, status });
});
