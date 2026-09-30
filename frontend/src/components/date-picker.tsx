import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";
import { todayIST } from "../lib/date";

/* Dates are plain "YYYY-MM-DD" strings throughout — no Date objects, so no timezone can shift a day. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekdayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

function parse(value: string | undefined | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

export const formatPickerDate = (value: string) => {
  const p = parse(value);
  return p ? `${pad(p.d)} ${SHORT[p.m - 1]} ${p.y}` : "";
};

type View = "days" | "months" | "years";

/** Places a floating panel under its trigger; flips up/left when it would leave the screen. */
function Floating({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const height = ref.current?.offsetHeight ?? 340;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8));
      const below = a.bottom + 6;
      const top = below + height > window.innerHeight - 8 ? Math.max(8, a.top - height - 6) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, width, children]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // A scrolling modal or page would leave the panel floating in the wrong place.
    const scroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className="fixed z-[70] rounded-xl border border-line bg-white p-3 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-bg-light hover:text-navy"
    >
      {children}
    </button>
  );
}

function Cell({
  active,
  today,
  disabled,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  today?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "grid place-items-center rounded-md text-[13px] font-medium transition",
        active ? "bg-navy text-white" : "text-ink hover:bg-bg-light",
        today && !active && "ring-1 ring-gold ring-inset",
        disabled && "cursor-not-allowed text-muted/35 hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The calendar body, shared by the date and month pickers. Click the month
 * title to jump to a month grid, then the year to jump to a grid of years —
 * any date is at most three clicks away, however far back or ahead.
 */
function CalendarBody({
  value,
  start,
  onPick,
  min,
  max,
  minYear,
  maxYear,
  monthOnly,
}: {
  value: string | null;
  start: { y: number; m: number };
  onPick: (y: number, m: number, d?: number) => void;
  min?: string;
  max?: string;
  minYear: number;
  maxYear: number;
  monthOnly?: boolean;
}) {
  const [view, setView] = useState<View>(monthOnly ? "months" : "days");
  const [y, setY] = useState(start.y);
  const [m, setM] = useState(start.m);
  const [yearPage, setYearPage] = useState(Math.floor((start.y - minYear) / 12));
  const today = todayIST();
  const sel = parse(value);

  const clampY = (n: number) => Math.min(Math.max(n, minYear), maxYear);
  const firstYearOfPage = minYear + yearPage * 12;
  const lastPage = Math.floor((maxYear - minYear) / 12);

  const stepMonth = (delta: number) => {
    const idx = y * 12 + (m - 1) + delta;
    const ny = Math.floor(idx / 12);
    if (ny < minYear || ny > maxYear) return;
    setY(ny);
    setM((idx % 12) + 1);
  };

  const dayDisabled = (dd: number) => {
    const s = ymd(y, m, dd);
    return (!!min && s < min) || (!!max && s > max);
  };

  return (
    <div>
      {view === "days" && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <NavButton onClick={() => stepMonth(-1)} label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <button
              type="button"
              onClick={() => setView("months")}
              className="rounded-md px-2.5 py-1 text-[13px] font-bold text-navy hover:bg-bg-light"
              title="Pick a month or year"
            >
              {MONTHS[m - 1]} {y}
            </button>
            <NavButton onClick={() => stepMonth(1)} label="Next month">
              <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold tracking-wide text-muted uppercase">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: weekdayOf(y, m, 1) }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysIn(y, m) }, (_, i) => i + 1).map((dd) => (
              <Cell
                key={dd}
                className="h-8"
                active={sel?.y === y && sel.m === m && sel.d === dd}
                today={ymd(y, m, dd) === today}
                disabled={dayDisabled(dd)}
                onClick={() => onPick(y, m, dd)}
              >
                {dd}
              </Cell>
            ))}
          </div>
        </>
      )}

      {view === "months" && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <NavButton onClick={() => setY((v) => clampY(v - 1))} label="Previous year">
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <button
              type="button"
              onClick={() => {
                setYearPage(Math.floor((y - minYear) / 12));
                setView("years");
              }}
              className="rounded-md px-2.5 py-1 text-[13px] font-bold text-navy hover:bg-bg-light"
              title="Pick a year"
            >
              {y}
            </button>
            <NavButton onClick={() => setY((v) => clampY(v + 1))} label="Next year">
              <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {SHORT.map((name, i) => (
              <Cell
                key={name}
                className="h-11"
                active={sel?.y === y && sel.m === i + 1 && (monthOnly || false)}
                today={today.startsWith(`${y}-${pad(i + 1)}`)}
                onClick={() => {
                  setM(i + 1);
                  if (monthOnly) onPick(y, i + 1);
                  else setView("days");
                }}
              >
                {name}
              </Cell>
            ))}
          </div>
        </>
      )}

      {view === "years" && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <NavButton onClick={() => setYearPage((p) => Math.max(0, p - 1))} label="Earlier years">
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <span className="text-[13px] font-bold text-navy">
              {firstYearOfPage} – {Math.min(firstYearOfPage + 11, maxYear)}
            </span>
            <NavButton onClick={() => setYearPage((p) => Math.min(lastPage, p + 1))} label="Later years">
              <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => firstYearOfPage + i).map((yr) => (
              <Cell
                key={yr}
                className="h-11"
                active={sel?.y === yr}
                today={today.startsWith(String(yr))}
                disabled={yr > maxYear}
                onClick={() => {
                  setY(yr);
                  setView("months");
                }}
              >
                {yr}
              </Cell>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const defaultMaxYear = () => Number(todayIST().slice(0, 4)) + 30;

export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  required,
  placeholder = "Select date",
  className = "",
  title,
  clearable = true,
  minYear = 2000,
  maxYear,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  title?: string;
  clearable?: boolean;
  minYear?: number;
  maxYear?: number;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const top = maxYear ?? defaultMaxYear();

  const set = (v: string) => {
    setInner(v);
    onChange?.(v);
  };
  const p = parse(current);
  const today = todayIST();
  const start = p ?? { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };

  return (
    <div ref={anchor} className={clsx("relative", className)} title={title}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="field flex w-full items-center gap-2 text-left"
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted" />
        <span className={clsx("min-w-0 flex-1 truncate", !current && "text-muted/70")}>
          {current ? formatPickerDate(current) : placeholder}
        </span>
      </button>

      {clearable && current && !required && (
        <button
          type="button"
          onClick={() => set("")}
          aria-label="Clear date"
          className="absolute top-1/2 right-2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted hover:bg-bg-light hover:text-navy"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Keeps plain <form> submission and the browser's "required" check working. */}
      {name !== undefined || required ? (
        <input
          name={name}
          value={current}
          required={required}
          onChange={() => undefined}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      ) : null}

      {open && (
        <Floating anchor={anchor} width={288} onClose={() => setOpen(false)}>
          <CalendarBody
            value={current || null}
            start={start}
            min={min}
            max={max}
            minYear={minYear}
            maxYear={top}
            onPick={(y, m, d) => {
              if (d) {
                set(ymd(y, m, d));
                setOpen(false);
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                if ((!min || today >= min) && (!max || today <= max)) {
                  set(today);
                  setOpen(false);
                }
              }}
              className="rounded-md px-2 py-1 text-[12px] font-semibold text-navy hover:bg-bg-light"
            >
              Today
            </button>
            {clearable && !required && current && (
              <button
                type="button"
                onClick={() => {
                  set("");
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-[12px] font-semibold text-muted hover:bg-bg-light hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>
        </Floating>
      )}
    </div>
  );
}

/** Month + year in one control, with ‹ › for single steps and a grid for long jumps. */
export function MonthPicker({
  month,
  year,
  onChange,
  minYear,
  maxYear,
  className = "",
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  minYear: number;
  maxYear: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const now = todayIST();
  const nowMonth = Number(now.slice(5, 7));
  const nowYear = Number(now.slice(0, 4));

  const step = (delta: number) => {
    const idx = year * 12 + (month - 1) + delta;
    const ny = Math.floor(idx / 12);
    if (ny >= minYear && ny <= maxYear) onChange((idx % 12) + 1, ny);
  };

  return (
    <div className={clsx("flex items-center gap-1", className)}>
      <NavButton onClick={() => step(-1)} label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </NavButton>
      <div ref={anchor} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="field flex w-48 items-center gap-2 text-left"
        >
          <Calendar className="h-4 w-4 shrink-0 text-muted" />
          <span className="flex-1 truncate font-semibold text-navy">
            {MONTHS[month - 1]} {year}
          </span>
        </button>
        {open && (
          <Floating anchor={anchor} width={288} onClose={() => setOpen(false)}>
            <CalendarBody
              monthOnly
              value={ymd(year, month, 1)}
              start={{ y: year, m: month }}
              minYear={minYear}
              maxYear={maxYear}
              onPick={(y, m) => {
                onChange(m, y);
                setOpen(false);
              }}
            />
            <div className="mt-2 border-t border-line pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(nowMonth, nowYear);
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-[12px] font-semibold text-navy hover:bg-bg-light"
              >
                This month
              </button>
            </div>
          </Floating>
        )}
      </div>
      <NavButton onClick={() => step(1)} label="Next month">
        <ChevronRight className="h-4 w-4" />
      </NavButton>
    </div>
  );
}
