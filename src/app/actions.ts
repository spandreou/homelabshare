"use server";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuditAction, InviteEmailStatus, InviteRequestStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
import { resolveDisplayFileName } from "../lib/file-name-display";
import { sendInviteCodeEmail } from "../lib/mail";
import { collectSystemStats, type SystemStats } from "../lib/system-stats";
import { UPLOAD_ROOT } from "../lib/storage";

const INVITE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ADMIN_GLOBAL_FOLDER = "admin_global";
const LEGACY_STATIC_INVITE = "WELCOME2026";
const MAX_AUTO_CLEANUP_FILES_PER_RUN = 500;
const LOGIN_RATE_WINDOW_MS = 60_000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 20;
const INVITE_REQUEST_RATE_WINDOW_MS = 10 * 60_000;
const MAX_INVITE_REQUESTS_PER_WINDOW = 5;
const LOGIN_RATE_BUCKETS = new Map<string, number[]>();
const INVITE_REQUEST_RATE_BUCKETS = new Map<string, number[]>();

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
const inviteRequestSchema = z.object({
  username: z.string().trim().min(2, "Username is required.").max(80, "Username is too long."),
  email: z.string().email("Please enter a valid email address.").max(254),
});

function toBigInt(value: number) {
  return BigInt(Math.trunc(value));
}

async function resolveAppUrl() {
  const configured = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return "";
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${proto}://${host}`;
}

function takeRateLimitSlot(
  buckets: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxAttempts: number,
) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = buckets.get(key) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= maxAttempts) {
    buckets.set(key, recent);
    return false;
  }

  recent.push(now);
  buckets.set(key, recent);
  return true;
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
  isOwnedByCurrentUser: boolean;
};

export type AutoCleanupPolicySnapshot = {
  enabled: boolean;
  maxAgeDays: number;
  excludeFavorited: boolean;
};

export type AutoCleanupPreviewItem = {
  id: string;
  name: string;
  ownerEmail: string;
  size: number;
  createdAt: string;
  lastAccessedAt: string | null;
};

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

function normalizeAutoCleanupPolicy(policy: {
  enabled: boolean;
  maxAgeDays: number;
  excludeFavorited: boolean;
} | null): AutoCleanupPolicySnapshot {
  return {
    enabled: policy?.enabled ?? false,
    maxAgeDays: Math.max(1, policy?.maxAgeDays ?? 30),
    excludeFavorited: policy?.excludeFavorited ?? true,
  };
}

function autoCleanupCutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function autoCleanupWhere(policy: AutoCleanupPolicySnapshot, cutoff: Date) {
  return {
    createdAt: {
      lt: cutoff,
    },
    ...(policy.excludeFavorited
      ? {
          favorites: {
            none: {},
          },
        }
      : {}),
  };
}

