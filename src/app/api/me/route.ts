import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { ApiError, handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const [user, unreadCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hourlyRateCents: true,
        isActive: true,
      },
    }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
  ]);
  if (!user || !user.isActive) throw new ApiError(401, "Account unavailable");
  return NextResponse.json({ user, unreadCount });
});
