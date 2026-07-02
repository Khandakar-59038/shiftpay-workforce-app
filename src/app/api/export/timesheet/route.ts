import { prisma } from "../../../../lib/db";
import { ApiError, handle } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";
import { isValidDate } from "../../../../lib/dates";
import { workedHoursByDate } from "../../../../lib/hours";
import { csvResponse } from "../../../../lib/csv";

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
      throw new ApiError(403, "Workers can only export their own timesheet");
    }
    workerId = requested;
  }

  const worker = await prisma.user.findUnique({ where: { id: workerId } });
  if (!worker) throw new ApiError(404, "Worker not found");

  const byDate = await workedHoursByDate(workerId, from, to);
  const rows: (string | number)[][] = [
    ["Worker", worker.name],
    ["Period", `${from} to ${to}`],
    [],
    ["Date", "Scheduled hours", "Adjustment", "Worked hours", "Leave"],
    ...byDate
      .filter((d) => d.scheduled > 0 || d.worked > 0 || d.adjustment !== 0 || d.onLeave)
      .map((d) => [d.date, d.scheduled, d.adjustment, d.worked, d.onLeave ?? ""]),
  ];

  const safeName = worker.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return csvResponse(`timesheet-${safeName}-${from}-to-${to}.csv`, rows);
});
