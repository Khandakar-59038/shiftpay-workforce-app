import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { handle } from "../../../lib/api";
import { requireRole } from "../../../lib/auth";
import { todayStr } from "../../../lib/dates";

export const GET = handle(async (req) => {
  const session = await requireRole(req, "WORKER");
  const today = todayStr();

  const [active, entries, todayShift] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { workerId: session.userId, status: "ACTIVE" },
    }),
    prisma.timeEntry.findMany({
      where: { workerId: session.userId, date: today },
      orderBy: { clockIn: "asc" },
    }),
    prisma.scheduleDay.findFirst({
      where: {
        date: today,
        hours: { gt: 0 },
        schedule: { workerId: session.userId, status: "APPROVED" },
      },
    }),
  ]);

  return NextResponse.json({
    active,
    today: entries,
    todayShift: todayShift ? { id: todayShift.id, hours: todayShift.hours } : null,
  });
});
