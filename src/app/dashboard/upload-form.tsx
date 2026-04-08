"use client";

import { useRef, useState } from "react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { FileUp, UploadCloud } from "lucide-react";
import toast from "react-hot-toast";
import type { FileActionState } from "../action-types";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-black transition duration-200 hover:scale-[1.01] hover:bg-green-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>
      {pending ? (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-100/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="h-2 w-full animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-2 w-4/5 animate-pulse rounded bg-zinc-300/80 dark:bg-zinc-700/80" />
        </div>
      ) : null}
    </div>
  );
}

export function UploadForm({
  action,
  initialState,
}: {
  action: (state: FileActionState, formData: FormData) => Promise<FileActionState>;
  initialState: FileActionState;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state.success]);

  function setFileFromList(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const file = fileList[0];
    setSelectedFile(file.name);

    if (!inputRef.current) {
      return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
  }

  return (
    <form action={formAction} className="space-y-5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          setFileFromList(event.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed bg-zinc-50 p-6 text-center transition duration-200 dark:bg-zinc-950/70 ${
          isDragOver ? "border-green-500" : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
        }`}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
          {isDragOver ? <FileUp className="h-6 w-6 text-green-500" /> : <UploadCloud className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />}
        </div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Drag & drop your file here, or click to browse
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Any file type up to 150MB</p>
        {selectedFile ? <p className="mt-3 text-xs text-green-400">Selected: {selectedFile}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        name="file"
        className="hidden"
        onChange={(event) => setFileFromList(event.target.files)}
        required
      />

      {state.error ? (
        <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-md border border-green-900/60 bg-green-950/30 px-3 py-2 text-sm text-green-300">
          {state.success}
        </p>
      ) : null}

      <UploadButton />
    </form>
  );
}
