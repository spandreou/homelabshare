import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { UPLOAD_ROOT } from "../../../../lib/storage";

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
  const allowed: Array<{ absolutePath: string; name: string }> = [];

  for (const rawPath of rawPaths) {
    const relativePath = normalizeRelativePath(rawPath);
    if (!relativePath) {
      continue;
    }

    const ownerFolder = relativePath.split("/")[0];
    if (user.role !== "ADMIN" && ownerFolder !== user.id) {
      continue;
    }

    const absolutePath = path.resolve(path.join(UPLOAD_ROOT, relativePath));
    if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
      continue;
    }

    const metadata = await stat(absolutePath).catch(() => null);
    if (!metadata || !metadata.isFile()) {
      continue;
    }

    allowed.push({
      absolutePath,
      name: path.basename(relativePath),
    });
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

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="homelabshare-files-${Date.now()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
