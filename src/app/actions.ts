"use server";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuditAction, InviteEmailStatus, InviteRequestStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type {
  AuthActionState,
  FileActionState,
  InviteRequestActionState,
  ManualInviteState,
  ShareLinkState,
} from "./action-types";
import { createSession, destroySession, getCurrentUser, hashPassword, requireAdmin, requireUser, verifyPassword } from "../lib/auth";
import { db } from "../lib/db";
import { sendInviteCodeEmail } from "../lib/mail";
import { collectSystemStats, type SystemStats } from "../lib/system-stats";
import { UPLOAD_ROOT } from "../lib/storage";

const INVITE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ADMIN_GLOBAL_FOLDER = "admin_global";
const LEGACY_STATIC_INVITE = "WELCOME2026";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  inviteCode: z
    .string()
    .min(1, "Invite code is required.")
    .max(64, "Invite code is too long.")
    .regex(/^[A-Z0-9-]+$/, "Invite code format is invalid."),
});

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

const uploadSchema = z.object({
  file: z
    .instanceof(File, { error: "Please choose a file to upload." })
    .refine((file) => file.size > 0, "Please choose a file to upload.")
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, "Max file size is 150MB."),
});

const activationCodeSchema = z.object({
  email: z.string().email("Please enter a valid email address.").max(254),
});

function toBigInt(value: number) {
  return BigInt(Math.trunc(value));
}

function buildInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (length: number) =>
    Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  return `${part(4)}-${part(4)}`;
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildInviteCode();
    const exists = await db.inviteCode.findUnique({
      where: { code: candidate },
      select: { id: true },
    });

    if (!exists) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique invite code.");
}

async function ensureActiveInviteCodeForEmail(email: string) {
  const now = new Date();
  const existing = await db.inviteCode.findFirst({
    where: {
      email,
      isUsed: false,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      code: true,
      expiresAt: true,
    },
  });

  if (existing) {
    return existing;
  }

  const code = await createUniqueInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_MAX_AGE_MS);

  await db.inviteCode.create({
    data: {
      code,
      email,
      expiresAt,
      isUsed: false,
    },
  });

  return { code, expiresAt };
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const currentPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(currentPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(currentPath);
    }
  }

  return files;
}

export type ExplorerFileEntry = {
  id: string | null;
  name: string;
  size: number;
  createdAt: string;
  fileType: string;
  ownerFolder: string;
  relativePath: string;
  isFavorite: boolean;
};

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
}

export async function getFiles(): Promise<ExplorerFileEntry[]> {
  const user = await requireUser();
  const normalizedRoot = path.resolve(UPLOAD_ROOT);

  await mkdir(normalizedRoot, { recursive: true });

  const ownerFolders =
    user.role === "ADMIN"
      ? [
          ...(await readdir(normalizedRoot, { withFileTypes: true }).catch(() => []))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
          ADMIN_GLOBAL_FOLDER,
        ]
      : [user.id];

  const files: ExplorerFileEntry[] = [];
  const dbFiles = await db.file.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    select: {
      id: true,
      name: true,
      type: true,
      path: true,
    },
  });
  const favoriteRows = await db.fileFavorite.findMany({
    where: {
      userId: user.id,
    },
    select: {
      fileId: true,
    },
  });
  const favoriteIds = new Set(favoriteRows.map((row) => row.fileId));
  const fileMetaByPath = new Map(
    dbFiles.map((file) => [
      path.resolve(file.path),
      {
        id: file.id,
        name: file.name,
        type: file.type,
      },
    ]),
  );

  for (const ownerFolder of Array.from(new Set(ownerFolders))) {
    const ownerDirectory = path.resolve(path.join(normalizedRoot, normalizeRelativePath(ownerFolder)));
    if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
      continue;
    }

    const entries = await readdir(ownerDirectory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const absoluteFilePath = path.resolve(path.join(ownerDirectory, entry.name));
      if (!isPathInsideRoot(absoluteFilePath, normalizedRoot)) {
        continue;
      }

      const metadata = await stat(absoluteFilePath).catch(() => null);
      if (!metadata) {
        continue;
      }
      const dbMeta = fileMetaByPath.get(absoluteFilePath);

      files.push({
        id: dbMeta?.id ?? null,
        name: dbMeta?.name ?? entry.name,
        size: metadata.size,
        createdAt: metadata.birthtime.toISOString(),
        fileType: dbMeta?.type || path.extname(entry.name).replace(".", "").toLowerCase() || "file",
        ownerFolder,
        relativePath: `${ownerFolder}/${entry.name}`,
        isFavorite: dbMeta?.id ? favoriteIds.has(dbMeta.id) : false,
      });
    }
  }

  return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function toggleFavoriteAction(fileId: string) {
  const user = await requireUser();
  if (!fileId) {
    return;
  }

  const file = await db.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  if (!file) {
    return;
  }

  if (user.role !== "ADMIN" && file.userId !== user.id) {
    return;
  }

  const existing = await db.fileFavorite.findUnique({
    where: {
      userId_fileId: {
        userId: user.id,
        fileId: file.id,
      },
    },
    select: {
      fileId: true,
    },
  });

  if (existing) {
    await db.fileFavorite.delete({
      where: {
        userId_fileId: {
          userId: user.id,
          fileId: file.id,
        },
      },
    });
  } else {
    await db.fileFavorite.create({
      data: {
        userId: user.id,
        fileId: file.id,
      },
    });
  }

  revalidatePath("/dashboard/files");
  revalidatePath("/dashboard");
}

