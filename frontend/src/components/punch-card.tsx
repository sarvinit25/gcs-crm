import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, LogIn, LogOut } from "lucide-react";
import { api } from "../lib/api";

type Today = {
  date: string;
  selfCheckIn: boolean;
  halfDayCutoff: string;
  workStart: string;
  status: "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY" | "HOLIDAY" | null;
  checkInAt: string | null;
  checkOutAt: string | null;
};

const clock = (d: Date) =>
  d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half day",
  LEAVE: "On leave",
  HOLIDAY: "Holiday",
  ABSENT: "Absent",
};

export function PunchCard() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const query = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => api<Today>("/attendance/me/today"),
  });

  const punch = useMutation({
    mutationFn: (kind: "check-in" | "check-out") => api<Today>(`/attendance/me/${kind}`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["attendance-today"], data);
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  const t = query.data;
  if (!t) return null;

  const checkedIn = Boolean(t.checkInAt);
  const checkedOut = Boolean(t.checkOutAt);
  const blocked = t.status === "LEAVE" || t.status === "HOLIDAY";

  return (
    <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-600">
          <Clock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Today's action</p>
          <p className="text-xl font-bold text-navy">{clock(now)}</p>
        </div>
      </div>

      <div className="text-[13px] text-muted">
        {blocked ? (
          <p>Today is marked as {STATUS_LABEL[t.status!].toLowerCase()}.</p>
        ) : checkedIn ? (
          <>
            <p>
              In <span className="font-semibold text-navy">{clock(new Date(t.checkInAt!))}</span>
              {checkedOut && (
                <>
                  {" "}· Out <span className="font-semibold text-navy">{clock(new Date(t.checkOutAt!))}</span>
                </>
              )}
            </p>
            <p className="text-[12px]">Marked {STATUS_LABEL[t.status ?? "PRESENT"].toLowerCase()}</p>
          </>
        ) : (
          <p>
            Check in before <span className="font-semibold text-navy">{t.halfDayCutoff}</span> to be counted
            present.
          </p>
        )}
        {punch.isError && <p className="text-[12px] text-red-600">{(punch.error as Error).message}</p>}
      </div>

      <div className="ml-auto">
        {!t.selfCheckIn ? (
          <p className="text-[12px] text-muted">Self check-in is off — ask an admin.</p>
        ) : blocked || checkedOut ? null : (
          <button
            onClick={() => punch.mutate(checkedIn ? "check-out" : "check-in")}
            disabled={punch.isPending}
            className="btn-primary"
          >
            {punch.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : checkedIn ? (
              <LogOut className="h-4 w-4" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {checkedIn ? "Check out" : "Check in"}
          </button>
        )}
      </div>
    </section>
  );
}
