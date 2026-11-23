import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";

export type FilterOption = { value: string; label: string; hint?: string };

/**
 * A table heading you can click to pick a value from a list: the column's own filter. The list floats above the table (fixed to
 * the screen), so a scrolling table never clips it. A gold dot on the heading shows it is filtering.
 */
export function ColumnFilter({ label, value, options, onChange, allLabel = "All" }: { label: ReactNode; value: string; options: FilterOption[]; onChange: (v: string) => void; allLabel?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const on = value !== "";
  return (
    <>
      <button
        type="button"
        aria-haspopup="listbox"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 248)) });
        }}
        className={clsx("-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold transition hover:bg-navy/5 hover:text-navy", on ? "text-navy" : "text-muted")}
      >
        {label}
        {on && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="filtering" />}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {pos && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setPos(null)} />
          <ul role="listbox" style={{ top: pos.top, left: pos.left }} className="fixed z-50 max-h-72 w-60 overflow-y-auto rounded-xl border border-line bg-white p-1 text-[13px] font-normal normal-case shadow-lg">
            {[{ value: "", label: allLabel }, ...options].map((o) => (
              <li key={o.value || "all"} role="option" aria-selected={value === o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setPos(null);
                  }}
                  className={clsx("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-bg-light", value === o.value ? "font-semibold text-navy" : "text-slate-700")}
                >
                  <span>{o.label}</span>
                  {value === o.value && <Check className="h-3.5 w-3.5 text-gold-dark" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
