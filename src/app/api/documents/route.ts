import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/db";
import { ApiError, handle } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, UPLOADS_DIR } from "../../../lib/uploads";

export const POST = handle(async (req) => {
  const session = await requireUser(req);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "Expected a multipart form upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Attach a file under the 'file' field");
  if (file.size === 0) throw new ApiError(400, "The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, "Files can be at most 10 MB");
  }
  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    throw new ApiError(400, "Allowed types: PDF, PNG, JPG, WEBP, DOC/DOCX, TXT");
  }

  const storedAs = `${randomUUID()}${ext}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storedAs), Buffer.from(await file.arrayBuffer()));

  const document = await prisma.document.create({
    data: {
      userId: session.userId,
      name: file.name.slice(0, 200) || "document",
      mime: file.type,
      size: file.size,
      storedAs,
    },
  });
  return NextResponse.json({ document }, { status: 201 });
});

export const GET = handle(async (req) => {
  const session = await requireUser(req);
  const url = new URL(req.url);
  const requested = url.searchParams.get("userId");

  // Admins may review any user's documents; everyone else sees their own.
  const userId =
    session.role === "ADMIN" && requested ? requested : session.userId;

  const documents = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
});