async function decrementStorageUsedSafely(
  tx: Pick<typeof db, "$executeRaw">,
  userId: string,
  amount: bigint,
) {
  await tx.$executeRaw`
    UPDATE "User"
    SET "storageUsed" = GREATEST(0, "storageUsed" - ${amount}::bigint)
    WHERE id = ${userId}
  `;
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

export async function getAutoCleanupPreview(limit = 12): Promise<{
  policy: AutoCleanupPolicySnapshot;
  cutoffIso: string;
  totalCandidates: number;
  items: AutoCleanupPreviewItem[];
}> {
  await requireAdmin();
  try {
    const policyRow = await db.autoCleanupPolicy.findUnique({
      where: { id: 1 },
      select: {
        enabled: true,
        maxAgeDays: true,
        excludeFavorited: true,
      },
    });
    const policy = normalizeAutoCleanupPolicy(policyRow);
    const cutoff = autoCleanupCutoff(policy.maxAgeDays);
    const where = autoCleanupWhere(policy, cutoff);

    const [totalCandidates, items] = await Promise.all([
      db.file.count({ where }),
      db.file.findMany({
        where,
        orderBy: {
          createdAt: "asc",
        },
        take: Math.max(1, Math.min(limit, 50)),
        select: {
          id: true,
          name: true,
          size: true,
          createdAt: true,
          lastAccessedAt: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      policy,
      cutoffIso: cutoff.toISOString(),
      totalCandidates,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        ownerEmail: item.user.email,
        size: Number(item.size),
        createdAt: item.createdAt.toISOString(),
        lastAccessedAt: item.lastAccessedAt ? item.lastAccessedAt.toISOString() : null,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cleanup preview error";
    console.error("getAutoCleanupPreview failed", { message });
    const policy = normalizeAutoCleanupPolicy(null);
    const cutoff = autoCleanupCutoff(policy.maxAgeDays);
    return {
      policy,
      cutoffIso: cutoff.toISOString(),
      totalCandidates: 0,
      items: [],
    };
  }
}

export async function getFiles(): Promise<ExplorerFileEntry[]> {
  const user = await requireUser();
  const normalizedRoot = path.resolve(UPLOAD_ROOT);

  await mkdir(normalizedRoot, { recursive: true });
  const dbFiles = await db.file.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    select: {
      id: true,
      name: true,
      type: true,
      path: true,
      createdAt: true,
      userId: true,
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

  const files = (
    await Promise.all(
      dbFiles.map(async (file): Promise<ExplorerFileEntry | null> => {
        const absoluteFilePath = path.resolve(file.path);
        if (!isPathInsideRoot(absoluteFilePath, normalizedRoot)) {
          return null;
        }

        const metadata = await stat(absoluteFilePath).catch(() => null);
        if (!metadata) {
          return null;
        }

        const relativePath = normalizeRelativePath(path.relative(normalizedRoot, absoluteFilePath)).replace(/\\/g, "/");
        if (!relativePath) {
          return null;
        }

        const ownerFolder = relativePath.split("/")[0] ?? "";
        const displayName = resolveDisplayFileName({
          originalName: file.name,
          storagePath: absoluteFilePath,
        });

        return {
          id: file.id,
          name: displayName,
          size: metadata.size,
          createdAt: file.createdAt.toISOString(),
          fileType: file.type || path.extname(absoluteFilePath).replace(".", "").toLowerCase() || "file",
          ownerFolder,
          relativePath,
          isFavorite: favoriteIds.has(file.id),
          isOwnedByCurrentUser: file.userId === user.id,
        };
      }),
    )
  ).filter((entry): entry is ExplorerFileEntry => entry !== null);

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

  if (file.userId !== user.id) {
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
  const user = await requireUser();
  const fileId = String(formData.get("fileId") ?? "").trim();
  const rawExpiryHours = Number(String(formData.get("expiryHours") ?? "24"));
  const expiryHours = Number.isFinite(rawExpiryHours)
    ? Math.min(24 * 30, Math.max(1, Math.trunc(rawExpiryHours)))
    : 24;

  if (!fileId) {
    return { error: "Missing file id.", url: null, expiresAt: null, shareId: null };
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
    return { error: "File not found.", url: null, expiresAt: null, shareId: null };
  }

  if (file.userId !== user.id) {
    return { error: "Not allowed.", url: null, expiresAt: null, shareId: null };
  }

  const shareId = randomUUID();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

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

  const appUrl = await resolveAppUrl();
  const shareUrl = appUrl ? `${appUrl}/sh/${shareId}` : `/sh/${shareId}`;

  return {
    error: null,
    url: shareUrl,
    expiresAt: expiresAt.toISOString(),
    shareId,
  };
}

export async function revokeShareLink(shareId: string) {
  const user = await requireUser();
  const id = String(shareId ?? "").trim();
  if (!id) {
    return;
  }

  const share = await db.shareLink.findUnique({
    where: { id },
    select: {
      id: true,
      file: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
    },
  });

  if (!share?.file) {
    return;
  }

  if (share.file.userId !== user.id) {
    return;
  }

  await db.shareLink.delete({
    where: { id: share.id },
  }).catch(() => undefined);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.DELETE,
      fileName: `[SHARE-REVOKE] ${share.file.name}`,
    },
  }).catch(() => undefined);

  revalidatePath("/dashboard/files");
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

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const ownedPaths = new Set(
    (
      await db.file.findMany({
        where: { userId: user.id },
        select: { path: true },
      })
    )
      .map((row) => path.resolve(row.path))
      .filter((candidate) => isPathInsideRoot(candidate, normalizedRoot)),
  );
  const allowed = cleaned.filter((item) => {
    const absolutePath = path.resolve(path.join(UPLOAD_ROOT, item));
    return isPathInsideRoot(absolutePath, normalizedRoot) && ownedPaths.has(absolutePath);
  });

  if (allowed.length === 0) {
    return;
  }

  const encoded = Buffer.from(JSON.stringify(allowed)).toString("base64url");
  redirect(`/api/files/zip?paths=${encoded}`);
}

export async function getSystemStats(): Promise<SystemStats> {
  await requireAdmin();
  try {
    return await collectSystemStats();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown system stats error";
    console.error("getSystemStats failed", { message });
    return {
      cpuUsagePercent: 0,
      cpuTempC: null,
      ramTotalGb: 0,
      ramUsedGb: 0,
      ramFreeGb: 0,
      ramUsedPercent: 0,
      diskTotalGb: 0,
      diskFreeGb: 0,
      diskUsedPercent: 0,
      uptimeSeconds: 0,
      registeredUsers: 0,
      activeInviteCodes: 0,
      collectedAt: new Date().toISOString(),
    };
  }
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
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  const loginBucketKey = `${clientIp}:${email}`;
  if (!takeRateLimitSlot(LOGIN_RATE_BUCKETS, loginBucketKey, LOGIN_RATE_WINDOW_MS, MAX_LOGIN_ATTEMPTS_PER_WINDOW)) {
    return { error: "Too many login attempts. Please wait a minute and try again." };
  }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown session creation error";
    console.error("loginAction:createSession failed", { message, userId: user.id });
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
    const saved = await db.$transaction(async (tx) => {
      const canStore = await incrementStorageUsedWithinLimit(tx, user.id, incomingSize);
      if (!canStore) {
        return false;
      }

      await tx.file.create({
        data: {
          name: selected.name,
          size: incomingSize,
          type: selected.type,
          path: destination,
          userId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.UPLOAD,
          fileName: selected.name,
        },
      });

      return true;
    });

    if (!saved) {
      await unlink(destination).catch(() => undefined);
      return { error: "Not enough storage space for this file.", success: null };
    }
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

  const explicitOriginalName = String(formData.get("originalName") ?? "").trim();
  const originalName = path.basename(explicitOriginalName || selected.name).trim() || `upload-${Date.now()}`;
  const storageSafeName = sanitizeFileNameForStorage(originalName) || `upload-${Date.now()}`;
  const ownerFolder = user.role === "ADMIN" ? ADMIN_GLOBAL_FOLDER : user.id;
  const ownerDirectory = path.resolve(path.join(UPLOAD_ROOT, normalizeRelativePath(ownerFolder)));
  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
    return { error: "Invalid upload path.", success: null };
  }

  await mkdir(ownerDirectory, { recursive: true });

  const uniqueName = `${Date.now()}-${randomUUID()}-${storageSafeName}`;
  const destination = path.resolve(path.join(ownerDirectory, uniqueName));
  if (!isPathInsideRoot(destination, normalizedRoot)) {
    return { error: "Invalid upload path.", success: null };
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
      return { error: "Not enough storage space for this file.", success: null };
    }
  } catch {
    await unlink(destination).catch(() => undefined);
    return { error: "Upload failed. Please try again.", success: null };
  }

  revalidatePath("/dashboard/files");
  return { error: null, success: `Uploaded ${originalName}` };
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

  await db.$transaction(async (tx) => {
    await tx.file.delete({
      where: { id: file.id },
    });
    await decrementStorageUsedSafely(tx, user.id, file.size);
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.DELETE,
        fileName: file.name,
      },
    });
  });

  await unlink(file.path).catch(() => undefined);
  revalidatePath("/dashboard");
}

