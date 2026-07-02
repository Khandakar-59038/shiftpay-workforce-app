import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { handle } from "../../../lib/api";
import { requireRole } from "../../../lib/auth";

export const GET = handle(async (req) => {
  await requireRole(req, "MANAGER", "ADMIN");
  const runs = await prisma.payrollRun.findMany({
    include: {
      payments: {
        include: { worker: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ runs });
});
