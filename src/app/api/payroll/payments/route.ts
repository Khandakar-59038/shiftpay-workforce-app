import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { handle } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const requested = url.searchParams.get("workerId");

  const workerId =
    session.role === "WORKER" ? session.userId : (requested ?? undefined);

  const payments = await prisma.payment.findMany({
    where: workerId ? { workerId } : {},
    include: {
      payrollRun: { select: { frequency: true, createdAt: true } },
      worker: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ payments });
});
