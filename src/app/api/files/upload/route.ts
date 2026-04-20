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
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_UPLOAD_REQUESTS_PER_WINDOW = 60;
const UPLOAD_RATE_BUCKETS = new Map<string, number[]>();

function toBigInt(value: number) {
  return BigInt(Math.trunc(value));
}

async function incrementStorageUsedWithinLimit(
  tx: Pick<typeof db, "$executeRaw">,
  userId: string,
  amount: bigint,
) {
  const updatedRows = await tx.$executeRaw`
    UPDATE "User"
    SET "storageUsed" = "storageUsed" + ${amount}::bigint
    WHERE id = ${userId}
      AND "storageUsed" + ${amount}::bigint <= "storageLimit"
  `;

  return Number(updatedRows) > 0;
}

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
}

function sanitizeFileNameForStorage(raw: string) {
  return path
    .basename(raw)
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function takeUploadRateLimitSlot(userId: string) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = UPLOAD_RATE_BUCKETS.get(userId) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= MAX_UPLOAD_REQUESTS_PER_WINDOW) {
    UPLOAD_RATE_BUCKETS.set(userId, recent);
    return false;
  }

  recent.push(now);
  UPLOAD_RATE_BUCKETS.set(userId, recent);
  return true;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!takeUploadRateLimitSlot(user.id)) {
    return NextResponse.json({ error: "Too many upload requests. Please retry shortly." }, { status: 429 });
  }

  const contentLengthRaw = request.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN;
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large. Max upload size is 150MB." }, { status: 413 });
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

  const explicitOriginalName = String(formData.get("originalName") ?? "").trim();
  const originalName = path.basename(explicitOriginalName || selected.name).trim() || `upload-${Date.now()}`;
  const storageSafeName = sanitizeFileNameForStorage(originalName) || `upload-${Date.now()}`;
  const ownerFolder = user.role === UserRole.ADMIN ? ADMIN_GLOBAL_FOLDER : user.id;
  const ownerDirectory = path.resolve(path.join(UPLOAD_ROOT, normalizeRelativePath(ownerFolder)));
  const normalizedRoot = path.resolve(UPLOAD_ROOT);

  if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  await mkdir(ownerDirectory, { recursive: true });

  const uniqueName = `${Date.now()}-${randomUUID()}-${storageSafeName}`;
  const destination = path.resolve(path.join(ownerDirectory, uniqueName));
  if (!isPathInsideRoot(destination, normalizedRoot)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const arrayBuffer = await selected.arrayBuffer();
  await writeFile(destination, Buffer.from(arrayBuffer));

  const extensionType = path.extname(originalName).replace(".", "").toLowerCase();

  try {
    const saved = await db.$transaction(async (tx) => {
      const canStore = await incrementStorageUsedWithinLimit(tx, user.id, incomingSize);
      if (!canStore) {
        return false;
      }

      await tx.file.create({
        data: {
          name: originalName,
          size: incomingSize,
          type: selected.type || extensionType || "file",
          path: destination,
          userId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.UPLOAD,
          fileName: originalName,
        },
      });

      return true;
    });

    if (!saved) {
      await unlink(destination).catch(() => undefined);
      return NextResponse.json({ error: "Not enough storage space for this file." }, { status: 400 });
    }
  } catch {
    await unlink(destination).catch(() => undefined);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: `Uploaded ${originalName}` }, { status: 200 });
}
