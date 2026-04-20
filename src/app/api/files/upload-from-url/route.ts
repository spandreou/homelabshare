import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import http, { type IncomingMessage, type RequestOptions } from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AuditAction, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { UPLOAD_ROOT } from "../../../../lib/storage";

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ADMIN_GLOBAL_FOLDER = "admin_global";
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_URL_UPLOAD_ATTEMPTS_PER_WINDOW = 20;
const SNIFF_BYTES = 64;

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp"];
const RATE_LIMIT_BUCKETS = new Map<string, number[]>();

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/zip": "zip",
};

type ResolvedAddress = {
  address: string;
  family: number;
};

function getHeaderValue(headers: IncomingMessage["headers"], name: string) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function takeRateLimitSlot(userId: string) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = RATE_LIMIT_BUCKETS.get(userId) ?? [];
  const recent = existing.filter((ts) => ts >= cutoff);

  if (recent.length >= MAX_URL_UPLOAD_ATTEMPTS_PER_WINDOW) {
    RATE_LIMIT_BUCKETS.set(userId, recent);
    return false;
  }

  recent.push(now);
  RATE_LIMIT_BUCKETS.set(userId, recent);
  return true;
}

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

function normalizeRelativePath(input: string) {
  return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
}

function isPathInsideRoot(absolutePath: string, rootPath: string) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || !normalized.includes(".")) {
    return true;
  }

  return BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function parseIPv4(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isPrivateIPv4(ip: string) {
  const parts = parseIPv4(ip);
  if (!parts) return true;
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;

  return false;
}

function isPrivateIPv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:127.")) return true;
  return false;
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true;
}

function parseContentType(value: string | null) {
  if (!value) {
    return "";
  }
  const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)) {
    return "";
  }
  return type;
}

function sanitizeFileNameForStorage(raw: string) {
  return path
    .basename(raw)
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function safeFileNameFromHeader(raw: string | null) {
  if (!raw) {
    return "";
  }

  const match = raw.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);
  if (!match?.[1]) {
    return "";
  }

  const decoded = decodeURIComponent(match[1]).replace(/[\r\n]/g, "");
  return path.basename(decoded).trim();
}

function fallbackFileNameFromUrl(url: URL) {
  const base = path.basename(url.pathname || "").trim();
  const candidate = base ? decodeURIComponent(base) : "";
  const fileName = path.basename(candidate).trim();
  return fileName || "downloaded-file";
}

function detectMimeFromMagic(data: Buffer) {
  if (data.length >= 5 && data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return { mime: "application/pdf", extension: "pdf" };
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (data.length >= 6 && (data.subarray(0, 6).toString("ascii") === "GIF87a" || data.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { mime: "image/gif", extension: "gif" };
  }
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return { mime: "application/zip", extension: "zip" };
  }
  return null;
}

async function resolvePublicHost(targetUrl: URL) {
  if (!(targetUrl.protocol === "http:" || targetUrl.protocol === "https:")) {
    throw new Error("Only http/https URLs are allowed.");
  }

  if (targetUrl.username || targetUrl.password) {
    throw new Error("Authenticated URLs are not allowed.");
  }

  const hostname = targetUrl.hostname.trim().toLowerCase();
  if (isBlockedHostname(hostname)) {
    throw new Error("URL host is not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("URL resolves to a private/internal address.");
    }
    return [{ address: hostname, family: isIP(hostname) }];
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (!resolved.length) {
    throw new Error("Could not resolve URL host.");
  }

  for (const result of resolved) {
    if (isPrivateAddress(result.address)) {
      throw new Error("URL resolves to a private/internal address.");
    }
  }

  return resolved.map((result) => ({
    address: result.address,
    family: result.family,
  }));
}

async function requestPinned(currentUrl: URL, resolvedAddress: ResolvedAddress) {
  const transport = currentUrl.protocol === "https:" ? https : http;
  const pinnedLookup = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) {
      callback(null, [{ address: resolvedAddress.address, family: resolvedAddress.family }]);
      return;
    }
    callback(null, resolvedAddress.address, resolvedAddress.family);
  }) as unknown as NonNullable<RequestOptions["lookup"]>;

  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = transport.request(
      currentUrl,
      {
        method: "GET",
        headers: {
          "user-agent": "homeLabShare-url-uploader/1.0",
        },
        timeout: REQUEST_TIMEOUT_MS,
        lookup: pinnedLookup,
      },
      (res) => resolve(res),
    );

    req.on("timeout", () => req.destroy(new Error("Remote request timed out.")));
    req.on("error", reject);
    req.end();
  });

  return response;
}

