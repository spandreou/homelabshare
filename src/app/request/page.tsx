"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import toast from "react-hot-toast";
import { requestInvite } from "../actions";
import { initialInviteRequestState } from "../action-types";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-black transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Submitting..." : "Request Invite"}
    </button>
  );
}

export default function RequestPage() {
  const [state, formAction] = useActionState(requestInvite, initialInviteRequestState);
  const lastErrorRef = useRef<string | null>(null);
  const lastSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.error && state.error !== lastErrorRef.current) {
      toast.error(state.error);
      lastErrorRef.current = state.error;
    }
  }, [state.error]);

  useEffect(() => {
    if (state.success && state.success !== lastSuccessRef.current) {
      toast.success(state.success);
      lastSuccessRef.current = state.success;
    }
  }, [state.success]);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-green-400">Invite</span> Request
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Submit your details and wait for admin approval.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <input
              name="username"
              type="text"
              placeholder="Username"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30"
              required
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30"
              required
            />

            {state.error ? (
              <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {state.error}
              </p>
            ) : null}

            {state.success ? (
              <p className="rounded-md border border-green-900/60 bg-green-950/40 px-3 py-2 text-sm text-green-300">
                {state.success}
              </p>
            ) : null}

            <SubmitButton />
          </form>

          <p className="mt-4 text-sm text-zinc-500">
            Already have a code?{" "}
            <Link href="/" className="text-green-400 hover:text-green-300">
              Go to login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
