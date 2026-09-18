import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount } from "../lib/format";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";

type Status = "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY" | "HOLIDAY";

type StaffMonth = {
  id: string;
  name: string;
  designation: string | null;
  days: { date: string; status: Status; note: string | null }[];
  present: number;
  halfDays: number;
  leave: number;
  absent: number;
  worked: number;
};

type MonthData = { month: number; year: number; daysInMonth: number; staff: StaffMonth[] };

type PayrollRow = {
  id: string;
  name: string;
  designation: string | null;
  payroll: {
    id: string;
    baseSalary: string;
    incentives: string;
    deductions: string;
    netPay: string;
    status: "PENDING" | "PARTIAL" | "PAID";
  } | null;
};

/** Cycles on click, so marking a month is one pass rather than a dropdown per cell. */
const CYCLE: Status[] = ["PRESENT", "HALF_DAY", "LEAVE", "ABSENT", "HOLIDAY"];

const CELL: Record<Status, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  HALF_DAY: "bg-sky-100 text-sky-800",
  LEAVE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-800",
  HOLIDAY: "bg-slate-100 text-slate-500",
};

const LETTER: Record<Status, string> = {
  PRESENT: "P",
  HALF_DAY: "H",
  LEAVE: "L",
  ABSENT: "A",
  HOLIDAY: "—",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AttendancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<"attendance" | "payroll">("attendance");

  const isAdmin = user?.role === "ADMIN";
  const period = `month=${month}&year=${year}`;

  const attendance = useQuery({
    queryKey: ["attendance", month, year],
    queryFn: () => api<MonthData>(`/attendance?${period}`),
    enabled: tab === "attendance",
  });

  const payroll = useQuery({
    queryKey: ["payroll", month, year],
    queryFn: () => api<PayrollRow[]>(`/payroll?${period}`),
    enabled: tab === "payroll" && isAdmin,
  });

  const mark = useMutation({
    mutationFn: (body: { userId: string; date: string; status: Status }) =>
      api("/attendance", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });

  const bulkPresent = useMutation({
    mutationFn: (date: string) =>
      api("/attendance/bulk-present", { method: "POST", body: JSON.stringify({ date }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });

  const savePayroll = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/payroll", { method: "PUT", body: JSON.stringify({ ...body, month, year }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll"] }),
  });

  const setPaid = useMutation({
    mutationFn: (id: string) =>
      api(`/payroll/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "PAID" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll"] }),
  });

  const error = [mark, bulkPresent, savePayroll, setPaid].find((m) => m.isError)?.error;
  const days = attendance.data
    ? Array.from({ length: attendance.data.daysInMonth }, (_, i) => i + 1)
    : [];

  const dateFor = (day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title="Attendance & Payroll"
        subtitle={`${MONTHS[month - 1]} ${year}`}
        actions={
          tab === "attendance" && (
            <button
              onClick={() => bulkPresent.mutate(new Date().toISOString().slice(0, 10))}
              disabled={bulkPresent.isPending}
              className="btn-primary"
            >
              {bulkPresent.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarCheck className="h-4 w-4" />
              )}
              Mark all present today
            </button>
          )
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="field w-40"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="field w-28"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <div className="ml-auto flex gap-1 rounded-md border border-line bg-white p-1">
            {(["attendance", ...(isAdmin ? (["payroll"] as const) : [])] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "rounded px-3 py-1.5 text-[13px] font-semibold capitalize transition",
                  tab === t ? "bg-navy text-white" : "text-muted hover:text-navy",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(error as Error).message}
          </p>
        )}

        {tab === "attendance" ? (
          <>
            <div className="card overflow-x-auto">
              {attendance.isPending ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <table className="text-left text-[12px]">
                  <thead className="border-b border-line bg-bg-light/60">
                    <tr>
                      <th className="sticky left-0 z-10 bg-bg-light px-3 py-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                        Staff
                      </th>
                      {days.map((d) => (
                        <th key={d} className="w-7 px-0 py-2 text-center font-bold text-muted">
                          {d}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                        Worked
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.data?.staff.map((s) => {
                      const byDate = new Map(s.days.map((d) => [d.date, d]));
                      return (
                        <tr key={s.id} className="border-b border-line/70 last:border-0">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap">
                            <p className="font-semibold text-navy">{s.name}</p>
                            <p className="text-[11px] text-muted">{s.designation ?? "—"}</p>
                          </td>
                          {days.map((d) => {
                            const entry = byDate.get(dateFor(d));
                            const isFuture = new Date(dateFor(d)) > new Date();
                            return (
                              <td key={d} className="p-0.5 text-center">
                                <button
                                  disabled={isFuture || mark.isPending}
                                  title={entry?.note ?? undefined}
                                  onClick={() => {
                                    // An empty cell marks Present; marked cells cycle onward.
                                    const next = entry
                                      ? CYCLE[(CYCLE.indexOf(entry.status) + 1) % CYCLE.length]
                                      : "PRESENT";
                                    mark.mutate({ userId: s.id, date: dateFor(d), status: next });
                                  }}
                                  className={clsx(
                                    "h-6 w-6 rounded text-[10px] font-bold transition",
                                    entry ? CELL[entry.status] : "bg-bg-light text-muted/40",
                                    isFuture && "cursor-not-allowed opacity-30",
                                  )}
                                >
                                  {entry ? LETTER[entry.status] : "·"}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-bold whitespace-nowrap text-navy">
                            {s.worked}
                            <span className="ml-1 text-[11px] font-normal text-muted">
                              P{s.present} L{s.leave} A{s.absent}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="mt-3 text-[12px] text-muted">
              Click a cell to cycle Present → Half day → Leave → Absent → Holiday. Future dates
              cannot be marked.
            </p>
          </>
        ) : (
          <div className="card overflow-hidden">
            {payroll.isPending ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Staff</th>
                    <th className="px-4 py-2.5 font-bold">Base</th>
                    <th className="px-4 py-2.5 font-bold">Incentives</th>
                    <th className="px-4 py-2.5 font-bold">Deductions</th>
                    <th className="px-4 py-2.5 font-bold">Net</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.data?.map((row) => (
                    <tr key={row.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{row.name}</p>
                        <p className="text-[12px] text-muted">{row.designation ?? "—"}</p>
                      </td>
                      <td colSpan={4} className="px-4 py-3">
                        <form
                          // Keyed on the saved record so the uncontrolled inputs
                          // re-mount with fresh values after a save, rather than
                          // keeping whatever was last typed.
                          key={row.payroll?.id ?? "new"}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            savePayroll.mutate({
                              userId: row.id,
                              baseSalary: Number(f.get("baseSalary")),
                              incentives: Number(f.get("incentives") || 0),
                              deductions: Number(f.get("deductions") || 0),
                            });
                          }}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            name="baseSalary"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            required
                            defaultValue={row.payroll?.baseSalary ?? ""}
                            placeholder="Base"
                            className="field w-28"
                          />
                          <input
                            name="incentives"
                            type="number"
                            min={0}
                            defaultValue={row.payroll?.incentives ?? ""}
                            placeholder="Incentives"
                            className="field w-28"
                          />
                          <input
                            name="deductions"
                            type="number"
                            min={0}
                            defaultValue={row.payroll?.deductions ?? ""}
                            placeholder="Deductions"
                            className="field w-28"
                          />
                          <span className="w-28 font-bold text-navy">
                            {row.payroll ? formatAmount(row.payroll.netPay) : "—"}
                          </span>
                          <button type="submit" className="btn-ghost">
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        {row.payroll?.status === "PAID" ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Paid
                          </span>
                        ) : row.payroll ? (
                          <button
                            onClick={() => setPaid.mutate(row.payroll!.id)}
                            className="text-[12px] font-semibold text-navy hover:text-gold-dark"
                          >
                            Mark paid
                          </button>
                        ) : (
                          <span className="text-[12px] text-muted">Not set</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
