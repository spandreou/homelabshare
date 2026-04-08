import Link from "next/link";
import { getFiles } from "../../actions";
import { requireUser } from "../../../lib/auth";
import { FileExplorer } from "../FileExplorer";
import { ArrowLeft } from "lucide-react";

export default async function FilesPage() {
  const user = await requireUser();
  const files = await getFiles();

  return (
    <main className="min-h-screen bg-zinc-100/95 px-4 py-6 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">File Explorer</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage files from your secure storage folder.</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300/90 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-600 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:text-green-500 sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </header>

        <FileExplorer
          files={files}
          isAdmin={user.role === "ADMIN"}
        />
      </div>
    </main>
  );
}
