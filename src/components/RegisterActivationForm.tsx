"use client";

import { useActionState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { registerAction } from "../app/actions";
import { initialAuthState } from "../app/action-types";
import { PendingSubmitButton } from "./PendingSubmitButton";

export function RegisterActivationForm() {
  const [registerState, registerFormAction] = useActionState(registerAction, initialAuthState);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (registerState.error && registerState.error !== lastErrorRef.current) {
      toast.error(registerState.error);
      lastErrorRef.current = registerState.error;
    }
  }, [registerState.error]);

  return (
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

      <PendingSubmitButton idleLabel="Redeem Activation" pendingLabel="Creating account..." />
    </form>
  );
}
