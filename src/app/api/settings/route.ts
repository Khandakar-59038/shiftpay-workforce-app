import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { handle, parseBody } from "../../../lib/api";
import { requireRole, requireUser } from "../../../lib/auth";
import { getSettings } from "../../../lib/settings";

export const GET = handle(async (req) => {
  await requireUser(req);
  const settings = await getSettings();
  return NextResponse.json({ settings });
});

const patchSchema = z.object({
  weeklyHourLimit: z.number().min(1).max(80).optional(),
  overtimeMultiplier: z.number().min(1).max(5).optional(),
  overtimeAlertThreshold: z.number().min(0).max(80).optional(),
  paidLeaveDaysPerYear: z.number().int().min(0).max(365).optional(),
  sickLeaveDaysPerYear: z.number().int().min(0).max(365).optional(),
  standardDayHours: z.number().min(1).max(24).optional(),
  currencyCode: z.enum(["USD", "BDT", "EUR", "GBP", "INR"]).optional(),
  payFrequencyDefault: z.enum(["WEEKLY", "MONTHLY"]).optional(),
});

export const PATCH = handle(async (req) => {
  await requireRole(req, "ADMIN");
  const body = await parseBody(req, patchSchema);
  await getSettings(); // ensure the singleton row exists
  const settings = await prisma.companySettings.update({ where: { id: 1 }, data: body });
  return NextResponse.json({ settings });
});
