type UserStorageDatum = {
  email: string;
  storageGb: number;
};

type FileTypeDatum = {
  label: string;
  value: number;
};

const COLORS = ["#22c55e", "#0ea5e9", "#ef4444", "#f59e0b", "#a855f7", "#14b8a6"];
const MAX_STORAGE_ROWS = 10;

function compactEmail(value: string) {
  const [local] = value.split("@");
  if (!local) return value;
  return local.length > 18 ? `${local.slice(0, 18)}…` : local;
}

function distributionGradient(fileTypeData: FileTypeDatum[]) {
  let cursor = 0;
  const segments = fileTypeData
    .filter((item) => item.value > 0)
    .map((item, index) => {
      const start = cursor;
      const end = Math.min(100, start + item.value);
      cursor = end;
      return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
    });

  return segments.length > 0 ? `conic-gradient(${segments.join(", ")})` : undefined;
}

export function StatsCharts({
  userStorageData,
  fileTypeData,
}: {
  userStorageData: UserStorageDatum[];
  fileTypeData: FileTypeDatum[];
}) {
  const visibleUsers = userStorageData.slice(0, MAX_STORAGE_ROWS);
  const maxStorageGb = Math.max(0, ...visibleUsers.map((item) => item.storageGb));
  const hasUserStorageData = maxStorageGb > 0;
  const hasFileTypeData = fileTypeData.some((item) => item.value > 0);
  const gradient = distributionGradient(fileTypeData);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Storage By User</h2>
        <p className="mb-4 text-xs text-zinc-500">Top usage by account (GB).</p>
        {!hasUserStorageData ? (
          <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm text-zinc-500">
            No storage data yet.
          </div>
        ) : (
          <div className="space-y-3" role="img" aria-label="Storage usage by user">
            {visibleUsers.map((item) => {
              const width = maxStorageGb > 0 ? Math.max(2, (item.storageGb / maxStorageGb) * 100) : 0;
              return (
                <div key={item.email}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-zinc-300" title={item.email}>{compactEmail(item.email)}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">{item.storageGb.toFixed(2)} GB</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">File Type Distribution</h2>
        <p className="mb-4 text-xs text-zinc-500">Share of total files by type.</p>
        {!hasFileTypeData ? (
          <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm text-zinc-500">
            No distribution data yet.
          </div>
        ) : (
          <div className="grid min-h-80 items-center gap-6 md:grid-cols-[1fr_190px]">
            <div className="flex items-center justify-center">
              <div
                role="img"
                aria-label="File type distribution"
                className="relative h-52 w-52 rounded-full"
                style={{ background: gradient }}
              >
                <div className="absolute inset-12 rounded-full border border-zinc-800 bg-zinc-900" />
              </div>
            </div>

            <ul className="space-y-2 self-center rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300">
              {fileTypeData.map((item, index) => (
                <li key={item.label} className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">{item.value.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
