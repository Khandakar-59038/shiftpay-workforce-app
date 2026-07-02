import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { handle, parseBody } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";

const readSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  const session = await requireUser(req);
  const body = await parseBody(req, readSchema);

  await prisma.notification.updateMany({
    where: {
      userId: session.userId,
      readAt: null,
      ...(body.all ? {} : { id: { in: body.ids ?? [] } }),
    },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
});
