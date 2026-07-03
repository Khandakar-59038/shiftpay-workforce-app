import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";
import { ApiError, handle, parseBody } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";

const sendSchema = z.object({
  body: z.string().max(2000),
  recipientId: z.string().optional(),
});

export const POST = handle(async (req) => {
  const session = await requireUser(req);
  const input = await parseBody(req, sendSchema);
  const body = input.body.trim();
  if (!body) throw new ApiError(400, "Message cannot be empty");

  if (input.recipientId) {
    const recipient = await prisma.user.findUnique({ where: { id: input.recipientId } });
    if (!recipient || !recipient.isActive) throw new ApiError(404, "Recipient not found");
  }

  const message = await prisma.message.create({
    data: {
      senderId: session.userId,
      recipientId: input.recipientId ?? null,
      body,
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
  return NextResponse.json({ message }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const withParam = url.searchParams.get("with") ?? "company";

  if (withParam === "company") {
    const messages = await prisma.message.findMany({
      where: { recipientId: null },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ messages });
  }

  // Direct thread between me and the other person; opening it marks
  // their messages to me as read.
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: session.userId, recipientId: withParam },
        { senderId: withParam, recipientId: session.userId },
      ],
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  await prisma.message.updateMany({
    where: { senderId: withParam, recipientId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ messages });
});
