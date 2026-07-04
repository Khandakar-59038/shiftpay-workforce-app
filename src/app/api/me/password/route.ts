import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import { hashPassword, requireUser, verifyPassword } from "../../../../lib/auth";

const schema = z.object({
  current: z.string().min(1),
  next: z.string().min(8).max(200),
});

export const POST = handle(async (req) => {
  const session = await requireUser(req);
  const body = await parseBody(req, schema);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await verifyPassword(body.current, user.passwordHash))) {
    throw new ApiError(401, "Your current password is incorrect");
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(body.next) },
  });
  return NextResponse.json({ ok: true });
});
