import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { UserRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSessionSecret } from "./session-secret";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "homeLabShare_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  email: string;
  exp: number;
  role: UserRole;
  userId: string;
};

function signPayload(payloadBase64: string) {
  return createHmac("sha256", getSessionSecret()).update(payloadBase64).digest("base64url");
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(payloadBase64: string): SessionPayload | null {
  try {
    const raw = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as SessionPayload;
    if (
      !parsed?.userId ||
      typeof parsed.exp !== "number" ||
      !parsed.email ||
      (parsed.role !== UserRole.ADMIN && parsed.role !== UserRole.USER)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) {
    return false;
  }

  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(hashHex, "hex");

  if (candidate.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(candidate, stored);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getRequestClientMeta() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) || null;

  return { clientIp, userAgent };
}

export async function createSession(params: { userId: string; role: UserRole; email: string }) {
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (previousToken) {
    await db.activeSession.deleteMany({
      where: { tokenHash: hashSessionToken(previousToken) },
    }).catch(() => undefined);
  }

  const payload: SessionPayload = {
    userId: params.userId,
    role: params.role,
    email: params.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadBase64 = encodePayload(payload);
  const signature = signPayload(payloadBase64);
  const token = `${payloadBase64}.${signature}`;
  const tokenHash = hashSessionToken(token);
  const { clientIp, userAgent } = await getRequestClientMeta();

  await db.activeSession.create({
    data: {
      tokenHash,
      userId: params.userId,
      ipAddress: clientIp,
      userAgent,
      expiresAt: new Date(payload.exp * 1000),
    },
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.activeSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  const clearCookie = () => {
    cookieStore.delete(SESSION_COOKIE);
  };

  if (!token) {
    return null;
  }

  const [payloadBase64, signature] = token.split(".");

  if (!payloadBase64 || !signature) {
    clearCookie();
    return null;
  }

  const expected = signPayload(payloadBase64);
  if (expected.length !== signature.length) {
    clearCookie();
    return null;
  }

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    clearCookie();
    return null;
  }

  const payload = decodePayload(payloadBase64);
  if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) {
    await db.activeSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    }).catch(() => undefined);
    clearCookie();
    return null;
  }

  const activeSession = await db.activeSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  if (!activeSession || activeSession.expiresAt.getTime() <= Date.now()) {
    await db.activeSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    }).catch(() => undefined);
    clearCookie();
    return null;
  }

  const { clientIp, userAgent } = await getRequestClientMeta();

  await db.activeSession.update({
    where: { id: activeSession.id },
    data: {
      lastSeen: new Date(),
      ipAddress: clientIp,
      userAgent,
    },
  });

  return payload;
}

export async function getSessionUserId() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  return payload.userId;
}

export async function getSessionRole() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  return payload.role;
}

export async function getSessionEmail() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  return payload.email;
}

export async function getCurrentUser() {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      storageUsed: true,
      storageLimit: true,
      createdAt: true,
    },
  });

  if (!user) {
    return null;
  }

  if (
    payload.role !== user.role ||
    payload.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    await destroySession();
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return user;
}
