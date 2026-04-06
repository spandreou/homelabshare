"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteFileForm({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-900/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-300 hover:bg-red-950/50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Delete File</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Are you sure you want to delete this file? This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-zinc-500"
              >
                Cancel
              </button>
              <form action={action}>
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-500"
                >
                  Yes, delete
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
