import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuditAction, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { UPLOAD_ROOT } from "../../../../lib/storage";

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ADMIN_GLOBAL_FOLDER = "admin_global";

function toBigInt(value: number) {
  return BigInt(Math.trunc(value));
}

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const selected = formData.get("file");

  if (!(selected instanceof File) || selected.size <= 0) {
    return NextResponse.json({ error: "Please choose a file to upload." }, { status: 400 });
  }

  if (selected.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Max file size is 150MB." }, { status: 400 });
  }

  const incomingSize = toBigInt(selected.size);
  if (user.storageUsed + incomingSize > user.storageLimit) {
    return NextResponse.json({ error: "Not enough storage space for this file." }, { status: 400 });
  }

  const safeOriginalName = path.basename(selected.name).replace(/[^\w.\- ]+/g, "_");
  const ownerFolder = user.role === UserRole.ADMIN ? ADMIN_GLOBAL_FOLDER : user.id;
  const ownerDirectory = path.resolve(path.join(UPLOAD_ROOT, normalizeRelativePath(ownerFolder)));
  const normalizedRoot = path.resolve(UPLOAD_ROOT);

  if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  await mkdir(ownerDirectory, { recursive: true });

  const uniqueName = `${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  const destination = path.resolve(path.join(ownerDirectory, uniqueName));
  if (!isPathInsideRoot(destination, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const arrayBuffer = await selected.arrayBuffer();
  await writeFile(destination, Buffer.from(arrayBuffer));

  const extensionType = path.extname(safeOriginalName).replace(".", "").toLowerCase();

  try {
    await db.$transaction([
      db.file.create({
        data: {
          name: safeOriginalName,
          size: incomingSize,
          type: selected.type || extensionType || "file",
          path: destination,
          userId: user.id,
        },
      }),
      db.user.update({
        where: { id: user.id },
        data: {
          storageUsed: {
            increment: incomingSize,
          },
        },
      }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.UPLOAD,
          fileName: safeOriginalName,
        },
      }),
    ]);
  } catch {
    await unlink(destination).catch(() => undefined);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: `Uploaded ${safeOriginalName}` }, { status: 200 });
}
