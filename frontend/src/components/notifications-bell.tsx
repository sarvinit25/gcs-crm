import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Item = {
  id: string;
  kind: string;
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  path: string;
  hash?: string;
};
type Result = { count: number; urgent: number; items: Item[] };

const DOT = { high: "bg-red-500", medium: "bg-amber-500", info: "bg-sky-500" } as const;

/** Things that need attention right now — worked out live, so they clear themselves when fixed. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Result>("/notifications"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const data = query.data;
  const count = data?.count ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `${count} reminders` : "No reminders"}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full text-navy transition hover:bg-bg-light"
      >
        <Bell className={clsx("h-[18px] w-[18px]", data?.urgent ? "text-red-600" : "")} />
        {count > 0 && (
          <span
            className={clsx(
              "absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white",
              data?.urgent ? "bg-red-600" : "bg-navy",
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="card pop-enter absolute top-full right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[13px] font-bold text-navy">Reminders</p>
            {count > 0 && <p className="text-[12px] text-muted">{data?.urgent ? `${data.urgent} urgent · ` : ""}{count} total</p>}
          </div>
          {!data ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>
          ) : data.items.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
              <p className="mt-2 text-[13px] font-semibold text-navy">You're all caught up</p>
              <p className="text-[12px] text-muted">No follow-ups due, nothing stalled.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: n.path as never, hash: n.hash });
                    }}
                    className="flex w-full items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition hover:bg-bg-light"
                  >
                    <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[n.severity])} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-navy">{n.title}</span>
                      <span className="block text-[12px] text-muted">{n.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
