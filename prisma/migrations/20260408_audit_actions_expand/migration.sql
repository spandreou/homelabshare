DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InviteRequestStatus') THEN
    CREATE TYPE "InviteRequestStatus" AS ENUM ('PENDING', 'APPROVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InviteEmailStatus') THEN
    CREATE TYPE "InviteEmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    CREATE TYPE "AuditAction" AS ENUM ('UPLOAD', 'DELETE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "storageUsed" BIGINT NOT NULL DEFAULT 0,
  "storageLimit" BIGINT NOT NULL DEFAULT 5368709120,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "File" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "type" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "File_userId_idx" ON "File"("userId");

CREATE TABLE IF NOT EXISTS "ShareLink" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");

CREATE TABLE IF NOT EXISTS "InviteCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "email" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isUsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InviteCode_code_key" ON "InviteCode"("code");

CREATE TABLE IF NOT EXISTS "InviteRequest" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "InviteRequestStatus" NOT NULL DEFAULT 'PENDING',
  "inviteCode" TEXT,
  "emailStatus" "InviteEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
  "emailError" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InviteRequest_status_createdAt_idx" ON "InviteRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "InviteRequest_emailStatus_updatedAt_idx" ON "InviteRequest"("emailStatus", "updatedAt");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "fileName" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp" DESC);

CREATE TABLE IF NOT EXISTS "ActiveSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActiveSession_tokenHash_key" ON "ActiveSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "ActiveSession_expiresAt_lastSeen_idx" ON "ActiveSession"("expiresAt", "lastSeen");
CREATE INDEX IF NOT EXISTS "ActiveSession_userId_expiresAt_idx" ON "ActiveSession"("userId", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'File_userId_fkey'
  ) THEN
    ALTER TABLE "File"
      ADD CONSTRAINT "File_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShareLink_fileId_fkey'
  ) THEN
    ALTER TABLE "ShareLink"
      ADD CONSTRAINT "ShareLink_fileId_fkey"
      FOREIGN KEY ("fileId") REFERENCES "File"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AuditLog_userId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ActiveSession_userId_fkey'
  ) THEN
    ALTER TABLE "ActiveSession"
      ADD CONSTRAINT "ActiveSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOWNLOAD';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHARE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGOUT';
