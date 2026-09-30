import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Item = { id: string; severity: "high" | "medium" | "info"; title: string; detail: string; path: string; hash?: string };
type Result = { count: number; urgent: number; items: Item[] };

const DOT = { high: "bg-red-500", medium: "bg-amber-500", info: "bg-sky-500" } as const;

/** The day's to-do list, from the same live reminders as the bell (they share one request). */
export function TodayList({ title, limit = 6 }: { title: string; limit?: number }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Result>("/notifications"),
    refetchInterval: 60_000,
  });
  const data = query.data;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {data && data.count > 0 && (
          <span className="text-[12px] text-muted">
            {data.urgent > 0 && <span className="font-semibold text-red-600">{data.urgent} urgent · </span>}
            {data.count} to do
          </span>
        )}
      </div>

      {!data ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-9" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
          <p className="mt-2 text-[13px] font-semibold text-navy">You're all caught up</p>
          <p className="text-[12px] text-muted">No follow-ups due, nothing stalled.</p>
        </div>
      ) : (
        <ul className="mt-3 -mx-2">
          {data.items.slice(0, limit).map((n) => (
            <li key={n.id}>
              <button
                onClick={() => void navigate({ to: n.path as never, hash: n.hash })}
                className="group flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition hover:bg-bg-light"
              >
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[n.severity])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-navy">{n.title}</span>
                  <span className="block truncate text-[12px] text-muted">{n.detail}</span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted/40 transition group-hover:translate-x-0.5 group-hover:text-navy" />
              </button>
            </li>
          ))}
          {data.count > limit && (
            <li className="px-2 pt-2 text-[12px] text-muted">+ {data.count - limit} more in the bell above</li>
          )}
        </ul>
      )}
    </section>
  );
}
