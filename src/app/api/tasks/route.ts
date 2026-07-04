import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { isValidDate } from "../../../lib/dates";
import { notify } from "../../../lib/notify";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  details: z.string().max(1000).optional(),
  assigneeId: z.string().min(1),
  dueDate: z.string().optional(),
});

export const POST = handle(async (req) => {
  const session = await requireUser(req);
  const body = await parseBody(req, createSchema);

  // Workers can only create personal tasks; managers/admins assign to anyone.
  if (session.role === "WORKER" && body.assigneeId !== session.userId) {
    throw new ApiError(403, "You can only add tasks for yourself");
  }
  if (body.dueDate && !isValidDate(body.dueDate)) {
    throw new ApiError(400, "dueDate must be YYYY-MM-DD");
  }
  const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
  if (!assignee || !assignee.isActive) throw new ApiError(404, "Assignee not found");

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: body.title.trim(),
        details: body.details?.trim() || null,
        assigneeId: body.assigneeId,
        createdById: session.userId,
        dueDate: body.dueDate ?? null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (body.assigneeId !== session.userId) {
      await notify(tx, body.assigneeId, {
        type: "TASK_ASSIGNED",
        title: "New quick task",
        body: `${session.name} assigned you: “${created.title}”${created.dueDate ? ` (due ${created.dueDate})` : ""}.`,
        href: "/tasks",
      });
    }
    return created;
  });

  return NextResponse.json({ task }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const requested = url.searchParams.get("assigneeId");

  const assigneeId =
    session.role === "WORKER" ? session.userId : (requested ?? undefined);

  const tasks = await prisma.task.findMany({
    where: assigneeId ? { assigneeId } : {},
    include: { assignee: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ tasks });
});
