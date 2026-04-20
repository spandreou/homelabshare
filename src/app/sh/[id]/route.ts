import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AuditAction } from "@prisma/client";
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
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_SHARE_ACCESS_PER_WINDOW = 120;
const SHARE_ACCESS_BUCKETS = new Map<string, number[]>();

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function sanitizeFileNameForHeader(name: string) {
  return path.basename(name).replace(/["\r\n]+/g, "_");
}

function buildContentDisposition(fileName: string, inline: boolean) {
  const raw = path.basename(fileName).trim() || "file";
  const asciiFallback = sanitizeFileNameForHeader(raw).replace(/[^\x20-\x7E]+/g, "_") || "file";
  const encoded = encodeURIComponent(raw);
  return `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function takeShareRateLimitSlot(key: string) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = SHARE_ACCESS_BUCKETS.get(key) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= MAX_SHARE_ACCESS_PER_WINDOW) {
    SHARE_ACCESS_BUCKETS.set(key, recent);
    return false;
  }

  recent.push(now);
  SHARE_ACCESS_BUCKETS.set(key, recent);
  return true;
}

function resolveContentType(fileName: string, dbType?: string | null) {
  if (dbType && dbType.trim().length > 0) {
    return dbType;
  }
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const forceDownload = searchParams.get("download") === "1";
  const preview = searchParams.get("preview") === "1" || !forceDownload;
  const forwardedFor = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  const rateBucketKey = `${clientIp}:${id}`;
  if (!takeShareRateLimitSlot(rateBucketKey)) {
    return NextResponse.json({ error: "Too many share link requests. Please retry shortly." }, { status: 429 });
  }

  const share = await db.shareLink.findUnique({
    where: { id },
    include: {
      file: {
        select: {
          id: true,
          name: true,
          type: true,
          path: true,
          userId: true,
        },
      },
    },
  });

  if (!share || !share.file) {
    return NextResponse.json({ error: "Share link expired or not found." }, { status: 404 });
  }

  if (share.expiresAt.getTime() <= Date.now()) {
    await db.shareLink.delete({
      where: { id: share.id },
    }).catch(() => undefined);
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
    db.auditLog.create({
      data: {
        userId: share.file.userId,
        action: AuditAction.SHARE,
        fileName: `[SHARE-ACCESS] ${share.file.name}`,
      },
    }),
  ]).catch(() => undefined);

  const stream = createReadStream(absolutePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": resolveContentType(share.file.name, share.file.type),
      "Content-Disposition": buildContentDisposition(share.file.name, preview),
      "Content-Length": String(metadata.size),
      "Cache-Control": "private, no-store",
    },
  });
}
