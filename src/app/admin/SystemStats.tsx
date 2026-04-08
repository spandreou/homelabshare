"use client";

import { useEffect, useState } from "react";
import { Activity, Database, HardDrive, MemoryStick, Timer, Users } from "lucide-react";
import type { SystemStats } from "../../lib/system-stats";

function Progress({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  const tone = safe >= 90 ? "bg-red-500" : "bg-green-500";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-2 ${tone} transition-all`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function formatUptime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);

  if (d > 0) {
    return `${d}d ${h}h ${m}m`;
  }

  return `${h}h ${m}m`;
}

export function SystemStats({ initialStats }: { initialStats: SystemStats }) {
  const [stats, setStats] = useState<SystemStats>(initialStats);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      const response = await fetch("/api/admin/system-stats", { cache: "no-store" });
      if (!response.ok || disposed) {
        return;
      }

      const next = (await response.json()) as SystemStats;
      if (!disposed) {
        setStats(next);
      }
    };

    const id = setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Monitoring</h2>
        <span className="text-xs text-zinc-500">Auto refresh: 30s</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <Activity className="h-4 w-4" /> CPU
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{stats.cpuUsagePercent}%</p>
          <p className="mt-1 text-sm text-zinc-400">
            Temp: {stats.cpuTempC === null ? "N/A" : `${stats.cpuTempC}°C`}
          </p>
        </article>

        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <MemoryStick className="h-4 w-4" /> RAM
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{stats.ramUsedGb} / {stats.ramTotalGb} GB</p>
          <div className="mt-3">
            <Progress value={stats.ramUsedPercent} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">Free: {stats.ramFreeGb} GB ({stats.ramUsedPercent}% used)</p>
        </article>

        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <HardDrive className="h-4 w-4" /> Disk (/home/spandreou)
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{stats.diskFreeGb} GB free</p>
          <div className="mt-3">
            <Progress value={stats.diskUsedPercent} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">Total: {stats.diskTotalGb} GB ({stats.diskUsedPercent}% used)</p>
        </article>

        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <Timer className="h-4 w-4" /> Uptime
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{formatUptime(stats.uptimeSeconds)}</p>
          <p className="mt-1 text-sm text-zinc-400">Server online duration</p>
        </article>

        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <Users className="h-4 w-4" /> Registered Users
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{stats.registeredUsers}</p>
          <p className="mt-1 text-sm text-zinc-400">Total accounts</p>
        </article>

        <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition duration-200 hover:scale-[1.01] hover:border-zinc-700">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <Database className="h-4 w-4" /> Active Invite Codes
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-100">{stats.activeInviteCodes}</p>
          <p className="mt-1 text-sm text-zinc-400">Not used and not expired</p>
        </article>
      </div>
    </section>
  );
}
