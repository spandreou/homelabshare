import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { UPLOAD_ROOT } from "../../../lib/storage";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
};

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function resolveContentType(fileName: string, dbType?: string | null) {
  if (dbType && dbType.trim().length > 0) {
    return dbType;
  }
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const share = await db.shareLink.findUnique({
    where: { id },
    include: {
      file: {
        select: {
          id: true,
          name: true,
          type: true,
          path: true,
        },
      },
    },
  });

  if (!share || !share.file || share.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Share link expired or not found." }, { status: 404 });
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const absolutePath = path.resolve(share.file.path);
  if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  const metadata = await stat(absolutePath).catch(() => null);
  if (!metadata || !metadata.isFile()) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  await db.$transaction([
    db.shareLink.update({
      where: { id: share.id },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
    }),
    db.file.update({
      where: { id: share.file.id },
      data: {
        lastAccessedAt: new Date(),
      },
    }),
  ]).catch(() => undefined);

  const stream = createReadStream(absolutePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": resolveContentType(share.file.name, share.file.type),
      "Content-Disposition": `attachment; filename="${path.basename(share.file.name)}"`,
      "Content-Length": String(metadata.size),
      "Cache-Control": "private, no-store",
    },
  });
}