export async function deleteFile(relativePath: string) {
  const user = await requireUser();
  const cleanedRelativePath = normalizeRelativePath(String(relativePath ?? ""));
  if (!cleanedRelativePath) {
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
      userId: user.id,
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
    await db.$transaction(async (tx) => {
      await tx.file.delete({ where: { id: metadata.id } });
      await decrementStorageUsedSafely(tx, metadata.userId, metadata.size);
      await tx.auditLog.create({
        data: {
          userId: metadata.userId,
          action: AuditAction.DELETE,
          fileName: metadata.name,
        },
      });
    }).catch(() => undefined);
  }

  revalidatePath("/dashboard/files");
}

export async function downloadFile(relativePath: string) {
  const user = await requireUser();
  const cleanedRelativePath = normalizeRelativePath(String(relativePath ?? ""));
  if (!cleanedRelativePath) {
    return;
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const absolutePath = path.resolve(path.join(UPLOAD_ROOT, cleanedRelativePath));
  if (!isPathInsideRoot(absolutePath, normalizedRoot)) {
    return;
  }

  const existsForUser = await db.file.findFirst({
    where: {
      path: absolutePath,
      userId: user.id,
    },
    select: { id: true },
  });
  if (!existsForUser) {
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
  const parsed = inviteRequestSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invite request.", success: null };
  }

  const { username, email } = parsed.data;

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  const inviteBucketKey = `${clientIp}:${email}`;
  if (!takeRateLimitSlot(INVITE_REQUEST_RATE_BUCKETS, inviteBucketKey, INVITE_REQUEST_RATE_WINDOW_MS, MAX_INVITE_REQUESTS_PER_WINDOW)) {
    return { error: "Too many invite requests. Please try again later.", success: null };
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
  const admin = await requireAdmin();

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
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.SHARE,
      fileName: `[INVITE-APPROVE] ${request.email}`,
    },
  }).catch(() => undefined);

  revalidatePath("/admin");
  redirect(emailSent ? "/admin?approved=1" : "/admin?approved=1&mail=0");
}

