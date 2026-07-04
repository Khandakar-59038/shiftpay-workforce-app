import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";

const ME_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  hourlyRateCents: true,
  phone: true,
  address: true,
  emergencyContact: true,
  isActive: true,
  createdAt: true,
} as const;

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const [user, unreadCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: ME_FIELDS }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
  ]);
  if (!user || !user.isActive) throw new ApiError(401, "Account unavailable");
  return NextResponse.json({ user, unreadCount });
});

const patchSchema = z.object({
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  emergencyContact: z.string().max(200).optional(),
});

/** Self-service personal information (name/email/rate stay admin-managed). */
export const PATCH = handle(async (req) => {
  const session = await requireUser(req);
  const body = await parseBody(req, patchSchema);

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() || null } : {}),
      ...(body.emergencyContact !== undefined
        ? { emergencyContact: body.emergencyContact.trim() || null }
        : {}),
    },
    select: ME_FIELDS,
  });
  return NextResponse.json({ user });
});