export async function generateShareLink(
  _prevState: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState> {
  const user = await requireAdmin();
  const fileId = String(formData.get("fileId") ?? "").trim();

  if (!fileId) {
    return { error: "Missing file id.", url: null, expiresAt: null };
  }

  const file = await db.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  if (!file) {
    return { error: "File not found.", url: null, expiresAt: null };
  }

  if (user.role !== "ADMIN" && file.userId !== user.id) {
    return { error: "Not allowed.", url: null, expiresAt: null };
  }

  const shareId = `${randomUUID().slice(0, 3)}-${randomUUID().slice(0, 3)}`.toLowerCase();
  const expiresAt = new Date(Date.now() + INVITE_MAX_AGE_MS);

  await db.shareLink.create({
    data: {
      id: shareId,
      fileId: file.id,
      expiresAt,
      downloadCount: 0,
    },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.SHARE,
      fileName: file.name,
    },
  }).catch(() => undefined);

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const shareUrl = appUrl ? `${appUrl}/sh/${shareId}` : `/sh/${shareId}`;

  return {
    error: null,
    url: shareUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function zipFiles(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("paths") ?? "[]");
  let paths: string[] = [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      paths = parsed.map((item) => String(item));
    }
  } catch {
    return;
  }

  const cleaned = Array.from(
    new Set(
      paths
        .map((item) => normalizeRelativePath(item))
        .filter((item) => item.length > 0),
    ),
  );

  const allowed = cleaned.filter((item) => {
    const ownerFolder = item.split("/")[0];
    return user.role === "ADMIN" || ownerFolder === user.id;
  });

  if (allowed.length === 0) {
    return;
  }

  const encoded = Buffer.from(JSON.stringify(allowed)).toString("base64url");
  redirect(`/api/files/zip?paths=${encoded}`);
}

