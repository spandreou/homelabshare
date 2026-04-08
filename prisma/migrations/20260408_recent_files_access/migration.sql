ALTER TABLE "File"
ADD COLUMN "lastAccessedAt" TIMESTAMP(3);

CREATE INDEX "File_userId_lastAccessedAt_idx"
ON "File"("userId", "lastAccessedAt" DESC);
