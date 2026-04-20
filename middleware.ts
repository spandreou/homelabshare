import { NextResponse, type NextRequest } from "next/server";
import { getSessionSecret } from "./src/lib/session-secret";

type SessionPayload = {
  exp: number;
  role: "USER" | "ADMIN";
  userId: string;
};

const SESSION_COOKIE = "homeLabShare_session";
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function base64UrlToUint8Array(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const normalized = padded.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function verifySignature(payloadBase64: string, signature: string) {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const encoded = base64UrlEncode(new Uint8Array(digest));

  return encoded === signature;
}

function parsePayload(payloadBase64: string): SessionPayload | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadBase64))) as SessionPayload;

    if (!payload?.userId || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.role !== "USER" && payload.role !== "ADMIN") {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
    const contentLengthRaw = request.headers.get("content-length");
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN;

    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return new NextResponse("Payload too large. Max upload size is 150MB.", {
        status: 413,
      });
    }
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return loginRedirect(request);
  }

  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return loginRedirect(request);
  }

  const signatureValid = await verifySignature(payloadBase64, signature);
  if (!signatureValid) {
    return loginRedirect(request);
  }

  const payload = parsePayload(payloadBase64);
  if (!payload) {
    return loginRedirect(request);
  }

  if (request.nextUrl.pathname.startsWith("/admin") && payload.role !== "ADMIN") {
    return loginRedirect(request);
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
