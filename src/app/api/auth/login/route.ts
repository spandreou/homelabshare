import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { getFormDataString } from "../../../../lib/form-data";

const LOGIN_RATE_WINDOW_MS = 60_000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 20;
const LOGIN_RATE_BUCKETS = new Map<string, number[]>();

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

function takeRateLimitSlot(key: string) {
  const now = Date.now();
  const cutoff = now - LOGIN_RATE_WINDOW_MS;
  const existing = LOGIN_RATE_BUCKETS.get(key) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
    LOGIN_RATE_BUCKETS.set(key, recent);
    return false;
  }

  recent.push(now);
  LOGIN_RATE_BUCKETS.set(key, recent);
  return true;
}

function landingRedirect(request: Request, error: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("loginError", error);
  return NextResponse.redirect(url, 303);
}

function dashboardRedirect(request: Request, nextPath: string) {
  const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  return NextResponse.redirect(new URL(safeNextPath, request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: getFormDataString(formData, "email").trim().toLowerCase(),
    password: getFormDataString(formData, "password"),
  });

  if (!parsed.success) {
    return landingRedirect(request, "invalid-email");
  }

  const { email, password } = parsed.data;
  const forwardedFor = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (!takeRateLimitSlot(`${clientIp}:${email}`)) {
    return landingRedirect(request, "rate-limited");
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
    },
  }).catch(() => null);

  if (!user) {
    return landingRedirect(request, "invalid");
  }

  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    return landingRedirect(request, "invalid");
  }

  try {
    await createSession({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown session creation error";
    console.error("login route:createSession failed", { message, userId: user.id });
    return landingRedirect(request, "session");
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.LOGIN,
      fileName: "session",
    },
  }).catch(() => undefined);

  return dashboardRedirect(request, getFormDataString(formData, "next").trim());
}
