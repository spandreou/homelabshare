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

export async function collectSystemStats(): Promise<SystemStats> {
  const [load, temp, memory, fsSizes, userCount, activeCodes] = await Promise.all([
    si.currentLoad(),
    si.cpuTemperature().catch(() => ({ main: null })),
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

  return {
    cpuUsagePercent: Number(load.currentLoad.toFixed(1)),
    cpuTempC: typeof temp.main === "number" ? Number(temp.main.toFixed(1)) : null,
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
}
