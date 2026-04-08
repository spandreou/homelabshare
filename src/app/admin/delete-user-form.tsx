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
        className="rounded-md border border-red-900/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-300 transition duration-200 hover:scale-[1.01] hover:bg-red-950/50 active:scale-[0.98]"
      >
        Delete User
      </button>
    </form>
  );
}
