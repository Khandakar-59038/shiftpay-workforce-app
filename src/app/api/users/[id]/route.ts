import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { hashPassword, requireRole } from "../../../../lib/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["WORKER", "MANAGER", "ADMIN"]).optional(),
  hourlyRateCents: z.number().int().min(0).max(100_000_000).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).max(200).optional(),
  phone: z.string().max(30).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const session = await requireRole(req, "ADMIN");
  const { id } = await params;
  const body = await parseBody(req, patchSchema);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "User not found");
  if (body.isActive === false && id === session.userId) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.hourlyRateCents !== undefined
        ? { hourlyRateCents: body.hourlyRateCents }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.newPassword ? { passwordHash: await hashPassword(body.newPassword) } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      hourlyRateCents: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ user: updated });
});
