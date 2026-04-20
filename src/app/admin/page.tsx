import Link from "next/link";
import {
  cleanupOrphanedFilesAction,
  getAutoCleanupPreview,
  getSystemStats,
  runAutoCleanupAction,
  updateAutoCleanupPolicyAction,
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
    autoCleanupUpdated?: string;
    autoCleanupRun?: string;
    autoCleanupFail?: string;
    autoCleanupRunError?: string;
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
  const autoCleanupRunCount =
    params.autoCleanupRun && !Number.isNaN(Number(params.autoCleanupRun))
      ? Math.max(0, Number(params.autoCleanupRun))
      : null;
  const autoCleanupFailCount =
    params.autoCleanupFail && !Number.isNaN(Number(params.autoCleanupFail))
      ? Math.max(0, Number(params.autoCleanupFail))
      : null;
  const autoCleanupRunError =
    params.autoCleanupRunError === "confirm" || params.autoCleanupRunError === "disabled"
      ? params.autoCleanupRunError
      : null;

  const defaultSystemStats = {
    cpuUsagePercent: 0,
    cpuTempC: null,
    ramTotalGb: 0,
    ramUsedGb: 0,
    ramFreeGb: 0,
    ramUsedPercent: 0,
    diskTotalGb: 0,
    diskFreeGb: 0,
    diskUsedPercent: 0,
    uptimeSeconds: 0,
    registeredUsers: 0,
    activeInviteCodes: 0,
    collectedAt: new Date().toISOString(),
  };
  const defaultAutoCleanupPreview = {
    policy: {
      enabled: false,
      maxAgeDays: 30,
      excludeFavorited: true,
    },
    cutoffIso: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    totalCandidates: 0,
    items: [] as Array<{
      id: string;
      name: string;
      ownerEmail: string;
      size: number;
      createdAt: string;
      lastAccessedAt: string | null;
    }>,
  };

  const settled = await Promise.allSettled([
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
    getAutoCleanupPreview(12),
  ]);

  const systemStats = settled[0].status === "fulfilled" ? settled[0].value : defaultSystemStats;
  const inviteRequests = settled[1].status === "fulfilled" ? settled[1].value : [];
  const recentLogs = settled[2].status === "fulfilled" ? settled[2].value : [];
  const storageAggregate =
    settled[3].status === "fulfilled"
      ? settled[3].value
      : {
          _sum: {
            storageUsed: BigInt(0),
          },
        };
  const users = settled[4].status === "fulfilled" ? settled[4].value : [];
  const activeSessions = settled[5].status === "fulfilled" ? settled[5].value : [];
  const autoCleanupPreview = settled[6].status === "fulfilled" ? settled[6].value : defaultAutoCleanupPreview;

  const totalStorageUsed = storageAggregate._sum.storageUsed ?? BigInt(0);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <AdminApprovalToast
          approved={params.approved === "1"}
          resent={params.resent === "1"}
          mailSent={params.mail !== "0"}
          inviteDeleted={params.inviteDeleted === "1"}
          deleted={
            params.deleted === "1"
              ? "ok"
              : params.deleted === "self"
                ? "self"
                : params.deleted === "last-admin"
                  ? "last-admin"
                  : null
          }
          cleanupCount={cleanupCount}
          autoCleanupUpdated={params.autoCleanupUpdated === "1"}
          autoCleanupRunCount={autoCleanupRunCount}
          autoCleanupFailCount={autoCleanupFailCount}
          autoCleanupRunError={autoCleanupRunError}
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

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-zinc-500">Auto-Clean Policy</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-100">Old File Retention Cleanup</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Manual admin trigger with preview. Disabled by default for safety.
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                autoCleanupPreview.policy.enabled
                  ? "bg-green-900/40 text-green-300"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {autoCleanupPreview.policy.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <form action={updateAutoCleanupPolicyAction} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" name="enabled" defaultChecked={autoCleanupPreview.policy.enabled} />
              Enable auto-clean policy
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" name="excludeFavorited" defaultChecked={autoCleanupPreview.policy.excludeFavorited} />
              Protect favorited/starred files
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Delete files older than (days)</span>
              <input
                type="number"
                name="maxAgeDays"
                min={1}
                max={3650}
                defaultValue={autoCleanupPreview.policy.maxAgeDays}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-green-500"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition duration-200 hover:scale-[1.01] hover:border-green-600 hover:text-green-400 active:scale-[0.98]"
              >
                Save Policy
              </button>
            </div>
          </form>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-sm text-zinc-300">
              Dry run preview:{" "}
              <span className="font-semibold text-zinc-100">{autoCleanupPreview.totalCandidates}</span> candidate file(s) older than{" "}
              <span className="font-semibold text-zinc-100">{autoCleanupPreview.policy.maxAgeDays}</span> days
              {autoCleanupPreview.policy.excludeFavorited ? " (favorites excluded)." : "."}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Cutoff date: {new Date(autoCleanupPreview.cutoffIso).toLocaleString()}
            </p>
            {autoCleanupPreview.items.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No files currently match this cleanup policy.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {autoCleanupPreview.items.map((item) => (
                  <li key={item.id} className="rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="max-w-[65%] truncate font-medium text-zinc-200">{item.name}</p>
                      <p className="text-xs text-zinc-500">{formatBytes(BigInt(item.size))}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      Owner: {item.ownerEmail} • Created: {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <form action={runAutoCleanupAction} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                  Safety confirmation (type CLEANUP to run)
                </label>
                <input
                  type="text"
                  name="confirm"
                  required
                  placeholder="CLEANUP"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-500"
                />
              </div>
              <button
                type="submit"
                className="rounded-md border border-red-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-300 transition duration-200 hover:scale-[1.01] hover:bg-red-950/40 active:scale-[0.98]"
              >
                Run Cleanup Now
              </button>
              <p className="text-xs text-zinc-500">
                Manual run only. This action is destructive and currently processes up to 500 files per run.
              </p>
            </form>
          </div>
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
