"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import toast from "react-hot-toast";
import { registerAction } from "../actions";
import { initialAuthState } from "../action-types";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-black transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating account..." : "Redeem Invite"}
    </button>
  );
}

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, initialAuthState);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.error && state.error !== lastErrorRef.current) {
      toast.error(state.error);
      lastErrorRef.current = state.error;
    }
  }, [state.error]);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-green-400">Redeem</span> Invite
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Create your account with a valid invite code.</p>

          <form action={formAction} className="mt-6 space-y-4">
            <input
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password (min 8 chars)"
              autoComplete="new-password"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30"
              required
            />
            <input
              name="inviteCode"
              type="text"
              placeholder="Invite Code"
              autoComplete="off"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30"
              required
            />

            {state.error ? (
              <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {state.error}
              </p>
            ) : null}

            <SubmitButton />
          </form>

          <p className="mt-4 text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/" className="text-green-400 hover:text-green-300">
              Go to login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
