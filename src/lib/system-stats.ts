import os from "node:os";
import path from "node:path";
import si from "systeminformation";
import { db } from "./db";

export type SystemStats = {
  cpuUsagePercent: number;
  cpuTempC: number | null;
  ramTotalGb: number;
  ramUsedGb: number;
  ramFreeGb: number;
  ramUsedPercent: number;
  diskTotalGb: number;
  diskFreeGb: number;
  diskUsedPercent: number;
  uptimeSeconds: number;
  registeredUsers: number;
  activeInviteCodes: number;
  collectedAt: string;
};

function emptyStats(): SystemStats {
  return {
    cpuUsagePercent: 0,
    cpuTempC: null,
    ramTotalGb: 0,
    ramUsedGb: 0,
    ramFreeGb: 0,
    ramUsedPercent: 0,
    diskTotalGb: 0,
    diskFreeGb: 0,
    diskUsedPercent: 0,
    uptimeSeconds: os.uptime(),
    registeredUsers: 0,
    activeInviteCodes: 0,
    collectedAt: new Date().toISOString(),
  };
}

export async function collectSystemStats(): Promise<SystemStats> {
  const [loadResult, tempResult, memoryResult, fsSizesResult, userCountResult, activeCodesResult] = await Promise.allSettled([
    si.currentLoad(),
    si.cpuTemperature(),
    si.mem(),
    si.fsSize(),
    db.user.count(),
    db.inviteCode.count({
      where: {
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  const load = loadResult.status === "fulfilled" ? loadResult.value : { currentLoad: 0 };
  const temp = tempResult.status === "fulfilled" ? tempResult.value : { main: null as number | null };
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value : { total: 0, used: 0, available: 0 };
  const fsSizes = fsSizesResult.status === "fulfilled" ? fsSizesResult.value : [];
  const userCount = userCountResult.status === "fulfilled" ? userCountResult.value : 0;
  const activeCodes = activeCodesResult.status === "fulfilled" ? activeCodesResult.value : 0;

  const targetPath = "/home/spandreou";
  const normalizedTarget = path.resolve(targetPath);

  const diskEntry =
    fsSizes
      .filter((entry) => entry.size > 0)
      .sort((a, b) => b.mount.length - a.mount.length)
      .find((entry) => normalizedTarget.startsWith(path.resolve(entry.mount))) ??
    fsSizes.find((entry) => entry.size > 0);

  const diskTotal = diskEntry?.size ?? 0;
  const diskUsed = diskEntry?.used ?? 0;
  const diskFree = Math.max(0, diskTotal - diskUsed);
  const diskUsedPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

  const ramTotal = memory.total;
  const ramUsed = memory.used;
  const ramFree = memory.available;
  const ramUsedPercent = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;

  const cpuUsagePercentRaw =
    typeof load.currentLoad === "number" && Number.isFinite(load.currentLoad) ? load.currentLoad : 0;
  const cpuTempRaw =
    typeof temp.main === "number" && Number.isFinite(temp.main) ? temp.main : null;

  const stats = {
    cpuUsagePercent: Number(cpuUsagePercentRaw.toFixed(1)),
    cpuTempC: cpuTempRaw === null ? null : Number(cpuTempRaw.toFixed(1)),
    ramTotalGb: Number((ramTotal / 1024 ** 3).toFixed(2)),
    ramUsedGb: Number((ramUsed / 1024 ** 3).toFixed(2)),
    ramFreeGb: Number((ramFree / 1024 ** 3).toFixed(2)),
    ramUsedPercent: Number(ramUsedPercent.toFixed(1)),
    diskTotalGb: Number((diskTotal / 1024 ** 3).toFixed(2)),
    diskFreeGb: Number((diskFree / 1024 ** 3).toFixed(2)),
    diskUsedPercent: Number(diskUsedPercent.toFixed(1)),
    uptimeSeconds: os.uptime(),
    registeredUsers: userCount,
    activeInviteCodes: activeCodes,
    collectedAt: new Date().toISOString(),
  };

  if (Object.values(stats).some((value) => typeof value === "number" && Number.isNaN(value))) {
    return emptyStats();
  }

  return stats;
}
