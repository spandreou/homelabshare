import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Activity, Database, HardDrive, Users } from "lucide-react";
import { requireAdmin } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { UPLOAD_ROOT } from "../../../lib/storage";
import { StatsCharts } from "./charts";

const USER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

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

function extensionLabel(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "Word";
  if (ext === "xls" || ext === "xlsx") return "Excel";
  if (!ext) return "Unknown";

  return ext.toUpperCase();
}

async function getDirectoryUsageBytes(dirPath: string): Promise<bigint> {
  let total = BigInt(0);

  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const current = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      total += await getDirectoryUsageBytes(current);
      continue;
    }

    if (entry.isFile()) {
      const stats = await stat(current);
      total += BigInt(stats.size);
    }
  }

  return total;
}

export default async function AdminStatsPage() {
  await requireAdmin();

  const now = new Date();
  const onlineCutoff = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const [users, totalFiles, activeSessions] = await Promise.all([
    db.user.findMany({
      orderBy: { storageUsed: "desc" },
      select: {
        id: true,
        email: true,
        storageUsed: true,
      },
    }),
    db.file.findMany({
      select: {
        id: true,
        name: true,
      },
    }),
    db.activeSession.findMany({
      where: {
        expiresAt: { gt: now },
        lastSeen: { gte: onlineCutoff },
      },
      orderBy: { lastSeen: "desc" },
      select: {
        id: true,
        lastSeen: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  const totalUsers = users.length;
  const totalFileCount = totalFiles.length;
  const diskUsageBytes = await getDirectoryUsageBytes(UPLOAD_ROOT);

  const userStorageData = users.map((user) => ({
    email: user.email,
    storageGb: Number(user.storageUsed) / (1024 ** 3),
  }));

  const typeCounts = new Map<string, number>();
  for (const file of totalFiles) {
    const label = extensionLabel(file.name);
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }

  const fileTypeData = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      value: totalFileCount === 0 ? 0 : (count / totalFileCount) * 100,
    }));

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-green-400">Admin</span> System Health
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Production-readiness metrics and live usage overview.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <p className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-400">
              <Users className="h-4 w-4 text-green-400" />
              Total Users
            </p>
            <p className="text-3xl font-bold">{totalUsers}</p>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <p className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-400">
              <Database className="h-4 w-4 text-green-400" />
              Total Files
            </p>
            <p className="text-3xl font-bold">{totalFileCount}</p>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <p className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-400">
              <HardDrive className="h-4 w-4 text-green-400" />
              Total Disk Usage
            </p>
            <p className="text-3xl font-bold">{formatBytes(diskUsageBytes)}</p>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <p className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-400">
              <Activity className="h-4 w-4 text-green-400" />
              Active Sessions
            </p>
            <p className="text-3xl font-bold">{activeSessions.length}</p>
          </article>
        </section>

        <StatsCharts userStorageData={userStorageData} fileTypeData={fileTypeData} />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-4 text-lg font-semibold">User Storage Usage</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="pb-3">User</th>
                  <th className="pb-3">Used</th>
                  <th className="pb-3">Quota</th>
                  <th className="pb-3">Usage %</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const percent = Math.min((Number(user.storageUsed) / USER_QUOTA_BYTES) * 100, 100);

                  return (
                    <tr key={user.id} className="border-b border-zinc-900/70">
                      <td className="py-3 pr-4">{user.email}</td>
                      <td className="py-3 pr-4 text-zinc-300">{formatBytes(user.storageUsed)}</td>
                      <td className="py-3 pr-4 text-zinc-300">5.00 GB</td>
                      <td className="py-3 pr-4 text-zinc-300">{percent.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="mb-4 text-lg font-semibold">Currently Online Users</h2>
          {activeSessions.length === 0 ? (
            <p className="text-zinc-400">No active sessions in the last 5 minutes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map((session) => (
                    <tr key={session.id} className="border-b border-zinc-900/70">
                      <td className="py-3 pr-4">{session.user.email}</td>
                      <td className="py-3 pr-4 text-zinc-300">{session.lastSeen.toLocaleString()}</td>
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
