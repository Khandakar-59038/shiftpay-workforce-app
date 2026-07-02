import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { ApiError, handle, parseBody } from "../../../../lib/api";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionToken,
  verifyPassword,
} from "../../../../lib/auth";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = handle(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  }

  const token = await sessionToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