export async function getSystemStats(): Promise<SystemStats> {
  await requireAdmin();
  return collectSystemStats();
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? "").trim().toUpperCase(),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration data." };
  }

  const { email, password, inviteCode } = parsed.data;

  if (inviteCode === LEGACY_STATIC_INVITE) {
    return { error: "Static invite codes are disabled. Request a personal invite." };
  }

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const registration = await db.$transaction(async (tx) => {
    const code = await tx.inviteCode.findUnique({
      where: { code: inviteCode },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        createdAt: true,
        isUsed: true,
      },
    });

    if (!code || code.isUsed) {
      return { reason: "INVALID" as const };
    }

    if (code.expiresAt < now || now.getTime() - code.createdAt.getTime() > INVITE_MAX_AGE_MS) {
      return { reason: "EXPIRED" as const };
    }

    if (code.email.toLowerCase() !== email) {
      return { reason: "MISMATCH" as const };
    }

    const claim = await tx.inviteCode.updateMany({
      where: { id: code.id, isUsed: false },
      data: { isUsed: true },
    });

    if (claim.count === 0) {
      return { reason: "INVALID" as const };
    }

    const user = await tx.user.create({
      data: { email, password: passwordHash },
      select: { id: true, role: true, email: true },
    });

    return { reason: "OK" as const, user };
  });

  if (registration.reason === "EXPIRED") {
    return { error: "Invite code expired. Please request a new one." };
  }

  if (registration.reason === "MISMATCH") {
    return { error: "Invite code does not belong to this email." };
  }

  if (registration.reason !== "OK") {
    return { error: "Invalid or already used invite code." };
  }

  await createSession({
    userId: registration.user.id,
    role: registration.user.role,
    email: registration.user.email,
  });
  redirect("/dashboard");
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid login credentials." };
  }

  const { email, password } = parsed.data;
  const nextPath = String(formData.get("next") ?? "").trim();

  let userResult: {
    id: string;
    email: string;
    password: string;
    role: UserRole;
  } | null = null;
  try {
    userResult = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
      },
    });
  } catch {
    return { error: "Login service is temporarily unavailable. Please try again in a moment." };
  }
  const user = userResult;

  if (!user) {
    return { error: "Invalid email or password." };
  }

  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    return { error: "Invalid email or password." };
  }

  try {
    await createSession({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
  } catch {
    return { error: "Could not start your session right now. Please try again." };
  }
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.LOGIN,
      fileName: "session",
    },
  }).catch(() => undefined);

  if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    redirect(nextPath);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    await db.auditLog.create({
      data: {
        userId: currentUser.id,
        action: AuditAction.LOGOUT,
        fileName: "session",
      },
    }).catch(() => undefined);
  }
  await destroySession();
  redirect("/");
}

