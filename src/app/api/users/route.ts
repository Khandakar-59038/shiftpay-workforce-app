import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { hashPassword, requireRole } from "../../../lib/auth";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  hourlyRateCents: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const;

export const GET = handle(async (req) => {
  // Managers need the worker roster for time tracking and payroll.
  await requireRole(req, "MANAGER", "ADMIN");
  const users = await prisma.user.findMany({
    select: PUBLIC_FIELDS,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ users });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(200),
  role: z.enum(["WORKER", "MANAGER", "ADMIN"]),
  hourlyRateCents: z.number().int().min(0).max(100_000_000),
  phone: z.string().max(30).optional(),
});

export const POST = handle(async (req) => {
  await requireRole(req, "ADMIN");
  const body = await parseBody(req, createSchema);
  const email = body.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "A user with this email already exists");

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      hourlyRateCents: body.hourlyRateCents,
      phone: body.phone?.trim() || null,
    },
    select: PUBLIC_FIELDS,
  });
  return NextResponse.json({ user }, { status: 201 });
});
