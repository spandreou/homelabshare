"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
}) {
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
