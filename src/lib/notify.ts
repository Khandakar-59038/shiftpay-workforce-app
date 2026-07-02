import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { addDays, isoWeekKey, mondayOf } from "./dates";
import { summarize } from "./hours";
import { getSettings } from "./settings";

type Db = Prisma.TransactionClient | PrismaClient;

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  href?: string;
}

export function notify(db: Db, userId: string, input: NotificationInput) {
  return db.notification.create({ data: { userId, ...input } });
}

/** Notify every active manager (SRS 2.2.5). */
export async function notifyManagers(db: Db, input: NotificationInput) {
  const managers = await db.user.findMany({
    where: { role: "MANAGER", isActive: true },
    select: { id: true },
  });
  if (managers.length === 0) return;
  await db.notification.createMany({
    data: managers.map((m) => ({ userId: m.id, ...input })),
  });
}

/**
 * After a worker's hours change (schedule approval or adjustment), alert
 * managers if that ISO week's overtime has reached the configured threshold.
 * Deduplicated per worker-week via the notification href.
 */
export async function maybeOvertimeAlert(workerId: string, dateInWeek: string) {
  const settings = await getSettings();
  if (settings.overtimeAlertThreshold <= 0) return;

  const monday = mondayOf(dateInWeek);
  const summary = await summarize(workerId, monday, addDays(monday, 6), settings);
  if (summary.overtimeHours < settings.overtimeAlertThreshold) return;

  const week = isoWeekKey(monday);
  const href = `/team-time?workerId=${workerId}&week=${week}`;
  const existing = await prisma.notification.findFirst({
    where: { type: "OVERTIME_ALERT", href },
  });
  if (existing) return;

  const worker = await prisma.user.findUnique({ where: { id: workerId } });
  await notifyManagers(prisma, {
    type: "OVERTIME_ALERT",
    title: "Overtime alert",
    body: `${worker?.name ?? "A worker"} has ${summary.overtimeHours}h of overtime in week ${week}.`,
    href,
  });
}
