import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
  ]);
  return NextResponse.json({ notifications, unreadCount });
});
