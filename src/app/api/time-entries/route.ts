import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  // Workers see their own entries; managers/admins see everyone's.
  const workerScope =
    session.role === "WORKER" ? { workerId: session.userId } : {};

  const entries = await prisma.timeEntry.findMany({
    where: {
      ...workerScope,
      ...(status ? { status } : { status: { not: "ACTIVE" } }),
    },
    include: { worker: { select: { id: true, name: true, email: true } } },
    orderBy: { clockIn: "desc" },
    take: 100,
  });
  return NextResponse.json({ entries });
});