export const approveInvite = approveInviteRequest;

export async function resendInviteEmail(requestId: string) {
  const admin = await requireAdmin();

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
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.SHARE,
      fileName: `[INVITE-RESEND] ${request.email}`,
    },
  }).catch(() => undefined);

  revalidatePath("/admin");
  redirect(emailSent ? "/admin?resent=1" : "/admin?resent=1&mail=0");
}

export async function deleteInviteRequest(requestId: string) {
  const admin = await requireAdmin();

  if (!requestId) {
    return;
  }

  const deleted = await db.inviteRequest.delete({
    where: { id: requestId },
    select: { email: true },
  }).catch(() => null);
  if (deleted) {
    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: AuditAction.DELETE,
        fileName: `[INVITE-DELETE] ${deleted.email}`,
      },
    }).catch(() => undefined);
  }

  revalidatePath("/admin");
  redirect("/admin?inviteDeleted=1");
}

export async function generateManualInvite(
  _prevState: ManualInviteState,
  formData: FormData,
): Promise<ManualInviteState> {
  const admin = await requireAdmin();

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
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.SHARE,
      fileName: `[MANUAL-INVITE] ${email}`,
    },
  }).catch(() => undefined);

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
      role: true,
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

  if (target.role === UserRole.ADMIN) {
    const adminCount = await db.user.count({
      where: { role: UserRole.ADMIN },
    });
    if (adminCount <= 1) {
      redirect("/admin?deleted=last-admin");
    }
  }

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const filesToDelete = target.files
    .map((file) => {
      return path.resolve(file.path);
    })
    .filter((candidate) => {
      return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${path.sep}`);
    });

  await db.user.delete({
    where: { id: target.id },
  });
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.DELETE,
      fileName: `[ADMIN-DELETE-USER] ${target.id}`,
    },
  }).catch(() => undefined);

  await Promise.all(filesToDelete.map((filePath) => unlink(filePath).catch(() => undefined)));

  revalidatePath("/admin");
  revalidatePath("/admin/stats");
  redirect("/admin?deleted=1");
}

export async function cleanupOrphanedFilesAction() {
  const admin = await requireAdmin();

  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const [dbFiles, diskFiles] = await Promise.all([
    db.file.findMany({
      select: {
        path: true,
      },
    }),
    listFilesRecursively(normalizedRoot),
  ]);

  const registeredFiles = new Set(
    dbFiles
      .map((file) => path.resolve(file.path))
      .filter((candidate) => candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${path.sep}`)),
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

    if (registeredFiles.has(normalizedDiskFile)) {
      continue;
    }

    await unlink(normalizedDiskFile).catch(() => undefined);
    removedCount += 1;
  }

  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.DELETE,
      fileName: `[ORPHAN-CLEANUP] removed=${removedCount}`,
    },
  }).catch(() => undefined);

  revalidatePath("/admin");
  revalidatePath("/admin/stats");
  redirect(`/admin?cleanup=${removedCount}`);
}

