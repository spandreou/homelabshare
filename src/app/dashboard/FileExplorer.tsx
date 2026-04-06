"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import {
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { initialFileState, initialShareLinkState } from "../action-types";
import { deleteFile, downloadFile, generateShareLink, uploadFile, zipFiles } from "../actions";

type FileExplorerEntry = {
  id: string | null;
  name: string;
  size: number;
  createdAt: string;
  fileType: string;
  ownerFolder: string;
  relativePath: string;
};

type FileExplorerProps = {
  files: FileExplorerEntry[];
  isAdmin: boolean;
};

type SortValue = "date_desc" | "date_asc" | "name_asc" | "name_desc";

type PreviewKind = "image" | "pdf" | "text" | "unsupported";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["txt", "js", "jsx", "ts", "tsx", "md", "json", "css", "html", "yml", "yaml"]);

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

function getPreviewKind(fileType: string): PreviewKind {
  const ext = fileType.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (PDF_EXTENSIONS.has(ext)) {
    return "pdf";
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return "unsupported";
}

function buildPreviewUrl(relativePath: string) {
  return `/api/files/download?path=${encodeURIComponent(relativePath)}&preview=1`;
}

function FileIcon({ fileType, large = false }: { fileType: string; large?: boolean }) {
  const ext = fileType.toLowerCase();
  const iconClass = large ? "h-9 w-9" : "h-4 w-4";

  if (["pdf", "doc", "docx", "txt"].includes(ext)) {
    return <FileText className={`${iconClass} text-red-400`} />;
  }

  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className={`${iconClass} text-green-400`} />;
  }

  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return <FileImage className={`${iconClass} text-blue-400`} />;
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className={`${iconClass} text-amber-400`} />;
  }

  return <FileType className={`${iconClass} text-zinc-400`} />;
}

function UploadButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Uploading..." : "Upload File"}
    </button>
  );
}

function UploadProgress() {
  const { pending } = useFormStatus();
  if (!pending) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-1 text-xs text-zinc-500">Uploading...</div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-800">
        <div className="h-2 w-full animate-pulse rounded-full bg-green-500" />
      </div>
    </div>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-red-700 px-2 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

function DownloadButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:border-green-500 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
    >
      <Download className="h-3.5 w-3.5" />
      {pending ? "Preparing..." : "Download"}
    </button>
  );
}

function DownloadSelectedButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-700 transition hover:border-green-500 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 sm:w-auto"
    >
      {pending ? "Preparing ZIP..." : "Download Selected"}
    </button>
  );
}

function ShareButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:border-green-500 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
    >
      <Share2 className="h-3.5 w-3.5" />
      {pending ? "Sharing..." : "Share"}
    </button>
  );
}