async function fetchWithSafeRedirects(initialUrl: URL) {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const pinnedAddresses = await resolvePublicHost(currentUrl);
    const response = await requestPinned(currentUrl, pinnedAddresses[0]);
    const statusCode = response.statusCode ?? 0;

    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = getHeaderValue(response.headers, "location");
      response.resume();
      if (!location) {
        throw new Error("Remote server redirect is missing location.");
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new Error("Unexpected URL fetch flow.");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!takeRateLimitSlot(user.id)) {
    return NextResponse.json(
      { error: `Too many URL upload attempts. Please wait about ${Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)} seconds and retry.` },
      { status: 429 },
    );
  }

  let payload: { url?: string };
  try {
    payload = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawUrl = String(payload.url ?? "").trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
  }

  const incomingSizeLimit = toBigInt(MAX_UPLOAD_BYTES);
  if (user.storageUsed + incomingSizeLimit > user.storageLimit) {
    return NextResponse.json({ error: "Not enough storage space for URL upload." }, { status: 400 });
  }

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(parsedUrl);
    const statusCode = response.statusCode ?? 0;

    if (statusCode < 200 || statusCode >= 300) {
      response.resume();
      return NextResponse.json({ error: `Remote server responded with ${statusCode}.` }, { status: 400 });
    }

    const declaredLength = Number(getHeaderValue(response.headers, "content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
      response.resume();
      return NextResponse.json({ error: "Remote file exceeds maximum size (150MB)." }, { status: 400 });
    }

    const ownerFolder = user.role === UserRole.ADMIN ? ADMIN_GLOBAL_FOLDER : user.id;
    const normalizedRoot = path.resolve(UPLOAD_ROOT);
    const ownerDirectory = path.resolve(path.join(UPLOAD_ROOT, normalizeRelativePath(ownerFolder)));

    if (!isPathInsideRoot(ownerDirectory, normalizedRoot)) {
      return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
    }

    await mkdir(ownerDirectory, { recursive: true });

    const contentType = parseContentType(getHeaderValue(response.headers, "content-type"));
    const suggestedByHeader = safeFileNameFromHeader(getHeaderValue(response.headers, "content-disposition"));
    let fileName = suggestedByHeader || fallbackFileNameFromUrl(finalUrl);

    if (!path.extname(fileName) && contentType && EXT_BY_CONTENT_TYPE[contentType]) {
      fileName = `${fileName}.${EXT_BY_CONTENT_TYPE[contentType]}`;
    }

    const originalName = path.basename(fileName).trim() || `download-${Date.now()}`;
    const storageSafeName = sanitizeFileNameForStorage(originalName) || `download-${Date.now()}`;
    const uniqueName = `${Date.now()}-${randomUUID()}-${storageSafeName}`;
    const destination = path.resolve(path.join(ownerDirectory, uniqueName));

    if (!isPathInsideRoot(destination, normalizedRoot)) {
      return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
    }

    let downloadedBytes = 0;
    const sniffChunks: Buffer[] = [];
    let sniffBytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        if (downloadedBytes > MAX_UPLOAD_BYTES) {
          callback(new Error("Remote file exceeds maximum size (150MB)."));
          return;
        }

        if (sniffBytes < SNIFF_BYTES) {
          const remaining = SNIFF_BYTES - sniffBytes;
          const sample = Buffer.from(chunk.subarray(0, remaining));
          sniffChunks.push(sample);
          sniffBytes += sample.length;
        }

        callback(null, chunk);
      },
    });

    const writer = createWriteStream(destination, { flags: "wx" });

    try {
      await pipeline(response, limiter, writer);
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      const message = error instanceof Error ? error.message : "Could not download remote file.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (downloadedBytes <= 0) {
      await unlink(destination).catch(() => undefined);
      return NextResponse.json({ error: "Remote file appears empty." }, { status: 400 });
    }

    const incomingSize = toBigInt(downloadedBytes);
    if (user.storageUsed + incomingSize > user.storageLimit) {
      await unlink(destination).catch(() => undefined);
      return NextResponse.json({ error: "Not enough storage space for this file." }, { status: 400 });
    }

    const sniffed = detectMimeFromMagic(Buffer.concat(sniffChunks, sniffBytes));
    const extensionType = path.extname(originalName).replace(".", "").toLowerCase();
    const resolvedFileType = sniffed?.mime || contentType || extensionType || "file";

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
            type: resolvedFileType,
            path: destination,
            userId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: AuditAction.UPLOAD,
            fileName: `[URL] ${originalName}`,
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
      return NextResponse.json({ error: "URL upload failed while saving file." }, { status: 500 });
    }

    return NextResponse.json({ success: `Uploaded ${originalName}` }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
