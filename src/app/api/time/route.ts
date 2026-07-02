import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { ApiError, handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { isValidDate } from "../../../lib/dates";
import { summarize } from "../../../lib/hours";
import { getSettings } from "../../../lib/settings";

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const requested = url.searchParams.get("workerId");

  if (!isValidDate(from) || !isValidDate(to) || to < from) {
    throw new ApiError(400, "from/to must be valid dates with from ≤ to");
  }

  let workerId = session.userId;
  if (requested && requested !== session.userId) {
    if (session.role === "WORKER") {
      throw new ApiError(403, "Workers can only view their own hours");
    }
    workerId = requested;
  }

  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { id: true, name: true, hourlyRateCents: true },
  });
  if (!worker) throw new ApiError(404, "Worker not found");

  const settings = await getSettings();
  const summary = await summarize(workerId, from, to, settings);

  return NextResponse.json({ worker, summary, settings: { weeklyHourLimit: settings.weeklyHourLimit } });
});
