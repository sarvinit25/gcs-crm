import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { api } from "../lib/api";

type Option = { value: string; label: string };

/** Named periods come from the server so financial-year labels roll over by themselves. */
export function usePeriods() {
  return useQuery({
    queryKey: ["periods"],
    queryFn: () => api<Option[]>("/dashboard/periods"),
    staleTime: 60 * 60 * 1000,
  });
}

export function PeriodSelect({
  value,
  onChange,
  allowCustom = false,
  className = "field w-44",
}: {
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
  className?: string;
}) {
  const periods = usePeriods();
  const options = periods.data ?? [{ value: "all", label: "All time" }];

  return (
    <label className="relative inline-block">
      <Calendar
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-navy/70"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} pl-9!`}
        aria-label="Time period"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {allowCustom && <option value="custom">Custom range…</option>}
      </select>
    </label>
  );
}
