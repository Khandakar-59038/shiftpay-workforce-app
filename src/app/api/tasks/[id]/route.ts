import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";
import { notify } from "../../../../lib/notify";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["OPEN", "DONE"]),
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const session = await requireUser(req);
  const { id } = await params;
  const { status } = await parseBody(req, patchSchema);

  const task = await prisma.task.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true } } },
  });
  if (!task) throw new ApiError(404, "Task not found");
  const isPrivileged = session.role !== "WORKER";
  if (!isPrivileged && task.assigneeId !== session.userId) {
    throw new ApiError(403, "Not your task");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.task.update({
      where: { id },
      data: { status, doneAt: status === "DONE" ? new Date() : null },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (status === "DONE" && task.createdById !== session.userId) {
      await notify(tx, task.createdById, {
        type: "TASK_COMPLETED",
        title: "Quick task completed",
        body: `${session.name} completed “${task.title}”.`,
        href: "/tasks",
      });
    }
    return result;
  });

  return NextResponse.json({ task: updated });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const session = await requireUser(req);
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new ApiError(404, "Task not found");
  const isPrivileged = session.role !== "WORKER";
  if (!isPrivileged && task.createdById !== session.userId) {
    throw new ApiError(403, "Only the creator or a manager can delete this task");
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
