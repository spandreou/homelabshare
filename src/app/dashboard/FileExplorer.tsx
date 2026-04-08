"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  MoreVertical,
  Share2,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { initialShareLinkState } from "../action-types";
import { deleteFile, downloadFile, generateShareLink, toggleFavoriteAction, zipFiles } from "../actions";

type FileExplorerEntry = {
  id: string | null;
  name: string;
  size: number;
  createdAt: string;
  fileType: string;
  ownerFolder: string;
  relativePath: string;
  isFavorite: boolean;
};

type FileExplorerProps = {
  files: FileExplorerEntry[];
  isAdmin: boolean;
};

type SortValue = "date_desc" | "date_asc" | "name_asc" | "name_desc";

type PreviewKind = "image" | "pdf" | "text" | "unsupported";
type UploadStatus = "queued" | "uploading" | "success" | "failed";
type FileCategory = "pdf" | "image" | "zip" | "doc" | "spreadsheet" | "generic";

type UploadQueueItem = {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: UploadStatus;
  error: string | null;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["txt", "js", "jsx", "ts", "tsx", "md", "json", "css", "html", "yml", "yaml"]);
const ZIP_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2"]);
const DOC_EXTENSIONS = new Set(["doc", "docx", "txt", "rtf", "odt"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "ods"]);

function getFileCategory(fileType: string): FileCategory {
  const normalized = fileType.trim().toLowerCase();
  const maybeExt = normalized.includes("/") ? normalized.split("/").pop() ?? normalized : normalized;

  if (normalized.startsWith("image/") || IMAGE_EXTENSIONS.has(maybeExt)) {
    return "image";
  }
  if (normalized === "application/pdf" || PDF_EXTENSIONS.has(maybeExt)) {
    return "pdf";
  }
  if (ZIP_EXTENSIONS.has(maybeExt)) {
    return "zip";
  }
  if (SPREADSHEET_EXTENSIONS.has(maybeExt)) {
    return "spreadsheet";
  }
  if (DOC_EXTENSIONS.has(maybeExt)) {
    return "doc";
  }
  return "generic";
}

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

function buildPreviewUrl(relativePath: string, options?: { thumbnail?: boolean }) {
  const params = new URLSearchParams({
    path: relativePath,
    preview: "1",
  });
  if (options?.thumbnail) {
    params.set("thumbnail", "1");
  }
  return `/api/files/download?${params.toString()}`;
}

function FileIcon({ fileType, large = false }: { fileType: string; large?: boolean }) {
  const category = getFileCategory(fileType);
  const iconClass = large ? "h-9 w-9" : "h-4 w-4";

  if (category === "pdf" || category === "doc") {
    return <FileText className={`${iconClass} text-red-400`} />;
  }

  if (category === "spreadsheet") {
    return <FileSpreadsheet className={`${iconClass} text-green-400`} />;
  }

  if (category === "image") {
    return <FileImage className={`${iconClass} text-blue-400`} />;
  }

  if (category === "zip") {
    return <FileArchive className={`${iconClass} text-amber-400`} />;
  }

  return <FileType className={`${iconClass} text-zinc-400`} />;
}

function FileVisual({
  file,
  large = false,
}: {
  file: Pick<FileExplorerEntry, "fileType" | "relativePath" | "name">;
  large?: boolean;
}) {
  const category = getFileCategory(file.fileType);
  const [thumbError, setThumbError] = useState(false);

  if (category !== "image" || thumbError) {
    return <FileIcon fileType={file.fileType} large={large} />;
  }

  const sizeClass = large ? "h-11 w-11" : "h-8 w-8";

  return (
    <span className={`relative overflow-hidden rounded-md border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 ${sizeClass}`}>
      <Image
        src={buildPreviewUrl(file.relativePath, { thumbnail: true })}
        alt={file.name}
        fill
        unoptimized
        sizes={large ? "44px" : "32px"}
        className="object-cover"
        onError={() => setThumbError(true)}
      />
    </span>
  );
}

function UploadButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black shadow-sm transition duration-200 hover:scale-[1.01] hover:bg-green-500 hover:shadow-[0_0_0_1px_rgba(34,197,94,0.45)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {label}
    </button>
  );
}

