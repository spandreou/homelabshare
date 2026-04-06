import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { UPLOAD_ROOT } from "../../../lib/storage";

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
      name: true,
      type: true,
      path: true,
    },
  });

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const safeFileName = path.basename(file.path);
  const normalizedFile = path.resolve(path.join(UPLOAD_ROOT, safeFileName));
  const isInUploadRoot =
    normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`);

  if (!isInUploadRoot) {
    return new NextResponse("Invalid file path", { status: 400 });
  }

  const content = await readFile(normalizedFile);

  return new NextResponse(content, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
