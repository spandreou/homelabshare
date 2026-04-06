"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Unexpected Error</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          <span className="text-green-400">homeLab</span>Share hit a problem
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Something went wrong while loading this page. Please try again.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-zinc-500">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black hover:bg-green-500"
          >
            Retry
          </button>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-zinc-100 hover:border-green-600"
          >
            Go Home
          </Link>
        </div>
      </section>
    </main>
  );
}
