"use client";

import { Copy } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import toast from "react-hot-toast";
import { generateManualInvite } from "../actions";
import { initialManualInviteState } from "../action-types";

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Generating..." : "Generate Activation Code"}
    </button>
  );
}

export function ManualInviteForm() {
  const [state, action] = useActionState(generateManualInvite, initialManualInviteState);

  const copyToClipboard = async () => {
    if (!state.code) {
      return;
    }

    await navigator.clipboard.writeText(state.code);
    toast.success("Activation code copied.");
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <h2 className="text-lg font-semibold">Manual Activation Code</h2>
      <p className="mt-1 text-sm text-zinc-400">Generate a 24-hour activation code for any email.</p>

      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="user@example.com"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
          />
        </label>
        <GenerateButton />
      </form>

      {state.error ? <p className="mt-3 text-sm text-red-400">{state.error}</p> : null}

      {state.code && state.email && state.expiresAt ? (
        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Activation code for {state.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-zinc-800 px-2 py-1 text-base font-bold tracking-wider text-green-300">{state.code}</code>
            <button
              type="button"
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:border-green-500 hover:text-green-300"
            >
              <Copy className="h-3.5 w-3.5" /> Copy to Clipboard
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Expires: {new Date(state.expiresAt).toLocaleString()}</p>
        </div>
      ) : null}
    </div>
  );
}
