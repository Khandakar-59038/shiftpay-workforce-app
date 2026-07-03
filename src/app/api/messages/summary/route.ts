import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { handle } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";

export const GET = handle(async (req) => {
  const session = await requireUser(req);

  const [people, unreadGroups] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, id: { not: session.userId } },
      select: { id: true, name: true, role: true, email: true, phone: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.message.groupBy({
      by: ["senderId"],
      where: { recipientId: session.userId, readAt: null },
      _count: { _all: true },
    }),
  ]);

  const unread: Record<string, number> = {};
  let totalUnread = 0;
  for (const group of unreadGroups) {
    unread[group.senderId] = group._count._all;
    totalUnread += group._count._all;
  }

  return NextResponse.json({ people, unread, totalUnread });
});
