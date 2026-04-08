CREATE TABLE "FileFavorite" (
  "userId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FileFavorite_pkey" PRIMARY KEY ("userId", "fileId"),
  CONSTRAINT "FileFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FileFavorite_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FileFavorite_fileId_idx" ON "FileFavorite"("fileId");
CREATE INDEX "FileFavorite_userId_createdAt_idx" ON "FileFavorite"("userId", "createdAt" DESC);
