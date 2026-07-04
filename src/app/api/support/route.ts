import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { notify } from "../../../lib/notify";

const schema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(2000),
});

/**
 * Support requests land with every admin as a direct message (so the
 * conversation continues in Chat) plus a notification.
 */
export const POST = handle(async (req) => {
  const session = await requireUser(req);
  const { subject, body } = await parseBody(req, schema);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, id: { not: session.userId } },
    select: { id: true },
  });
  if (admins.length === 0) throw new ApiError(503, "No admin is available right now");

  await prisma.$transaction(async (tx) => {
    for (const admin of admins) {
      await tx.message.create({
        data: {
          senderId: session.userId,
          recipientId: admin.id,
          body: `[Support] ${subject}\n\n${body}`,
        },
      });
      await notify(tx, admin.id, {
        type: "SUPPORT_REQUEST",
        title: "Support request",
        body: `${session.name}: ${subject}`,
        href: "/chat",
      });
    }
  });

  return NextResponse.json({ ok: true, admins: admins.length }, { status: 201 });
});
