import { NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../../../lib/db";
import { ApiError, handle } from "../../../../lib/api";
import { requireUser } from "../../../../lib/auth";
import { UPLOADS_DIR } from "../../../../lib/uploads";

type Ctx = { params: Promise<{ id: string }> };

async function findAuthorized(req: Request, id: string) {
  const session = await requireUser(req);
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, "Document not found");
  if (document.userId !== session.userId && session.role !== "ADMIN") {
    throw new ApiError(403, "This document is private");
  }
  return document;
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const document = await findAuthorized(req, id);

  const bytes = await readFile(path.join(UPLOADS_DIR, document.storedAs));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": document.mime,
      "content-disposition": `attachment; filename="${document.name.replaceAll('"', "")}"`,
      "content-length": String(document.size),
    },
  });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const document = await findAuthorized(req, id);

  await prisma.document.delete({ where: { id } });
  await unlink(path.join(UPLOADS_DIR, document.storedAs)).catch(() => {});
  return NextResponse.json({ ok: true });
});
