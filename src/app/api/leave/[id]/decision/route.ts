import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../../lib/api";
import { requireRole } from "../../../../../lib/auth";
import { formatDate } from "../../../../../lib/dates";
import { leaveDaysInRange } from "../../../../../lib/leave";
import { getLeaveBalance } from "../../../../../lib/leave-db";
import { notify } from "../../../../../lib/notify";

const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const session = await requireRole(req, "MANAGER", "ADMIN");
  const { id } = await params;
  const { action, note } = await parseBody(req, decisionSchema);

  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) throw new ApiError(404, "Leave request not found");
  if (leave.status !== "PENDING") {
    throw new ApiError(409, `This request was already ${leave.status.toLowerCase()}`);
  }

  if (action === "APPROVE" && leave.type === "PAID") {
    const balance = await getLeaveBalance(leave.workerId, leave.startDate);
    const days = leaveDaysInRange(leave.startDate, leave.endDate);
    if (days > balance.remaining) {
      throw new ApiError(
        409,
        `Cannot approve: worker has ${balance.remaining} paid day(s) left, request needs ${days}.`,
      );
    }
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const range = `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id },
      data: {
        status,
        decidedById: session.userId,
        decidedAt: new Date(),
        managerNote: note ?? null,
      },
    });
    await notify(tx, leave.workerId, {
      type: `LEAVE_${status}`,
      title: `Leave ${status.toLowerCase()}`,
      body:
        status === "APPROVED"
          ? `Your ${leave.type.toLowerCase()} leave (${range}) was approved by ${session.name}.`
          : `Your ${leave.type.toLowerCase()} leave (${range}) was rejected${note ? `: “${note}”` : ""}.`,
      href: "/leave",
    });
  });

  return NextResponse.json({ ok: true, status });
});