function ShareModal({ url, expiresAt, onClose }: { url: string; expiresAt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-zinc-100">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Share Link Ready</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-sm text-zinc-400">This link expires at {new Date(expiresAt).toLocaleString()}.</p>
        <div className="rounded-md border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs break-all">{url}</div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(url)}
            className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:bg-green-500"
          >
            Copy Link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ file, onClose }: { file: FileExplorerEntry; onClose: () => void }) {
  const previewKind = getPreviewKind(file.fileType);
  const previewUrl = buildPreviewUrl(file.relativePath);
  const [textContent, setTextContent] = useState<string | null>(previewKind === "text" ? null : "");
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (previewKind !== "text") {
      return () => {
        isMounted = false;
      };
    }

    fetch(previewUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load file preview.");
        }
        return response.text();
      })
      .then((content) => {
        if (isMounted) {
          setTextContent(content);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setTextError(error instanceof Error ? error.message : "Could not load file preview.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [previewKind, previewUrl]);

  const loadingText = previewKind === "text" && !textError && textContent === null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{file.name}</h3>
            <p className="text-xs text-zinc-400">{file.fileType.toUpperCase()} • {formatBytes(file.size)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          {previewKind === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto">
              <Image
                src={previewUrl}
                alt={file.name}
                width={1600}
                height={1000}
                unoptimized
                className="h-auto max-h-full w-auto max-w-full rounded-md object-contain"
              />
            </div>
          ) : null}

          {previewKind === "pdf" ? (
            <iframe title={`Preview ${file.name}`} src={previewUrl} className="h-full w-full rounded-md border border-zinc-800" />
          ) : null}

          {previewKind === "text" ? (
            <div className="h-full overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
              {loadingText ? <p className="text-sm text-zinc-400">Loading preview...</p> : null}
              {textError ? <p className="text-sm text-red-400">{textError}</p> : null}
              {!loadingText && !textError && textContent !== null ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-200">{textContent}</pre>
              ) : null}
            </div>
          ) : null}

          {previewKind === "unsupported" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-zinc-400">Preview not available. Please download.</p>
              <a
                href={`/api/files/download?path=${encodeURIComponent(file.relativePath)}`}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-500 hover:text-green-400"
              >
                <Download className="h-3.5 w-3.5" />
                Download File
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FileExplorer({ files, isAdmin }: FileExplorerProps) {
  const [uploadState, uploadAction] = useActionState(uploadFile, initialFileState);
  const [shareState, shareAction] = useActionState(generateShareLink, initialShareLinkState);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("date_desc");
  const [dragActive, setDragActive] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileExplorerEntry | null>(null);

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term ? files.filter((file) => file.name.toLowerCase().includes(term)) : [...files];

    return base.sort((a, b) => {
      if (sortBy === "date_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [files, search, sortBy]);

  const selectedPaths = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([relativePath]) => relativePath),
    [selected],
  );

  const hasSelected = selectedPaths.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {showShareModal && shareState.url && shareState.expiresAt ? (
        <ShareModal url={shareState.url} expiresAt={shareState.expiresAt} onClose={() => setShowShareModal(false)} />
      ) : null}

      {previewFile ? <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} /> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white/90 p-4 dark:border-zinc-800 dark:bg-zinc-950/80 sm:p-6">
        <h2 className="text-lg font-semibold">Upload Zone</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Max file size: 150MB.</p>

        <form action={uploadAction} className="mt-4 space-y-3">
          <label
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDrop={() => setDragActive(false)}
            className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-sm transition ${
              dragActive
                ? "border-green-500 bg-green-500/10 text-green-500"
                : "border-zinc-400 text-zinc-600 hover:border-green-500 hover:text-green-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-green-400"
            }`}
          >
            <UploadCloud className="h-5 w-5" />
            <span className="text-center">Drag and drop to upload, or click to browse</span>
            <input name="file" type="file" className="absolute inset-0 cursor-pointer opacity-0" required />
          </label>
          <UploadButton />
          <UploadProgress />
        </form>

        {uploadState.error ? <p className="mt-3 text-sm text-red-400">{uploadState.error}</p> : null}
        {uploadState.success ? <p className="mt-3 text-sm text-green-400">{uploadState.success}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white/90 p-4 dark:border-zinc-800 dark:bg-zinc-950/80 sm:p-6">
        <div className="mb-4 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Files</h2>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <form action={zipFiles} className="w-full sm:w-auto">
              <input type="hidden" name="paths" value={JSON.stringify(selectedPaths)} />
              <DownloadSelectedButton disabled={!hasSelected} />
            </form>

            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[minmax(220px,1fr)_190px]">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files..."
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortValue)}
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="date_desc">Sort: Newest first</option>
                <option value="date_asc">Sort: Oldest first</option>
                <option value="name_asc">Sort: Name A-Z</option>
                <option value="name_desc">Sort: Name Z-A</option>
              </select>
            </div>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500">No files yet. Drag and drop to upload</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredFiles.map((file) => (
                <article
                  key={file.relativePath}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <FileIcon fileType={file.fileType} large />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{file.name}</p>
                        <p className="text-xs uppercase text-zinc-500">{file.fileType}</p>
                      </div>
                    </button>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[file.relativePath])}
                      onChange={(event) =>
                        setSelected((prev) => ({
                          ...prev,
                          [file.relativePath]: event.target.checked,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1 text-xs text-zinc-500">
                    {isAdmin ? <p>Folder: {file.ownerFolder}</p> : null}
                    <p>Size: {formatBytes(file.size)}</p>
                    <p>Date: {new Date(file.createdAt).toLocaleString()}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <form action={downloadFile.bind(null, file.relativePath)}>
                      <DownloadButton />
                    </form>
                    {isAdmin ? (
                      <form
                        action={async (formData) => {
                          await shareAction(formData);
                          setShowShareModal(true);
                        }}
                      >
                        <input type="hidden" name="fileId" value={file.id ?? ""} />
                        <ShareButton disabled={!file.id} />
                      </form>
                    ) : null}
                    <form action={deleteFile.bind(null, file.relativePath)}>
                      <DeleteButton />
                    </form>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="pb-3 pr-2">Sel</th>
                    <th className="pb-3">Name</th>
                    {isAdmin ? <th className="pb-3">Folder</th> : null}
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Size</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr key={file.relativePath} className="border-b border-zinc-100 dark:border-zinc-900/70">
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[file.relativePath])}
                          onChange={(event) =>
                            setSelected((prev) => ({
                              ...prev,
                              [file.relativePath]: event.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex items-center gap-2 text-left hover:text-green-500"
                        >
                          <FileIcon fileType={file.fileType} />
                          <span className="max-w-[300px] truncate">{file.name}</span>
                        </button>
                      </td>
                      {isAdmin ? <td className="py-3 pr-4 text-zinc-500">{file.ownerFolder}</td> : null}
                      <td className="py-3 pr-4 uppercase text-zinc-500">{file.fileType}</td>
                      <td className="py-3 pr-4 text-zinc-500">{formatBytes(file.size)}</td>
                      <td className="py-3 pr-4 text-zinc-500">{new Date(file.createdAt).toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <form action={downloadFile.bind(null, file.relativePath)}>
                            <DownloadButton />
                          </form>
                          {isAdmin ? (
                            <form
                              action={async (formData) => {
                                await shareAction(formData);
                                setShowShareModal(true);
                              }}
                            >
                              <input type="hidden" name="fileId" value={file.id ?? ""} />
                              <ShareButton disabled={!file.id} />
                            </form>
                          ) : null}
                          <form action={deleteFile.bind(null, file.relativePath)}>
                            <DeleteButton />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
