"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import toast from "react-hot-toast";
import { loginAction, registerAction } from "../app/actions";
import { initialAuthState } from "../app/action-types";
import Lightfall from "./Lightfall";
import { ThemeSwitcher } from "./ThemeSwitcher";

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-black transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export default function LandingClient() {
  const [loginState, loginFormAction] = useActionState(loginAction, initialAuthState);
  const [registerState, registerFormAction] = useActionState(registerAction, initialAuthState);
  const lastLoginErrorRef = useRef<string | null>(null);
  const lastRegisterErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (loginState.error && loginState.error !== lastLoginErrorRef.current) {
      toast.error(loginState.error);
      lastLoginErrorRef.current = loginState.error;
    }
  }, [loginState.error]);

  useEffect(() => {
    if (registerState.error && registerState.error !== lastRegisterErrorRef.current) {
      toast.error(registerState.error);
      lastRegisterErrorRef.current = registerState.error;
    }
  }, [registerState.error]);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#061066] px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <div aria-hidden="true" className="absolute inset-0 z-0">
        <Lightfall
          colors={["#A6C8FF", "#5227FF", "#FF9FFC"]}
          backgroundColor="#0A29FF"
          speed={0.5}
          streakCount={3}
          streakWidth={1}
          streakLength={1}
          glow={0.8}
          density={0.7}
          twinkle={1}
          zoom={2.3}
          backgroundGlow={0.3}
          opacity={1}
          mouseInteraction={false}
          mouseStrength={0.5}
          mouseRadius={0.65}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),rgba(255,255,255,0.28)_35%,rgba(7,10,48,0.42)_78%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(7,10,48,0.18)_36%,rgba(2,4,24,0.58)_82%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center">
        <header className="mb-10 text-center">
          <div className="mb-4 flex justify-end">
            <ThemeSwitcher />
          </div>
          <h1 className="text-4xl font-bold tracking-tight transition-shadow dark:drop-shadow-[0_0_22px_rgba(34,197,94,0.45)] sm:text-5xl">
            <span className="text-green-600">homeLab</span>Share
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">Private Cloud Storage with invite-only access</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Need an activation code?{" "}
            <Link href="/request" className="text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300">
              Request access
            </Link>
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="text-xl font-semibold">Login</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">For existing members.</p>

            <form action={loginFormAction} className="mt-6 space-y-4">
              <input
                name="email"
                type="email"
                placeholder="Email"
                autoComplete="email"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />

              {loginState.error ? (
                <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {loginState.error}
                </p>
              ) : null}

              <SubmitButton idleLabel="Login" pendingLabel="Signing in..." />
            </form>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="text-xl font-semibold">Redeem Activation</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Create a new account with your email and activation code.</p>

            <form action={registerFormAction} className="mt-6 space-y-4">
              <input
                name="email"
                type="email"
                placeholder="Email"
                autoComplete="email"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password (min 8 chars)"
                autoComplete="new-password"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />
              <input
                name="inviteCode"
                type="text"
                placeholder="Activation Code"
                autoComplete="off"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />

              {registerState.error ? (
                <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {registerState.error}
                </p>
              ) : null}

              <SubmitButton idleLabel="Redeem Activation" pendingLabel="Creating account..." />
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
