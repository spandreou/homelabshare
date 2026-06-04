"use client";

export function DeleteUserForm({
  action,
  email,
}: {
  action: () => Promise<void>;
  email: string;
}) {
  return (
    <form
      className="inline-block"
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete user ${email} and all uploaded files? This cannot be undone.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-300 hover:bg-red-900/40"
      >
        Delete
      </button>
    </form>
  );
}
