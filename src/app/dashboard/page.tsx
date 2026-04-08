import { initialFileState } from "../action-types";
import { logoutAction, uploadFileAction } from "../actions";
import { requireUser } from "../../lib/auth";
import { ThemeSwitcher } from "../../components/ThemeSwitcher";
import { db } from "../../lib/db";
import { FilesList } from "./files-list";
import { UploadForm } from "./upload-form";
import { HardDrive, LogOut, Upload, FolderOpen, FileText, FileSpreadsheet, FileArchive, File, Image as ImageIcon, Clock3, Star } from "lucide-react";
import Link from "next/link";

function formatBytes(value: bigint) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function fileIconMeta(type: string) {
  const normalized = type.toLowerCase();

  if (normalized.includes("pdf") || ["doc", "docx", "txt", "rtf", "odt"].includes(normalized)) {
    return { Icon: FileText, className: "text-red-400" };
  }
  if (["xls", "xlsx", "csv", "ods"].includes(normalized)) {
    return { Icon: FileSpreadsheet, className: "text-green-400" };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(normalized)) {
    return { Icon: FileArchive, className: "text-amber-400" };
  }
  if (normalized.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(normalized)) {
    return { Icon: ImageIcon, className: "text-blue-400" };
  }

  return { Icon: File, className: "text-zinc-400" };
}

type StorageInsightKey = "images" | "pdfs" | "docs" | "archives" | "other";

function storageInsightKey(type: string): StorageInsightKey {
  const normalized = type.toLowerCase();

  if (normalized.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(normalized)) {
    return "images";
  }
  if (normalized.includes("pdf")) {
    return "pdfs";
  }
  if (["doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv", "ods"].includes(normalized)) {
    return "docs";
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(normalized)) {
    return "archives";
  }
  return "other";
}

export default async function DashboardPage() {
  const user = await requireUser();

  const files = await db.file.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      createdAt: true,
    },
  });
  const favoriteFiles = await db.fileFavorite.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 6,
    select: {
      file: {
        select: {
          id: true,
          name: true,
          type: true,
          lastAccessedAt: true,
        },
      },
    },
  });
  const recentFiles = await db.file.findMany({
    where: {
      userId: user.id,
      lastAccessedAt: {
        not: null,
      },
    },
    orderBy: {
      lastAccessedAt: "desc",
    },
    take: 6,
    select: {
      id: true,
      name: true,
      type: true,
      lastAccessedAt: true,
    },
  });

  const usagePercent = Number(
    (user.storageUsed * BigInt(100)) / (user.storageLimit || BigInt(1)),
  );
  const storageBarColor = usagePercent >= 90 ? "bg-red-500" : "bg-green-500";
  const serializedFiles = files.map((file) => ({
    id: file.id,
    name: file.name,
    size: Number(file.size),
    createdAt: file.createdAt.toISOString(),
  }));
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size), 0);
  const storageBuckets: Record<StorageInsightKey, { label: string; count: number; bytes: number }> = {
    images: { label: "Images", count: 0, bytes: 0 },
    pdfs: { label: "PDFs", count: 0, bytes: 0 },
    docs: { label: "Docs", count: 0, bytes: 0 },
    archives: { label: "Archives", count: 0, bytes: 0 },
    other: { label: "Other", count: 0, bytes: 0 },
  };

  for (const file of files) {
    const key = storageInsightKey(file.type);
    storageBuckets[key].count += 1;
    storageBuckets[key].bytes += Number(file.size);
  }

  const storageInsights = (Object.keys(storageBuckets) as StorageInsightKey[])
    .map((key) => ({
      ...storageBuckets[key],
      percentage: totalBytes > 0 ? (storageBuckets[key].bytes / totalBytes) * 100 : 0,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.bytes - a.bytes);

  return (
    <main className="min-h-screen bg-zinc-100/95 px-6 py-10 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] md:flex-row md:items-center md:justify-between dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Signed in as {user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Link
              href="/dashboard/files"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300/90 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-600 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:text-green-500"
            >
              <FolderOpen className="h-4 w-4" />
              File Explorer
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300/90 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-600 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:text-green-500"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <HardDrive className="h-5 w-5 text-green-500" />
              Storage
            </h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatBytes(user.storageUsed)} / {formatBytes(user.storageLimit)} used
            </p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800/90">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${storageBarColor}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{Math.min(usagePercent, 100)}% used</p>
        </section>

        <section id="upload-section" className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Upload className="h-5 w-5 text-green-500" />
              Upload
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Allowed: Any file type up to 150MB</p>
          </div>
          <UploadForm action={uploadFileAction} initialState={initialFileState} />
        </section>

        <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <h2 className="mb-5 text-lg font-semibold">Your Files</h2>
          <FilesList files={serializedFiles} />
        </section>

        <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Star className="h-5 w-5 text-amber-400" />
              Starred Files
            </h2>
            <Link
              href="/dashboard/files"
              className="text-xs font-semibold uppercase tracking-wide text-zinc-500 transition duration-200 hover:text-green-500"
            >
              Manage
            </Link>
          </div>

          {favoriteFiles.length === 0 ? (
            <p className="text-sm text-zinc-500">No favorites yet. Star files from File Explorer.</p>
          ) : (
            <ul className="space-y-2">
              {favoriteFiles.map((favorite) => {
                const file = favorite.file;
                const { Icon, className } = fileIconMeta(file.type);

                return (
                  <li key={file.id} className="flex items-center justify-between rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 transition duration-200 hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/45 dark:hover:border-zinc-700">
                    <div className="min-w-0 inline-flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${className}`} />
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{file.name}</p>
                    </div>
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <HardDrive className="h-5 w-5 text-zinc-500" />
              Storage Insights
            </h2>
            <p className="text-xs text-zinc-500">{files.length} files</p>
          </div>

          {storageInsights.length === 0 ? (
            <p className="text-sm text-zinc-500">No file data available yet.</p>
          ) : (
            <ul className="space-y-3">
              {storageInsights.map((item) => (
                <li key={item.label} className="rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-900/45">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.count} files • {formatBytes(BigInt(item.bytes))}</p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800/90">
                    <div className="h-2 rounded-full bg-green-500/90 transition-all duration-300" style={{ width: `${Math.max(4, item.percentage)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{item.percentage.toFixed(1)}% of used storage</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Clock3 className="h-5 w-5 text-zinc-500" />
              Recent Files
            </h2>
            <Link
              href="/dashboard/files"
              className="text-xs font-semibold uppercase tracking-wide text-zinc-500 transition duration-200 hover:text-green-500"
            >
              Open Explorer
            </Link>
          </div>

          {recentFiles.length === 0 ? (
            <p className="text-sm text-zinc-500">No recent file access yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentFiles.map((file) => {
                const { Icon, className } = fileIconMeta(file.type);
                return (
                  <li key={file.id} className="flex items-center justify-between rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 transition duration-200 hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/45 dark:hover:border-zinc-700">
                    <div className="min-w-0 inline-flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${className}`} />
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{file.name}</p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {file.lastAccessedAt ? new Date(file.lastAccessedAt).toLocaleString() : "-"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
