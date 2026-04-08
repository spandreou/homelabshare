import Link from "next/link";
import {
  cleanupOrphanedFilesAction,
  getSystemStats,
} from "../actions";
import { requireAdmin } from "../../lib/auth";
import { db } from "../../lib/db";
import { AdminApprovalToast } from "./admin-approval-toast";
import { AdminDataTables } from "./AdminDataTables";
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
  const now = new Date();
  const onlineCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const params = await searchParams;
  const cleanupCount =
    params.cleanup && !Number.isNaN(Number(params.cleanup))
      ? Math.max(0, Number(params.cleanup))
      : null;

  const [systemStats, inviteRequests, recentLogs, storageAggregate, users, activeSessions] = await Promise.all([
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
    db.activeSession.findMany({
      where: {
        expiresAt: { gt: now },
        lastSeen: { gte: onlineCutoff },
      },
      select: {
        userId: true,
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
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
          >
            Admin Home
          </Link>
          <Link
            href="/admin/stats"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
          >
            Admin Stats
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/files"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
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
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
            >
              Cleanup Orphaned Upload Files
            </button>
          </form>
        </section>

        <section className="mb-6">
          <ManualInviteForm />
        </section>

        <AdminDataTables
          inviteRequests={inviteRequests.map((request) => ({
            id: request.id,
            username: request.username,
            email: request.email,
            status: request.status,
            inviteCode: request.inviteCode ?? null,
            emailStatus: request.emailStatus,
            emailError: request.emailError ?? null,
            emailSentAt: request.emailSentAt ? request.emailSentAt.toISOString() : null,
            createdAt: request.createdAt.toISOString(),
          }))}
          users={users.map((user) => ({
            id: user.id,
            email: user.email,
            role: user.role,
            filesCount: user._count.files,
            storageUsed: user.storageUsed.toString(),
            createdAt: user.createdAt.toISOString(),
          }))}
          recentLogs={recentLogs.map((entry) => ({
            id: entry.id,
            action: entry.action,
            fileName: entry.fileName,
            userEmail: entry.user.email,
            timestamp: entry.timestamp.toISOString(),
          }))}
          adminUserId={adminUser.id}
          activeUserIds={Array.from(new Set(activeSessions.map((session) => session.userId)))}
        />
      </div>
    </main>
  );
}
