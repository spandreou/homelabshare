import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { UPLOAD_ROOT } from "../../../lib/storage";

function sanitizeFileNameForHeader(name: string) {
  return path.basename(name).replace(/["\r\n]+/g, "_");
}

function buildContentDisposition(fileName: string) {
  const raw = path.basename(fileName).trim() || "file";
  const asciiFallback = sanitizeFileNameForHeader(raw).replace(/[^\x20-\x7E]+/g, "_") || "file";
  const encoded = encodeURIComponent(raw);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const params = await context.params;

  const file = await db.file.findFirst({
    where: {
      id: params.id,
      userId: user.id,
    },
    select: {
      id: true,
      name: true,
      type: true,
      path: true,
    },
  });

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const normalizedFile = path.resolve(file.path);
  const isInUploadRoot =
    normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`);

  if (!isInUploadRoot) {
    return new NextResponse("Invalid file path", { status: 400 });
  }

  const metadata = await stat(normalizedFile).catch(() => null);
  if (!metadata || !metadata.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = createReadStream(normalizedFile);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  await db.file.update({
    where: { id: file.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => undefined);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      fileName: file.name,
    },
  }).catch(() => undefined);

  return new Response(webStream, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": buildContentDisposition(file.name),
      "Content-Length": String(metadata.size),
      "Cache-Control": "private, no-store",
    },
  });
}
