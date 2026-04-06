"use client";

import {
  Bar,
  BarChart,
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

export function StatsCharts({
  userStorageData,
  fileTypeData,
}: {
  userStorageData: UserStorageDatum[];
  fileTypeData: FileTypeDatum[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Storage By User (GB)</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={userStorageData} margin={{ top: 10, right: 16, left: 0, bottom: 48 }}>
              <XAxis
                dataKey="email"
                angle={-25}
                textAnchor="end"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                interval={0}
                height={72}
              />
              <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "rgba(63,63,70,0.3)" }}
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="storageGb" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">File Type Distribution</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={fileTypeData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={108}
                label={({ name, value }) => `${String(name)} ${Number(value ?? 0).toFixed(1)}%`}
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
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
