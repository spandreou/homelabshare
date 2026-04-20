import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { UPLOAD_ROOT } from "../../../../lib/storage";

const MAX_ZIP_SELECTION = 200;
const MAX_ZIP_TOTAL_BYTES = 1024 * 1024 * 1024;

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
}

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const encoded = searchParams.get("paths") ?? "";
  if (!encoded) {
    return NextResponse.json({ error: "Missing file selection." }, { status: 400 });
  }

  let rawPaths: string[] = [];
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      rawPaths = parsed.map((item) => String(item));
    }
  } catch {
    return NextResponse.json({ error: "Invalid file selection." }, { status: 400 });
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const accessibleDbPaths = new Set(
    (
      await db.file.findMany({
        where: { userId: user.id },
        select: {
          path: true,
        },
      })
    )
      .map((row) => path.resolve(row.path))
      .filter((candidate) => isPathInsideRoot(candidate, normalizedRoot)),
  );
  const allowed: Array<{ absolutePath: string; name: string }> = [];
  let totalBytes = 0;

  for (const rawPath of rawPaths) {
    if (allowed.length >= MAX_ZIP_SELECTION) {
      break;
    }

    const relativePath = normalizeRelativePath(rawPath);
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.resolve(path.join(UPLOAD_ROOT, relativePath));
    if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
      continue;
    }
    if (!accessibleDbPaths.has(absolutePath)) {
      continue;
    }

    const metadata = await stat(absolutePath).catch(() => null);
    if (!metadata || !metadata.isFile()) {
      continue;
    }
    if (totalBytes + metadata.size > MAX_ZIP_TOTAL_BYTES) {
      continue;
    }

    allowed.push({
      absolutePath,
      name: path.basename(relativePath),
    });
    totalBytes += metadata.size;
  }

  if (allowed.length === 0) {
    return NextResponse.json({ error: "No accessible files selected." }, { status: 400 });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  for (const file of allowed) {
    archive.file(file.absolutePath, { name: file.name });
  }

  const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
  queueMicrotask(() => {
    void archive.finalize();
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      fileName: `[ZIP] ${allowed.length} files`,
    },
  }).catch(() => undefined);

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="homelabshare-files-${Date.now()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
