import { initialFileState } from "../action-types";
import { logoutAction, uploadFileAction } from "../actions";
import { requireUser } from "../../lib/auth";
import { ThemeSwitcher } from "../../components/ThemeSwitcher";
import { db } from "../../lib/db";
import { FilesList } from "./files-list";
import { UploadForm } from "./upload-form";
import { HardDrive, LogOut, Upload, FolderOpen } from "lucide-react";
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

export default async function DashboardPage() {
  const user = await requireUser();

  const files = await db.file.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      size: true,
      createdAt: true,
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

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/90 p-6 md:flex-row md:items-center md:justify-between dark:border-zinc-800 dark:bg-zinc-950/80">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Signed in as {user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Link
              href="/dashboard/files"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-green-600 hover:text-green-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-green-500"
            >
              <FolderOpen className="h-4 w-4" />
              File Explorer
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-green-600 hover:text-green-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-green-500"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <HardDrive className="h-5 w-5 text-green-500" />
              Storage
            </h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatBytes(user.storageUsed)} / {formatBytes(user.storageLimit)} used
            </p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-800">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${storageBarColor}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{Math.min(usagePercent, 100)}% used</p>
        </section>

        <section id="upload-section" className="rounded-2xl border border-zinc-200 bg-white/90 p-6 dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Upload className="h-5 w-5 text-green-500" />
              Upload
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Allowed: Any file type up to 150MB</p>
          </div>
          <UploadForm action={uploadFileAction} initialState={initialFileState} />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 dark:border-zinc-800 dark:bg-zinc-950/80">
          <h2 className="mb-5 text-lg font-semibold">Your Files</h2>
          <FilesList files={serializedFiles} />
        </section>
      </div>
    </main>
  );
}
