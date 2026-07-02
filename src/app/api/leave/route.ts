import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireRole, requireUser } from "../../../lib/auth";
import { formatDate, isValidDate, todayStr } from "../../../lib/dates";
import { validateLeaveRequest } from "../../../lib/leave";
import { getLeaveBalance } from "../../../lib/leave-db";
import { notifyManagers } from "../../../lib/notify";

const requestSchema = z.object({
  type: z.enum(["PAID", "UNPAID"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(1).max(500),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const body = await parseBody(req, requestSchema);

  if (!isValidDate(body.startDate) || !isValidDate(body.endDate)) {
    throw new ApiError(400, "Dates must be valid YYYY-MM-DD strings");
  }

  const existing = await prisma.leaveRequest.findMany({
    where: { workerId: session.userId, status: { in: ["PENDING", "APPROVED"] } },
  });
  const balance = await getLeaveBalance(session.userId, body.startDate);

  const validation = validateLeaveRequest({
    type: body.type,
    startDate: body.startDate,
    endDate: body.endDate,
    existing,
    balance: balance.remaining,
  });
  if (!validation.ok) throw new ApiError(400, validation.error);

  const leave = await prisma.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        workerId: session.userId,
        type: body.type,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
      },
    });
    await notifyManagers(tx, {
      type: "LEAVE_REQUESTED",
      title: "Leave request awaiting approval",
      body: `${session.name} requested ${validation.days} day(s) of ${body.type.toLowerCase()} leave (${formatDate(body.startDate)} – ${formatDate(body.endDate)}).`,
      href: "/leave-approvals",
    });
    return created;
  });

  return NextResponse.json({ leave }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const workerId =
    session.role === "WORKER"
      ? session.userId
      : (url.searchParams.get("workerId") ?? undefined);

  const leaves = await prisma.leaveRequest.findMany({
    where: workerId ? { workerId } : {},
    include: { worker: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const balance = workerId ? await getLeaveBalance(workerId, todayStr()) : null;

  return NextResponse.json({ leaves, balance });
});
