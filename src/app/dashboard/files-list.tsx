"use client";

import { useMemo, useState } from "react";
import { Download, File as FileIcon, FileSpreadsheet, FileText, Search } from "lucide-react";
import { deleteFileAction, downloadFileAction } from "../actions";
import { DeleteFileForm } from "./delete-file-form";

type DashboardFile = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
};

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function getFileTypeMeta(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    return {
      Icon: FileText,
      colorClass: "text-red-400",
    };
  }

  if (extension === "xls" || extension === "xlsx") {
    return {
      Icon: FileSpreadsheet,
      colorClass: "text-green-400",
    };
  }

  if (extension === "doc" || extension === "docx") {
    return {
      Icon: FileText,
      colorClass: "text-blue-400",
    };
  }

  return {
    Icon: FileIcon,
    colorClass: "text-zinc-400",
  };
}

export function FilesList({ files }: { files: DashboardFile[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByDate, setSortByDate] = useState<"newest" | "oldest">("newest");

  const filteredFiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matching = files.filter((file) => {
      if (!normalizedQuery) {
        return true;
      }

      return file.name.toLowerCase().includes(normalizedQuery);
    });

    const sorted = [...matching].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortByDate === "newest" ? bTime - aTime : aTime - bTime;
    });

    return sorted;
  }, [files, searchQuery, sortByDate]);

  if (files.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-100/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
        <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">No files found</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Upload your first document to get started.</p>
        <a
          href="#upload-section"
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black transition duration-200 hover:scale-[1.01] hover:bg-green-500 active:scale-[0.99]"
        >
          Go To Upload
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="flex items-center gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 transition duration-200 dark:border-zinc-700 dark:bg-zinc-900">
          <Search className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search files..."
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </label>

        <select
          value={sortByDate}
          onChange={(event) => setSortByDate(event.target.value as "newest" | "oldest")}
          className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition duration-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="newest">Sort by Date: Newest First</option>
          <option value="oldest">Sort by Date: Oldest First</option>
        </select>
      </div>

      {filteredFiles.length === 0 ? (
        <div className="rounded-xl border border-zinc-300 bg-zinc-100/70 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-zinc-700 dark:text-zinc-300">No files match your search.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredFiles.map((file) => {
              const { Icon, colorClass } = getFileTypeMeta(file.name);

              return (
                <article
                  key={file.id}
                  className="rounded-xl border border-zinc-300 bg-zinc-50/95 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                >
                  <div className="mb-2 inline-flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${colorClass}`} />
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">Size: {formatBytes(file.size)}</p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Uploaded: {new Date(file.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <form action={downloadFileAction.bind(null, file.id)}>
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-500 active:scale-[0.98] sm:text-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </form>
                    <DeleteFileForm action={deleteFileAction.bind(null, file.id)} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Size</th>
                  <th className="pb-3">Uploaded</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const { Icon, colorClass } = getFileTypeMeta(file.name);

                  return (
                    <tr key={file.id} className="border-b border-zinc-200/80 transition-colors duration-200 hover:bg-zinc-50/70 dark:border-zinc-900/70 dark:hover:bg-zinc-900/35">
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${colorClass}`} />
                          <span>{file.name}</span>
                        </span>
                      </td>
                      <td className="py-3 pr-4">{formatBytes(file.size)}</td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">{new Date(file.createdAt).toLocaleString()}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <form action={downloadFileAction.bind(null, file.id)}>
                            <button
                              type="submit"
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-500 active:scale-[0.98] sm:text-xs"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                          </form>
                          <DeleteFileForm action={deleteFileAction.bind(null, file.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