function UploadStatusBadge({ status }: { status: UploadStatus }) {
  if (status === "queued") {
    return <span className="rounded-full border border-zinc-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">Queued</span>;
  }
  if (status === "uploading") {
    return <span className="rounded-full border border-blue-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">Uploading</span>;
  }
  if (status === "success") {
    return <span className="rounded-full border border-green-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-300">Success</span>;
  }
  return <span className="rounded-full border border-red-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">Failed</span>;
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-red-700/85 px-3 py-2 text-[11px] font-semibold text-red-300 transition duration-200 hover:scale-[1.01] hover:bg-red-900/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
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
      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-zinc-300/90 bg-white/70 px-3 py-2 text-[11px] font-semibold text-zinc-700 transition duration-200 hover:scale-[1.01] hover:border-green-500 hover:text-green-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 sm:text-xs"
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
      className="w-full rounded-md border border-zinc-300/90 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-700 shadow-sm transition duration-200 hover:scale-[1.01] hover:border-green-500 hover:text-green-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 sm:w-auto"
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
      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-zinc-300/90 bg-white/70 px-3 py-2 text-[11px] font-semibold text-zinc-700 transition duration-200 hover:scale-[1.01] hover:border-green-500 hover:text-green-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 sm:text-xs"
    >
      <Share2 className="h-3.5 w-3.5" />
      {pending ? "Sharing..." : "Share"}
    </button>
  );
}

function FavoriteButton({ isFavorite, disabled }: { isFavorite: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Unstar file" : "Star file"}
      className={`inline-flex min-h-9 items-center gap-1 rounded-md border px-3 py-2 text-[11px] font-semibold transition duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs ${
        isFavorite
          ? "border-amber-500/80 bg-amber-500/10 text-amber-400"
          : "border-zinc-300/90 bg-white/70 text-zinc-700 hover:border-amber-400 hover:text-amber-400 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200"
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-amber-400" : ""}`} />
      {pending ? "Saving..." : isFavorite ? "Starred" : "Star"}
    </button>
  );
}

