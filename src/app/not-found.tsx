import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          <span className="text-green-400">homeLab</span>Share page not found
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black hover:bg-green-500"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-zinc-100 hover:border-green-600"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
