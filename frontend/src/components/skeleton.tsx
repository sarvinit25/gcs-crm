/** Placeholder rows shown while a register loads — the page keeps its shape instead of jumping. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="px-4 py-3" role="status" aria-label="Loading">
      <div className="mb-3 flex gap-4">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="skeleton h-3 flex-1" style={{ maxWidth: c === 0 ? "9rem" : undefined }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-line/70 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className="skeleton h-3.5 flex-1"
              style={{ maxWidth: c === 0 ? "9rem" : undefined, opacity: 1 - r * 0.1, animationDelay: `${(r + c) * 60}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="card flex items-center gap-3.5 p-4">
            <div className="skeleton h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-2.5 w-16" />
              <div className="skeleton h-5 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card space-y-3 p-5">
          <div className="skeleton h-4 w-28" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-2.5" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
        <div className="card space-y-3 p-5">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-9 w-14" />
          <div className="skeleton h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
