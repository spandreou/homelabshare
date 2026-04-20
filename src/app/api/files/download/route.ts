import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { UPLOAD_ROOT } from "../../../../lib/storage";

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
const MAX_DOWNLOAD_REQUESTS_PER_WINDOW = 240;
const DOWNLOAD_RATE_BUCKETS = new Map<string, number[]>();

function resolveContentType(fileName: string) {
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
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

function takeDownloadRateLimitSlot(userId: string) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = DOWNLOAD_RATE_BUCKETS.get(userId) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= MAX_DOWNLOAD_REQUESTS_PER_WINDOW) {
    DOWNLOAD_RATE_BUCKETS.set(userId, recent);
    return false;
  }

  recent.push(now);
  DOWNLOAD_RATE_BUCKETS.set(userId, recent);
  return true;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!takeDownloadRateLimitSlot(user.id)) {
    return NextResponse.json({ error: "Too many download requests. Please retry shortly." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const relativePath = normalizeRelativePath(searchParams.get("path") ?? "");
  const preview = searchParams.get("preview") === "1";
  const thumbnail = searchParams.get("thumbnail") === "1";
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const absoluteFilePath = path.resolve(path.join(UPLOAD_ROOT, relativePath));
  if (!isPathInsideRoot(absoluteFilePath, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const metadata = await stat(absoluteFilePath).catch(() => null);
  if (!metadata || !metadata.isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileRecord = await db.file.findFirst({
    where: {
      path: absoluteFilePath,
      userId: user.id,
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });
  if (!fileRecord) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileName = sanitizeFileNameForHeader(fileRecord.name);
  const contentType = fileRecord.type?.trim() ? fileRecord.type : resolveContentType(fileName);
  const stream = createReadStream(absoluteFilePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  const shouldTrackAccess = !(preview && thumbnail);
  if (shouldTrackAccess) {
    const touched = await db.file.update({
      where: { id: fileRecord.id },
      data: {
        lastAccessedAt: new Date(),
      },
    }).catch(() => undefined);
    if (touched) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.DOWNLOAD,
          fileName,
        },
      }).catch(() => undefined);
    }
  }

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": buildContentDisposition(fileName, preview),
      "Content-Length": String(metadata.size),
      "Cache-Control": "private, no-store",
    },
  });
}
