import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { BRAND_BAR, SERIES, compactCount, donutArcs, linePath, monthTick, niceScale, sharePercent } from "../lib/charts";

/**
 * Small hand-written charts in the CRM's own look: thin marks, quiet grid, text in ink (never in the series colour),
 * a legend for every multi-series chart, hover and keyboard tooltips, and a hidden data table for screen readers.
 * They draw at the real width of their box, so type stays readable on a phone.
 */

const INK = "#111827";
const MUTED = "#525c72";
const GRID = "#e3e7ee";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The card every chart sits in: a title, an optional note, and a plain message when there is nothing to draw. */
export function ChartCard({
  title,
  note,
  empty,
  emptyText = "Nothing to chart for this period.",
  children,
  className,
}: {
  title: string;
  note?: string;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("card flex min-w-0 flex-col p-5", className)}>
      <h2 className="text-sm font-bold text-navy">{title}</h2>
      {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
      <div className="mt-4 flex flex-1 flex-col justify-center">
        {empty ? <p className="py-10 text-center text-[13px] text-muted">{emptyText}</p> : children}
      </div>
    </section>
  );
}

export type LegendItem = { label: string; color: string; value?: string };

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={clsx("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
          <span className="text-ink">{i.label}</span>
          {i.value !== undefined && <span className="font-semibold text-navy">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The same numbers as the chart, for screen readers. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    // The wrapper does the hiding: a table ignores a 1px width and would still widen the page.
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

// ── Line chart ──────────────────────────────────────────────────────────────

export type LineSeries = { name: string; color: string; values: number[] };

export function LineChart({
  labels,
  months,
  series,
  ariaLabel,
  height = 240,
}: {
  /** Full labels for tooltips ("Nov 2026"). */
  labels: string[];
  /** Month keys ("2026-11") for axis ticks. */
  months: string[];
  series: LineSeries[];
  ariaLabel: string;
  height?: number;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { l: 34, r: 12, t: 10, b: 26 };
  const w = Math.max(width, 240);
  const innerW = w - m.l - m.r;
  const innerH = height - m.t - m.b;
  const scale = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => m.l + (months.length > 1 ? (innerW * i) / (months.length - 1) : innerW / 2);
  const y = (v: number) => m.t + innerH - (v / scale.max) * innerH;

  const pick = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - m.l;
    const i = Math.round((rel / innerW) * (months.length - 1));
    setActive(Math.min(months.length - 1, Math.max(0, i)));
  };
  const tipLeft = active === null ? 0 : x(active);
  const flip = tipLeft > w * 0.6;

  return (
    <div ref={box} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-navy/30"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? months.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? months.length) - 1));
          else if (e.key === "ArrowRight") setActive((a) => Math.min(months.length - 1, (a ?? -1) + 1));
          else if (e.key === "Escape") setActive(null);
        }}
      >
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={MUTED}>
              {compactCount(t)}
            </text>
          </g>
        ))}
        {months.map((mo, i) => (
          <text key={mo} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
            {monthTick(mo, i)}
          </text>
        ))}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + innerH} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.name}>
            <path d={linePath(s.values.map((v, i) => ({ x: x(i), y: y(v) })))} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={active === i ? 5 : 3.5} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        ))}
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-lg"
          style={flip ? { right: w - tipLeft + 10 } : { left: tipLeft + 10 }}
          role="status"
        >
          <p className="mb-1 font-bold text-navy">{labels[active]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-4 text-ink">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.name}
              </span>
              <span className="font-semibold">{s.values[active]}</span>
            </p>
          ))}
        </div>
      )}
      <Legend className="mt-3" items={series.map((s) => ({ label: s.name, color: s.color, value: String(s.values.reduce((a, b) => a + b, 0)) }))} />
      <DataTable caption={ariaLabel} head={["Month", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.values[i])])} />
    </div>
  );
}

// ── Column chart (one series over months) ───────────────────────────────────

