import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireRole, requireUser } from "../../../lib/auth";
import { addDays, formatDate, isValidDate, mondayOf, todayStr } from "../../../lib/dates";
import { summarize } from "../../../lib/hours";
import { formatHours } from "../../../lib/money";
import { notifyManagers } from "../../../lib/notify";
import { getSettings } from "../../../lib/settings";

const lockSchema = z.object({
  weekStart: z.string(),
  note: z.string().max(300).optional(),
});

export const POST = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const body = await parseBody(req, lockSchema);

  if (!isValidDate(body.weekStart) || mondayOf(body.weekStart) !== body.weekStart) {
    throw new ApiError(400, "weekStart must be a Monday (YYYY-MM-DD)");
  }
  if (body.weekStart > mondayOf(todayStr())) {
    throw new ApiError(400, "You can only lock the current or past weeks");
  }

  const existing = await prisma.weekLock.findUnique({
    where: { workerId_weekStart: { workerId: session.userId, weekStart: body.weekStart } },
  });
  if (existing) throw new ApiError(409, "This week is already locked");

  const settings = await getSettings();
  const summary = await summarize(
    session.userId,
    body.weekStart,
    addDays(body.weekStart, 6),
    settings,
  );

  const lock = await prisma.$transaction(async (tx) => {
    const created = await tx.weekLock.create({
      data: { workerId: session.userId, weekStart: body.weekStart, note: body.note?.trim() || null },
    });
    await notifyManagers(tx, {
      type: "WEEK_LOCKED",
      title: "Weekly hours locked in",
      body: `${session.name} confirmed ${formatHours(summary.totalHours)} for the week of ${formatDate(body.weekStart)}${summary.overtimeHours > 0 ? ` (incl. ${formatHours(summary.overtimeHours)} overtime)` : ""}.`,
      href: `/team-time?workerId=${session.userId}`,
    });
    return created;
  });

  return NextResponse.json({ lock, summary: { totalHours: summary.totalHours } }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const requested = url.searchParams.get("workerId");
  const workerId =
    session.role === "WORKER" ? session.userId : (requested ?? undefined);

  const locks = await prisma.weekLock.findMany({
    where: workerId ? { workerId } : {},
    orderBy: { weekStart: "desc" },
    take: 100,
  });
  return NextResponse.json({ locks });
});
