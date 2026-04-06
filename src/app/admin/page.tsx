import { InviteEmailStatus } from "@prisma/client";
import Link from "next/link";
import {
  approveInviteRequest,
  cleanupOrphanedFilesAction,
  deleteInviteRequest,
  deleteUserByAdminAction,
  getSystemStats,
  resendInviteEmail,
} from "../actions";
import { requireAdmin } from "../../lib/auth";
import { db } from "../../lib/db";
import { AdminApprovalToast } from "./admin-approval-toast";
import { DeleteUserForm } from "./delete-user-form";
import { FormSubmitButton } from "./form-submit-button";
import { ManualInviteForm } from "./ManualInviteForm";
import { SystemStats } from "./SystemStats";

function formatBytes(value: bigint) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    approved?: string;
    resent?: string;
    cleanup?: string;
    deleted?: string;
    inviteDeleted?: string;
    mail?: string;
  }>;
}) {
  const adminUser = await requireAdmin();
  const params = await searchParams;
  const cleanupCount =
    params.cleanup && !Number.isNaN(Number(params.cleanup))
      ? Math.max(0, Number(params.cleanup))
      : null;

  const [systemStats, inviteRequests, recentLogs, storageAggregate, users] = await Promise.all([
    getSystemStats(),
    db.inviteRequest.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        inviteCode: true,
        emailStatus: true,
        emailError: true,
        emailSentAt: true,
        createdAt: true,
      },
    }),
    db.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        fileName: true,
        timestamp: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
    db.user.aggregate({
      _sum: {
        storageUsed: true,
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        storageUsed: true,
        createdAt: true,
        _count: {
          select: {
            files: true,
          },
        },
      },
    }),
  ]);

  const totalStorageUsed = storageAggregate._sum.storageUsed ?? BigInt(0);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <AdminApprovalToast
          approved={params.approved === "1"}
          resent={params.resent === "1"}
          mailSent={params.mail !== "0"}
          inviteDeleted={params.inviteDeleted === "1"}
          deleted={params.deleted === "1" ? "ok" : params.deleted === "self" ? "self" : null}
          cleanupCount={cleanupCount}
        />

        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-green-400">Admin</span> Invite Requests
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Pending requests awaiting approval.</p>
          <Link href="/admin/stats" className="mt-3 inline-block text-sm text-green-400 hover:text-green-300">
            Open System Health Stats
          </Link>
        </header>

        <section className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-600 hover:text-green-400"
          >
            Admin Home
          </Link>
          <Link
            href="/admin/stats"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-600 hover:text-green-400"
          >
            Admin Stats
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-600 hover:text-green-400"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/files"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-600 hover:text-green-400"
          >
            Files Explorer
          </Link>
        </section>

        <SystemStats initialStats={systemStats} />

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="text-sm uppercase tracking-wide text-zinc-500">Total Storage Used</p>
          <p className="mt-2 text-3xl font-bold text-zinc-100">{formatBytes(totalStorageUsed)}</p>
          <p className="mt-1 text-sm text-zinc-400">Combined usage across all users.</p>
          <form action={cleanupOrphanedFilesAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:border-green-600 hover:text-green-400"
            >
              Cleanup Orphaned Upload Files
            </button>
          </form>
        </section>

        <section className="mb-6">
          <ManualInviteForm />
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          {inviteRequests.length === 0 ? (
            <p className="text-zinc-400">No invite requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3">Username</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Activation Code</th>
                    <th className="pb-3">Requested</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteRequests.map((request) => (
                    <tr key={request.id} className="border-b border-zinc-900/70">
                      <td className="py-3 pr-4">{request.username}</td>
                      <td className="py-3 pr-4 text-zinc-300">{request.email}</td>
                      <td className="py-3 pr-4">
                        {request.emailStatus === InviteEmailStatus.SENT ? (
                          <span className="rounded-full bg-green-900/40 px-2 py-1 text-xs font-semibold text-green-300">
                            Email Sent Successfully
                          </span>
                        ) : request.emailStatus === InviteEmailStatus.FAILED ? (
                          <span className="rounded-full bg-amber-900/40 px-2 py-1 text-xs font-semibold text-amber-300">
                            Email Failed
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-300">
                            Waiting Approval
                          </span>
                        )}
                        {request.emailError ? (
                          <p className="mt-1 text-xs text-zinc-500">{request.emailError}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-green-300">
                        {request.inviteCode ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{request.createdAt.toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {request.emailStatus === InviteEmailStatus.SENT ? (
                            <button
                              type="button"
                              disabled
                              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200"
                            >
                              Email Sent Successfully
                            </button>
                          ) : request.emailStatus === InviteEmailStatus.FAILED ? (
                            <form action={resendInviteEmail.bind(null, request.id)} className="inline-block">
                              <FormSubmitButton
                                idleLabel="Resend Email"
                                pendingLabel="Sending email..."
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </form>
                          ) : (
                            <form action={approveInviteRequest.bind(null, request.id)} className="inline-block">
                              <FormSubmitButton
                                idleLabel="Approve"
                                pendingLabel="Sending email..."
                                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </form>
                          )}

                          <form action={deleteInviteRequest.bind(null, request.id)} className="inline-block">
                            <FormSubmitButton
                              idleLabel="Delete"
                              pendingLabel="Deleting..."
                              className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-300 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-5 text-lg font-semibold">Manage Users</h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Files</th>
                  <th className="pb-3">Storage</th>
                  <th className="pb-3">Created</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-zinc-900/70">
                    <td className="py-3 pr-4">{user.email}</td>
                    <td className="py-3 pr-4 text-zinc-300">{user.role}</td>
                    <td className="py-3 pr-4 text-zinc-300">{user._count.files}</td>
                    <td className="py-3 pr-4 text-zinc-300">{formatBytes(user.storageUsed)}</td>
                    <td className="py-3 pr-4 text-zinc-400">{user.createdAt.toLocaleString()}</td>
                    <td className="py-3 text-right">
                      {user.id === adminUser.id ? (
                        <span className="text-xs text-zinc-500">Current Admin</span>
                      ) : (
                        <DeleteUserForm
                          action={deleteUserByAdminAction.bind(null, user.id)}
                          email={user.email}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-5 text-lg font-semibold">Recent Activity</h2>

          {recentLogs.length === 0 ? (
            <p className="text-zinc-400">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3">Action</th>
                    <th className="pb-3">File Name</th>
                    <th className="pb-3">User</th>
                    <th className="pb-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((entry) => (
                    <tr key={entry.id} className="border-b border-zinc-900/70">
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            entry.action === "UPLOAD"
                              ? "bg-green-900/40 text-green-300"
                              : "bg-red-900/40 text-red-300"
                          }`}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{entry.fileName}</td>
                      <td className="py-3 pr-4 text-zinc-300">{entry.user.email}</td>
                      <td className="py-3 pr-4 text-zinc-400">{entry.timestamp.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