export async function uploadFileAction(
  _prevState: FileActionState,
  formData: FormData,
): Promise<FileActionState> {
  const user = await requireUser();
  const parsed = uploadSchema.safeParse({
    file: formData.get("file"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid file upload.", success: null };
  }

  const selected = parsed.data.file;

  const incomingSize = toBigInt(selected.size);
  if (user.storageUsed + incomingSize > user.storageLimit) {
    return {
      error: "Not enough storage space for this file.",
      success: null,
    };
  }

  const parsedExt = path.extname(selected.name);
  const safeExt = parsedExt.slice(0, 10);
  const safeName = `${Date.now()}-${randomUUID()}${safeExt}`;
  const destination = path.join(UPLOAD_ROOT, safeName);

  await mkdir(UPLOAD_ROOT, { recursive: true });

  const arrayBuffer = await selected.arrayBuffer();
  await writeFile(destination, Buffer.from(arrayBuffer));

  try {
    await db.$transaction([
      db.file.create({
        data: {
          name: selected.name,
          size: incomingSize,
          type: selected.type,
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
          fileName: selected.name,
        },
      }),
    ]);
  } catch {
    await unlink(destination).catch(() => undefined);
    return { error: "Upload failed. Please try again.", success: null };
  }

  revalidatePath("/dashboard");
  return { error: null, success: `Uploaded ${selected.name}` };
}

export async function uploadFile(
  _prevState: FileActionState,
  formData: FormData,
): Promise<FileActionState> {
  const user = await requireUser();
  const selected = formData.get("file");
  if (!(selected instanceof File) || selected.size <= 0) {
    return { error: "Please choose a file to upload.", success: null };
  }
  if (selected.size > MAX_UPLOAD_BYTES) {
    return { error: "Max file size is 150MB.", success: null };
  }

  const incomingSize = toBigInt(selected.size);
  if (user.storageUsed + incomingSize > user.storageLimit) {
    return {
      error: "Not enough storage space for this file.",
      success: null,
    };
  }

  const safeOriginalName = path.basename(selected.name).replace(/[^\w.\- ]+/g, "_");
  const ownerFolder = user.role === "ADMIN" ? ADMIN_GLOBAL_FOLDER : user.id;
  const ownerDirectory = path.resolve(path.join(UPLOAD_ROOT, normalizeRelativePath(ownerFolder)));
  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
    return { error: "Invalid upload path.", success: null };
  }

  await mkdir(ownerDirectory, { recursive: true });

  const uniqueName = `${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  const destination = path.resolve(path.join(ownerDirectory, uniqueName));
  if (!isPathInsideRoot(destination, normalizedRoot)) {
    return { error: "Invalid upload path.", success: null };
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
    return { error: "Upload failed. Please try again.", success: null };
  }

  revalidatePath("/dashboard/files");
  return { error: null, success: `Uploaded ${safeOriginalName}` };
}

export async function deleteFileAction(fileId: string) {
  const user = await requireUser();

  if (!fileId) {
    return;
  }

  const file = await db.file.findFirst({
    where: {
      id: fileId,
      userId: user.id,
    },
    select: {
      id: true,
      name: true,
      size: true,
      path: true,
    },
  });

  if (!file) {
    return;
  }

  await db.$transaction([
    db.file.delete({
      where: { id: file.id },
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        storageUsed: {
          decrement: file.size,
        },
      },
    }),
    db.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.DELETE,
        fileName: file.name,
      },
    }),
  ]);

  await unlink(file.path).catch(() => undefined);
  revalidatePath("/dashboard");
}

export async function deleteFile(relativePath: string) {
  const user = await requireUser();
  const cleanedRelativePath = normalizeRelativePath(String(relativePath ?? ""));
  if (!cleanedRelativePath) {
    return;
  }

  const ownerFolder = cleanedRelativePath.split("/")[0];
  if (user.role !== "ADMIN" && ownerFolder !== user.id) {
    return;
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const absolutePath = path.resolve(path.join(UPLOAD_ROOT, cleanedRelativePath));

  if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
    return;
  }

  const metadata = await db.file.findFirst({
    where: {
      path: absolutePath,
      ...(user.role === "ADMIN" ? {} : { userId: user.id }),
    },
    select: {
      id: true,
      size: true,
      name: true,
      userId: true,
    },
  });

  await unlink(absolutePath).catch(() => undefined);
  if (metadata) {
    await db.$transaction([
      db.file.delete({ where: { id: metadata.id } }),
      db.user.update({
        where: { id: metadata.userId },
        data: {
          storageUsed: {
            decrement: metadata.size,
          },
        },
      }),
      db.auditLog.create({
        data: {
          userId: metadata.userId,
          action: AuditAction.DELETE,
          fileName: metadata.name,
        },
      }),
    ]).catch(() => undefined);
  }

  revalidatePath("/dashboard/files");
}

export async function downloadFile(relativePath: string) {
  const user = await requireUser();
  const cleanedRelativePath = normalizeRelativePath(String(relativePath ?? ""));
  if (!cleanedRelativePath) {
    return;
  }

  const ownerFolder = cleanedRelativePath.split("/")[0];
  if (user.role !== "ADMIN" && ownerFolder !== user.id) {
    return;
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const absolutePath = path.resolve(path.join(UPLOAD_ROOT, cleanedRelativePath));
  if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
    return;
  }

  redirect(`/api/files/download?path=${encodeURIComponent(cleanedRelativePath)}`);
}

export async function downloadFileAction(fileId: string) {
  const user = await requireUser();
  if (!fileId) {
    return;
  }

  const file = await db.file.findFirst({
    where: {
      id: fileId,
      userId: user.id,
    },
    select: { id: true },
  });

  if (!file) {
    return;
  }

  redirect(`/download/${file.id}`);
}

export async function requestInvite(
  _prevState: InviteRequestActionState,
  formData: FormData,
): Promise<InviteRequestActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!username || !email) {
    return { error: "Username and email are required.", success: null };
  }

  const existingPending = await db.inviteRequest.findFirst({
    where: {
      email,
      status: InviteRequestStatus.PENDING,
    },
    select: { id: true },
  });

  if (existingPending) {
    return { error: "You already have a pending invite request.", success: null };
  }

  await db.inviteRequest.create({
    data: {
      username,
      email,
      status: InviteRequestStatus.PENDING,
    },
  });

  return {
    error: null,
    success: "Request submitted. We will email you if approved.",
  };
}

export async function approveInviteRequest(requestId: string) {
  await requireAdmin();

  const request = await db.inviteRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      username: true,
      email: true,
    },
  });

  if (!request) {
    return;
  }

  const invite = await ensureActiveInviteCodeForEmail(request.email);
  const inviteCode = invite.code;
  const expiresAt = invite.expiresAt;

  let emailSent = true;
  let emailError = "";

  try {
    await sendInviteCodeEmail({
      email: request.email,
      username: request.username,
      inviteCode,
      expiresAt,
    });
  } catch (error) {
    emailSent = false;
    emailError = error instanceof Error ? error.message : "Unknown email transport error.";
  }

  await db.inviteRequest.update({
    where: { id: request.id },
    data: {
      status: InviteRequestStatus.APPROVED,
      inviteCode,
      emailStatus: emailSent ? InviteEmailStatus.SENT : InviteEmailStatus.FAILED,
      emailError: emailSent ? null : emailError,
      emailSentAt: emailSent ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  redirect(emailSent ? "/admin?approved=1" : "/admin?approved=1&mail=0");
}

export const approveInvite = approveInviteRequest;

export async function resendInviteEmail(requestId: string) {
  await requireAdmin();

  const request = await db.inviteRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      username: true,
      email: true,
      inviteCode: true,
    },
  });

  if (!request) {
    return;
  }

  const invite = await ensureActiveInviteCodeForEmail(request.email);
  const inviteCode = invite.code;
  const expiresAt = invite.expiresAt;
  let emailSent = true;
  let emailError = "";

  try {
    await sendInviteCodeEmail({
      email: request.email,
      username: request.username,
      inviteCode,
      expiresAt,
    });
  } catch (error) {
    emailSent = false;
    emailError = error instanceof Error ? error.message : "Unknown email transport error.";
  }

  await db.inviteRequest.update({
    where: { id: request.id },
    data: {
      status: InviteRequestStatus.APPROVED,
      inviteCode,
      emailStatus: emailSent ? InviteEmailStatus.SENT : InviteEmailStatus.FAILED,
      emailError: emailSent ? null : emailError,
      emailSentAt: emailSent ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  redirect(emailSent ? "/admin?resent=1" : "/admin?resent=1&mail=0");
}

export async function deleteInviteRequest(requestId: string) {
  await requireAdmin();

  if (!requestId) {
    return;
  }

  await db.inviteRequest.delete({
    where: { id: requestId },
  }).catch(() => undefined);

  revalidatePath("/admin");
  redirect("/admin?inviteDeleted=1");
}

export async function generateManualInvite(
  _prevState: ManualInviteState,
  formData: FormData,
): Promise<ManualInviteState> {
  await requireAdmin();

  const parsed = activationCodeSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid email.",
      success: null,
      code: null,
      email: null,
      expiresAt: null,
    };
  }

  const { email } = parsed.data;
  const code = await createUniqueInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_MAX_AGE_MS);

  await db.$transaction([
    db.inviteCode.updateMany({
      where: {
        email,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    }),
    db.inviteCode.create({
      data: {
        code,
        email,
        expiresAt,
        isUsed: false,
      },
    }),
  ]);

  revalidatePath("/admin");
  return {
    error: null,
    success: "Activation code generated successfully.",
    code,
    email,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function deleteUserByAdminAction(userId: string) {
  const admin = await requireAdmin();
  if (!userId) {
    return;
  }

  if (userId === admin.id) {
    redirect("/admin?deleted=self");
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      files: {
        select: {
          path: true,
        },
      },
    },
  });

  if (!target) {
    return;
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const filesToDelete = target.files
    .map((file) => {
      const safeFileName = path.basename(file.path);
      return path.resolve(path.join(UPLOAD_ROOT, safeFileName));
    })
    .filter((candidate) => {
      return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${path.sep}`);
    });

  await db.user.delete({
    where: { id: target.id },
  });

  await Promise.all(filesToDelete.map((filePath) => unlink(filePath).catch(() => undefined)));

  revalidatePath("/admin");
  revalidatePath("/admin/stats");
  redirect("/admin?deleted=1");
}

export async function cleanupOrphanedFilesAction() {
  await requireAdmin();

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const [dbFiles, diskFiles] = await Promise.all([
    db.file.findMany({
      select: {
        path: true,
      },
    }),
    listFilesRecursively(normalizedRoot),
  ]);

  const registeredFileNames = new Set(
    dbFiles.map((file) => path.basename(file.path)),
  );

  let removedCount = 0;

  for (const absoluteDiskFile of diskFiles) {
    const normalizedDiskFile = path.resolve(absoluteDiskFile);
    const isWithinRoot =
      normalizedDiskFile === normalizedRoot ||
      normalizedDiskFile.startsWith(`${normalizedRoot}${path.sep}`);

    if (!isWithinRoot) {
      continue;
    }

    const diskFileName = path.basename(normalizedDiskFile);
    if (registeredFileNames.has(diskFileName)) {
      continue;
    }

    await unlink(normalizedDiskFile).catch(() => undefined);
    removedCount += 1;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/stats");
  redirect(`/admin?cleanup=${removedCount}`);
}
