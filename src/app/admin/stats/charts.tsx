"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UserStorageDatum = {
  email: string;
  storageGb: number;
};

type FileTypeDatum = {
  label: string;
  value: number;
};

const COLORS = ["#22c55e", "#0ea5e9", "#ef4444", "#f59e0b", "#a855f7", "#14b8a6"];

function compactEmail(value: string) {
  const [local] = value.split("@");
  if (!local) return value;
  return local.length > 12 ? `${local.slice(0, 12)}…` : local;
}

export function StatsCharts({
  userStorageData,
  fileTypeData,
}: {
  userStorageData: UserStorageDatum[];
  fileTypeData: FileTypeDatum[];
}) {
  const hasUserStorageData = userStorageData.some((item) => item.storageGb > 0);
  const hasFileTypeData = fileTypeData.some((item) => item.value > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Storage By User</h2>
        <p className="mb-4 text-xs text-zinc-500">Top usage by account (GB).</p>
        <div className="h-80">
          {!hasUserStorageData ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm text-zinc-500">
              No storage data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userStorageData} margin={{ top: 8, right: 10, left: 0, bottom: 36 }}>
                <CartesianGrid stroke="rgba(113,113,122,0.18)" vertical={false} />
                <XAxis
                  dataKey="email"
                  tickFormatter={compactEmail}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  interval={0}
                  height={52}
                />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: "rgba(63,63,70,0.2)" }}
                  formatter={(value) => `${Number(value ?? 0).toFixed(2)} GB`}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="storageGb" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">File Type Distribution</h2>
        <p className="mb-4 text-xs text-zinc-500">Share of total files by type.</p>
        <div className="h-80">
          {!hasFileTypeData ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm text-zinc-500">
              No distribution data yet.
            </div>
          ) : (
            <div className="grid h-full gap-4 md:grid-cols-[1fr_170px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fileTypeData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={96}
                    innerRadius={48}
                    label={false}
                    labelLine={false}
                  >
                    {fileTypeData.map((item, index) => (
                      <Cell key={item.label} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`}
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <ul className="space-y-2 self-center rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300">
                {fileTypeData.map((item, index) => (
                  <li key={item.label} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span>{item.label}</span>
                    </span>
                    <span className="text-zinc-400">{item.value.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
