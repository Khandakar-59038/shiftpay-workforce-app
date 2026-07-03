import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { handle } from "../../../lib/api";
import { requireRole } from "../../../lib/auth";

export const GET = handle(async (req) => {
  await requireRole(req, "MANAGER", "ADMIN");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const entries = await prisma.timeEntry.findMany({
    where: status ? { status } : { status: { not: "ACTIVE" } },
    include: { worker: { select: { id: true, name: true, email: true } } },
    orderBy: { clockIn: "desc" },
    take: 100,
  });
  return NextResponse.json({ entries });
});
