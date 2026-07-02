import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { ApiError, handle } from "../../../../../lib/api";
import { requireUser } from "../../../../../lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const session = await requireUser(req);
  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      worker: { select: { id: true, name: true, email: true, hourlyRateCents: true } },
      payrollRun: true,
    },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  if (session.role === "WORKER" && payment.workerId !== session.userId) {
    throw new ApiError(403, "You can only view your own payslips");
  }

  return NextResponse.json({ payment });
});