export function ColumnChart({
  months,
  labels,
  values,
  tips,
  ariaLabel,
  color = BRAND_BAR,
  height = 220,
}: {
  months: string[];
  labels: string[];
  values: number[];
  /** Extra tooltip line per column ("₹1.2 Cr"). */
  tips?: string[];
  ariaLabel: string;
  color?: string;
  height?: number;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { l: 34, r: 8, t: 10, b: 26 };
  const w = Math.max(width, 240);
  const innerW = w - m.l - m.r;
  const innerH = height - m.t - m.b;
  const scale = niceScale(Math.max(0, ...values));
  const slot = innerW / Math.max(values.length, 1);
  const barW = Math.max(4, Math.min(32, slot * 0.6));
  // Thin the month names so they never overlap: about 44px per label.
  const every = Math.max(1, Math.ceil(44 / slot));
  const bx = (i: number) => m.l + slot * i + (slot - barW) / 2;
  const by = (v: number) => m.t + innerH - (v / scale.max) * innerH;

  return (
    <div ref={box} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-navy/30"
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? values.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? values.length) - 1));
          else if (e.key === "ArrowRight") setActive((a) => Math.min(values.length - 1, (a ?? -1) + 1));
        }}
      >
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={by(t)} y2={by(t)} stroke={GRID} />
            <text x={m.l - 6} y={by(t) + 4} textAnchor="end" fontSize={11} fill={MUTED}>
              {compactCount(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const h = (v / scale.max) * innerH;
          return (
            <g key={months[i]} onPointerEnter={() => setActive(i)}>
              {/* a wide invisible target so thin columns are easy to hit */}
              <rect x={m.l + slot * i} y={m.t} width={slot} height={innerH} fill="transparent" />
              {v > 0 && (
                // flat on the baseline, rounded at the data end
                <path
                  d={columnPath(bx(i), by(0), barW, h)}
                  fill={color}
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              {(values.length - 1 - i) % every === 0 && (
                <text x={m.l + slot * i + slot / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
                  {monthTick(months[i], i)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={m.l} x2={w - m.r} y1={by(0)} y2={by(0)} stroke={MUTED} strokeOpacity={0.5} />
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: Math.min(Math.max(m.l + slot * active + slot / 2 - 60, 4), w - 130) }}
          role="status"
        >
          <p className="font-bold text-navy">{labels[active]}</p>
          <p className="text-ink">
            <span className="font-semibold">{values[active]}</span> {values[active] === 1 ? "record" : "records"}
          </p>
          {tips?.[active] && <p className="text-muted">{tips[active]}</p>}
        </div>
      )}
      <DataTable caption={ariaLabel} head={["Month", "Records"]} rows={labels.map((l, i) => [l, values[i]])} />
    </div>
  );
}

// ── Horizontal bars (categories) ────────────────────────────────────────────

/** A column that sits flat on the baseline and is rounded only at its top. */
function columnPath(x: number, base: number, width: number, height: number) {
  const h = Math.max(height, 1);
  const r = Math.min(3, h, width / 2);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
}

export type BarRow = { key: string; label: string; value: number; display: string; sub?: string; color?: string };

export function HBarChart({ rows, ariaLabel, color = BRAND_BAR }: { rows: BarRow[]; ariaLabel: string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={ariaLabel} className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={r.sub ? `${r.label} — ${r.display} · ${r.sub}` : `${r.label} — ${r.display}`}>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="shrink-0 font-semibold text-navy">
              {r.display}
              {r.sub && <span className="ml-1.5 font-normal text-muted">{r.sub}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-r-full bg-bg-light">
            <div
              className="bar-grow h-full rounded-r-full"
              style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 1.5) : 0}%`, background: r.color ?? color }}
              aria-hidden
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Donut ───────────────────────────────────────────────────────────────────

export type Slice = { key: string; label: string; value: number; display?: string };

/** A ring with the total (or the hovered slice) in the middle, and a legend of values and shares beside it. */
export function DonutChart({
  slices,
  centreLabel,
  centreValue,
  ariaLabel,
  format = (n: number) => String(n),
}: {
  slices: Slice[];
  centreLabel: string;
  centreValue: string;
  ariaLabel: string;
  format?: (n: number) => string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const size = 176;
  const arcs = donutArcs(slices.map((s) => s.value), size / 2, size / 2, 84, 54);
  const hot = active === null ? null : slices[active];

  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @md:flex-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className="shrink-0">
        {arcs.map((a) => (
          <path
            key={slices[a.index].key}
            d={a.path}
            fill={SERIES[a.index % SERIES.length]}
            opacity={active === null || active === a.index ? 1 : 0.35}
            onPointerEnter={() => setActive(a.index)}
            onPointerLeave={() => setActive(null)}
          >
            <title>{`${slices[a.index].label}: ${slices[a.index].display ?? format(a.value)} (${sharePercent(a.value, total)})`}</title>
          </path>
        ))}
        {!arcs.length && <circle cx={size / 2} cy={size / 2} r={69} fill="none" stroke={GRID} strokeWidth={30} />}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={hot ? 18 : 22} fontWeight={700} fill="#0b1849">
          {hot ? (hot.display ?? format(hot.value)) : centreValue}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize={11} fill={MUTED}>
          {hot ? hot.label : centreLabel}
        </text>
      </svg>
      <ul id={id} className="w-full min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => (
          <li
            key={s.key}
            className={clsx("flex items-center gap-2 rounded px-1.5 py-1 text-[12px]", active === i && "bg-bg-light")}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
            <span className="shrink-0 font-semibold text-navy">{s.display ?? format(s.value)}</span>
            <span className="w-9 shrink-0 text-right text-muted">{sharePercent(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
