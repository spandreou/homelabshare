import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const relativePath = normalizeRelativePath(searchParams.get("path") ?? "");
  const preview = searchParams.get("preview") === "1";
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const ownerFolder = relativePath.split("/")[0];
  if (user.role !== "ADMIN" && ownerFolder !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const fileName = path.basename(absoluteFilePath);
  const contentType = resolveContentType(fileName);
  const stream = createReadStream(absoluteFilePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
      "Content-Length": String(metadata.size),
      "Cache-Control": "private, no-store",
    },
  });
}