function ShareModal({ url, expiresAt, onClose }: { url: string; expiresAt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700/90 bg-zinc-950/95 p-6 text-zinc-100 shadow-xl shadow-black/35 backdrop-blur-[2px]">
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

function MobileActionSheet({
  file,
  isAdmin,
  onClose,
  onShare,
}: {
  file: FileExplorerEntry;
  isAdmin: boolean;
  onClose: () => void;
  onShare: (formData: FormData) => Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${file.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 h-1.5 w-10 rounded-full bg-zinc-700 mx-auto" />
        <p className="mb-3 truncate text-sm font-semibold text-zinc-200">{file.name}</p>
        <div className="grid gap-2">
          <form action={toggleFavoriteAction.bind(null, file.id ?? "")}>
            <button
              type="submit"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition duration-200 active:scale-[0.98]"
            >
              <Star className={`h-4 w-4 ${file.isFavorite ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
              {file.isFavorite ? "Remove Favorite" : "Add Favorite"}
            </button>
          </form>
          <form action={downloadFile.bind(null, file.relativePath)}>
            <button
              type="submit"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition duration-200 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </form>
          {isAdmin ? (
            <form
              action={async (formData) => {
                await onShare(formData);
                onClose();
              }}
            >
              <input type="hidden" name="fileId" value={file.id ?? ""} />
              <button
                type="submit"
                disabled={!file.id}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </form>
          ) : null}
          <form action={deleteFile.bind(null, file.relativePath)}>
            <button
              type="submit"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-red-700/80 bg-red-950/20 px-3 py-2 text-sm font-semibold text-red-300 transition duration-200 active:scale-[0.98]"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </form>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition duration-200 active:scale-[0.98]"
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
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(previewKind === "pdf" ? null : "");
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;
    let createdUrl: string | null = null;

    if (previewKind !== "pdf") {
      return () => {
        isMounted = false;
      };
    }

    fetch(previewUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load PDF preview.");
        }
        return response.blob();
      })
      .then((blob) => {
        if (!isMounted) {
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(createdUrl);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setPdfError(error instanceof Error ? error.message : "Could not load PDF preview.");
        }
      });

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [previewKind, previewUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const loadingText = previewKind === "text" && !textError && textContent === null;
  const loadingPdf = previewKind === "pdf" && !pdfError && pdfObjectUrl === null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.name}`}
        onClick={(event) => event.stopPropagation()}
      >
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
            <div className="h-full rounded-md border border-zinc-800 bg-zinc-950 p-2">
              {loadingPdf ? (
                <div className="space-y-2 animate-pulse p-2">
                  <div className="h-3 w-24 rounded bg-zinc-800/70" />
                  <div className="h-[calc(100%-1.5rem)] w-full rounded bg-zinc-800/50" />
                </div>
              ) : null}
              {pdfError ? <p className="p-3 text-sm text-red-400">{pdfError}</p> : null}
              {!loadingPdf && !pdfError && pdfObjectUrl ? (
                <iframe
                  title={`Preview ${file.name}`}
                  src={pdfObjectUrl}
                  className="h-full w-full rounded border border-zinc-800"
                />
              ) : null}
              {!loadingPdf && !pdfObjectUrl ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-zinc-400">PDF preview is not available in this browser.</p>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-500 hover:text-green-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Open PDF
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {previewKind === "text" ? (
            <div className="h-full overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
              {loadingText ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-24 rounded bg-zinc-800/70" />
                  <div className="h-3 w-full rounded bg-zinc-800/60" />
                  <div className="h-3 w-[88%] rounded bg-zinc-800/60" />
                  <div className="h-3 w-[70%] rounded bg-zinc-800/60" />
                </div>
              ) : null}
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
  const router = useRouter();
  const [shareState, shareAction] = useActionState(generateShareLink, initialShareLinkState);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("date_desc");
  const [dragActive, setDragActive] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<UploadQueueItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileExplorerEntry | null>(null);
  const [mobileActionFile, setMobileActionFile] = useState<FileExplorerEntry | null>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const globalDragDepthRef = useRef(0);
  const queuedFilesRef = useRef<Array<{ id: string; file: File }>>([]);
  const uploadLoopActiveRef = useRef(false);

  const hasFilePayload = useCallback((event: DragEvent) => event.dataTransfer?.types?.includes("Files") ?? false, []);

  const runUploadForItem = useCallback(async (itemId: string, file: File) => {
    await new Promise<void>((resolve, reject) => {
      const formData = new FormData();
      formData.set("file", file);

      const request = new XMLHttpRequest();
      request.open("POST", "/api/files/upload");
      request.responseType = "json";

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
        setQueueItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId
              ? {
                  ...entry,
                  progress,
                }
              : entry,
          ),
        );
      };

      request.onerror = () => {
        reject(new Error("Upload failed. Please try again."));
      };

      request.onload = () => {
        if (request.status < 200 || request.status >= 300) {
          const response = request.response as { error?: string } | null;
          reject(new Error(response?.error ?? "Upload failed. Please try again."));
          return;
        }
        resolve();
      };

      request.send(formData);
    });
  }, []);

  const processUploadQueue = useCallback(async () => {
    if (uploadLoopActiveRef.current) {
      return;
    }

    uploadLoopActiveRef.current = true;
    let uploadedCount = 0;

    while (queuedFilesRef.current.length > 0) {
      const next = queuedFilesRef.current.shift();
      if (!next) {
        continue;
      }

      setQueueItems((prev) =>
        prev.map((entry) =>
          entry.id === next.id
            ? {
                ...entry,
                status: "uploading",
                progress: 0,
              }
            : entry,
        ),
      );

      try {
        await runUploadForItem(next.id, next.file);
        uploadedCount += 1;
        setQueueItems((prev) =>
          prev.map((entry) =>
            entry.id === next.id
              ? {
                  ...entry,
                  status: "success",
                  progress: 100,
                  error: null,
                }
              : entry,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
        setQueueItems((prev) =>
          prev.map((entry) =>
            entry.id === next.id
              ? {
                  ...entry,
                  status: "failed",
                  error: message,
                }
              : entry,
          ),
        );
      }
    }

    uploadLoopActiveRef.current = false;

    if (uploadedCount > 0) {
      setUploadSuccess(uploadedCount === 1 ? "1 file uploaded successfully." : `${uploadedCount} files uploaded successfully.`);
      router.refresh();
      return;
    }

    setUploadSuccess(null);
  }, [router, runUploadForItem]);

  const enqueueFilesForUpload = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !uploadInputRef.current) {
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setDropNotice(null);

    const incomingFiles = Array.from(fileList);
    const supportsMultiple = uploadInputRef.current.multiple;
    const selectedFiles = supportsMultiple ? incomingFiles : [incomingFiles[0]];

    if (!supportsMultiple && incomingFiles.length > 1) {
      setDropNotice("Multiple files detected. Uploading the first file because current input is single-file.");
    }

    const dt = new DataTransfer();
    for (const file of selectedFiles) {
      dt.items.add(file);
    }

    uploadInputRef.current.files = dt.files;
    const items: Array<{ id: string; file: File }> = selectedFiles.map((file) => ({
      id: `${Date.now()}-${crypto.randomUUID()}`,
      file,
    }));

    queuedFilesRef.current.push(...items);
    setQueueItems((prev) => [
      ...prev,
      ...items.map((item) => ({
        id: item.id,
        fileName: item.file.name,
        fileSize: item.file.size,
        progress: 0,
        status: "queued" as const,
        error: null,
      })),
    ]);
    uploadInputRef.current.value = "";

    void processUploadQueue().catch(() => {
      setUploadError("Upload queue failed unexpectedly. Please retry.");
    });
  }, [processUploadQueue]);

  useEffect(() => {
    const onWindowDragEnter = (event: DragEvent) => {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      globalDragDepthRef.current += 1;
      setDragActive(true);
    };

    const onWindowDragOver = (event: DragEvent) => {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onWindowDragLeave = (event: DragEvent) => {
      if (!hasFilePayload(event)) {
        return;
      }
      event.preventDefault();
      globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
      if (globalDragDepthRef.current === 0) {
        setDragActive(false);
      }
    };

      const onWindowDrop = (event: DragEvent) => {
        if (!hasFilePayload(event)) {
          return;
        }
        event.preventDefault();
        globalDragDepthRef.current = 0;
        setDragActive(false);
        enqueueFilesForUpload(event.dataTransfer?.files ?? null);
      };

    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);

    return () => {
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
      globalDragDepthRef.current = 0;
    };
  }, [enqueueFilesForUpload, hasFilePayload]);

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
      <div
        aria-hidden={!dragActive}
        className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-green-500/8 p-4 transition-opacity duration-200 ${
          dragActive ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="rounded-xl border border-green-500/45 bg-zinc-950/90 px-5 py-4 text-center text-sm font-semibold text-green-300 shadow-lg shadow-black/30 backdrop-blur-[3px]">
          Drop files to upload
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {dragActive ? "File drop zone active" : "File drop zone inactive"}
      </p>

      {showShareModal && shareState.url && shareState.expiresAt ? (
        <ShareModal url={shareState.url} expiresAt={shareState.expiresAt} onClose={() => setShowShareModal(false)} />
      ) : null}

      {previewFile ? <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} /> : null}
      {mobileActionFile ? (
        <MobileActionSheet
          file={mobileActionFile}
          isAdmin={isAdmin}
          onClose={() => setMobileActionFile(null)}
          onShare={async (formData) => {
            await shareAction(formData);
            setShowShareModal(true);
          }}
        />
      ) : null}

      <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20 sm:p-6">
        <h2 className="text-lg font-semibold">Upload Zone</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Max file size: 150MB.</p>

        <form
          ref={uploadFormRef}
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            enqueueFilesForUpload(uploadInputRef.current?.files ?? null);
            if (!uploadInputRef.current?.files?.length) {
              setUploadError("Please choose at least one file.");
            }
          }}
        >
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              globalDragDepthRef.current = 0;
              enqueueFilesForUpload(event.dataTransfer.files);
            }}
            className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-sm transition duration-200 ${
              dragActive
                ? "border-green-500 bg-green-500/8 text-green-600 shadow-[0_0_0_1px_rgba(34,197,94,0.35)] dark:text-green-400"
                : "border-zinc-300/90 text-zinc-600 hover:border-green-500 hover:text-green-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-green-400"
            }`}
          >
            <UploadCloud className="h-5 w-5" />
            <span className="text-center">Drag and drop to upload, or click to browse</span>
            <input ref={uploadInputRef} name="file" type="file" multiple className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <UploadButton
            disabled={queueItems.some((item) => item.status === "uploading")}
            label={queueItems.some((item) => item.status === "uploading") ? "Uploading..." : "Upload File(s)"}
          />
        </form>

        {queueItems.length > 0 ? (
          <div className="mt-4 space-y-2">
            {queueItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-200/90 bg-zinc-50/90 p-3 transition duration-200 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.fileName}</p>
                    <p className="text-xs text-zinc-500">{formatBytes(item.fileSize)}</p>
                  </div>
                  <UploadStatusBadge status={item.status} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800/90">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      item.status === "failed"
                        ? "bg-red-500"
                        : item.status === "success"
                          ? "bg-green-500"
                          : item.status === "uploading"
                            ? "bg-blue-500"
                            : "bg-zinc-500"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.error ? <p className="mt-1 text-xs text-red-400">{item.error}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {dropNotice ? <p className="mt-3 text-sm text-amber-400">{dropNotice}</p> : null}
        {uploadError ? <p className="mt-3 text-sm text-red-400">{uploadError}</p> : null}
        {uploadSuccess ? <p className="mt-3 text-sm text-green-400">{uploadSuccess}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-sm backdrop-blur-[2px] dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/20 sm:p-6">
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
                className="w-full rounded-md border border-zinc-300/90 bg-zinc-50/95 px-3 py-2 text-sm outline-none transition duration-200 focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortValue)}
                className="w-full rounded-md border border-zinc-300/90 bg-zinc-50/95 px-3 py-2 text-sm outline-none transition duration-200 focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-900"
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
          <div className="rounded-xl border border-dashed border-zinc-300/90 bg-zinc-50/70 p-8 text-center dark:border-zinc-700/80 dark:bg-zinc-900/45">
            <p className="text-sm text-zinc-500">No files yet. Drag and drop to upload</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3.5 md:hidden">
              {filteredFiles.map((file) => (
                <article
                  key={file.relativePath}
                  className="group rounded-xl border border-zinc-200/90 bg-white/95 p-4 shadow-sm transition-all duration-200 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:shadow-black/15 dark:hover:border-zinc-700"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <FileVisual file={file} large />
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

                  <div className="mt-4 flex items-center justify-between gap-2.5 transition-all duration-200">
                    <button
                      type="button"
                      onClick={() => setMobileActionFile(file)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 active:scale-[0.98]"
                      aria-label={`Open actions for ${file.name}`}
                      aria-haspopup="dialog"
                    >
                      <MoreVertical className="h-4 w-4" />
                      Actions
                    </button>
                    {file.isFavorite ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/90 text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-400">
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
                    <tr
                      key={file.relativePath}
                      tabIndex={0}
                      className="group border-b border-zinc-100/90 transition-colors duration-200 hover:bg-zinc-50/75 focus-within:bg-zinc-50/75 focus:outline-none dark:border-zinc-900/70 dark:hover:bg-zinc-900/45 dark:focus-within:bg-zinc-900/45"
                    >
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
                          <FileVisual file={file} />
                          <span className="max-w-[300px] truncate">{file.name}</span>
                          {file.isFavorite ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}
                        </button>
                      </td>
                      {isAdmin ? <td className="py-3 pr-4 text-zinc-500">{file.ownerFolder}</td> : null}
                      <td className="py-3 pr-4 uppercase text-zinc-500">{file.fileType}</td>
                      <td className="py-3 pr-4 text-zinc-500">{formatBytes(file.size)}</td>
                      <td className="py-3 pr-4 text-zinc-500">{new Date(file.createdAt).toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2 md:opacity-0 md:translate-y-0.5 md:scale-[0.98] md:transition-all md:duration-200 md:group-hover:opacity-100 md:group-hover:translate-y-0 md:group-hover:scale-100 md:group-focus-within:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:scale-100">
                          <form action={toggleFavoriteAction.bind(null, file.id ?? "")}>
                            <FavoriteButton isFavorite={file.isFavorite} disabled={!file.id} />
                          </form>
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