export async function updateAutoCleanupPolicyAction(formData: FormData) {
  const admin = await requireAdmin();

  const enabled = String(formData.get("enabled") ?? "") === "on";
  const excludeFavorited = String(formData.get("excludeFavorited") ?? "") === "on";
  const rawDays = Number(String(formData.get("maxAgeDays") ?? "30"));
  const maxAgeDays = Number.isFinite(rawDays) ? Math.min(3650, Math.max(1, Math.trunc(rawDays))) : 30;

  await db.autoCleanupPolicy.upsert({
    where: { id: 1 },
    update: {
      enabled,
      maxAgeDays,
      excludeFavorited,
    },
    create: {
      id: 1,
      enabled,
      maxAgeDays,
      excludeFavorited,
    },
  });
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: AuditAction.SHARE,
      fileName: `[AUTO-CLEANUP-POLICY] enabled=${enabled} days=${maxAgeDays} excludeFavorited=${excludeFavorited}`,
    },
  }).catch(() => undefined);

  revalidatePath("/admin");
  redirect("/admin?autoCleanupUpdated=1");
}

export async function runAutoCleanupAction(formData: FormData) {
  const admin = await requireAdmin();
  const confirmation = String(formData.get("confirm") ?? "").trim().toUpperCase();

  if (confirmation !== "CLEANUP") {
    redirect("/admin?autoCleanupRunError=confirm");
  }

  const policyRow = await db.autoCleanupPolicy.findUnique({
    where: { id: 1 },
    select: {
      enabled: true,
      maxAgeDays: true,
      excludeFavorited: true,
    },
  });
  const policy = normalizeAutoCleanupPolicy(policyRow);

  if (!policy.enabled) {
    redirect("/admin?autoCleanupRunError=disabled");
  }

  const cutoff = autoCleanupCutoff(policy.maxAgeDays);
  const where = autoCleanupWhere(policy, cutoff);
  const candidates = await db.file.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
    take: MAX_AUTO_CLEANUP_FILES_PER_RUN,
    select: {
      id: true,
      name: true,
      size: true,
      userId: true,
      path: true,
    },
  });

  let removedCount = 0;
  let failedCount = 0;

  for (const file of candidates) {
    try {
      await unlink(file.path).catch(() => undefined);
      await db.$transaction(async (tx) => {
        await tx.file.delete({
          where: { id: file.id },
        });
        await decrementStorageUsedSafely(tx, file.userId, file.size);
        await tx.auditLog.create({
          data: {
            userId: admin.id,
            action: AuditAction.DELETE,
            fileName: `[AUTO-CLEAN] ${file.name}`,
          },
        });
      });
      removedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  redirect(`/admin?autoCleanupRun=${removedCount}&autoCleanupFail=${failedCount}`);
}
