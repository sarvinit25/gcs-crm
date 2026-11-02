/**
 * The maths behind the hand-written SVG charts: scales, tick marks, line and donut geometry.
 * Pure functions, so the shapes can be tested without a browser.
 */

/**
 * Categorical series colours, in the fixed order every chart uses them (never cycled). This is the validated
 * default palette: separable for colour-blind readers and on the light surface. The brand navy is kept for
 * text and for single-series bars, where there is nothing to tell apart.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const BRAND_BAR = "#1c3a6b";

/** A round upper bound and evenly spaced ticks from 0, so the axis never ends on an awkward number. */
export function niceScale(max: number, wanted = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: wanted, ticks: Array.from({ length: wanted + 1 }, (_, i) => i) };
  const rough = max / wanted;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks };
}

/** "M x,y L x,y …" through the points. A single point still draws (as a dot-length segment). */
export function linePath(points: { x: number; y: number }[]): string {
  if (!points.length) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  const [first, ...rest] = points;
  if (!rest.length) return `M${r(first.x)},${r(first.y)}h0.01`;
  return `M${r(first.x)},${r(first.y)}` + rest.map((p) => `L${r(p.x)},${r(p.y)}`).join("");
}

export type Arc = { index: number; value: number; start: number; end: number; path: string };

const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.sin(angle),
  y: cy - r * Math.cos(angle),
});

/**
 * Ring segments for a donut, clockwise from 12 o'clock. Zero values get no arc; a lone value is drawn as two
 * half-arcs because a single SVG arc can't close a full circle. `gap` (radians) leaves the surface-colour
 * seam between neighbouring segments.
 */
export function donutArcs(values: number[], cx: number, cy: number, outer: number, inner: number, gap = 0.02): Arc[] {
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total <= 0) return [];
  const nonZero = values.filter((v) => v > 0).length;
  let angle = 0;
  const arcs: Arc[] = [];
  values.forEach((value, index) => {
    if (value <= 0) return;
    const sweep = (value / total) * Math.PI * 2;
    const seam = nonZero > 1 ? Math.min(gap, sweep / 3) : 0;
    const start = angle + seam / 2;
    const end = angle + sweep - seam / 2;
    angle += sweep;
    arcs.push({ index, value, start, end, path: ringPath(cx, cy, outer, inner, start, end) });
  });
  return arcs;
}

function ringPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  // A whole circle is split in two, since start and end points would coincide.
  if (end - start >= Math.PI * 2 - 1e-6) {
    const mid = start + Math.PI;
    return ringPath(cx, cy, outer, inner, start, mid) + ringPath(cx, cy, outer, inner, mid, end);
  }
  const large = end - start > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, outer, start);
  const o2 = polar(cx, cy, outer, end);
  const i2 = polar(cx, cy, inner, end);
  const i1 = polar(cx, cy, inner, start);
  return (
    `M${r(o1.x)},${r(o1.y)}A${outer},${outer} 0 ${large} 1 ${r(o2.x)},${r(o2.y)}` +
    `L${r(i2.x)},${r(i2.y)}A${inner},${inner} 0 ${large} 0 ${r(i1.x)},${r(i1.y)}Z`
  );
}

/** Compact numbers for axes and centres: 1.2k, 3.4L would be wrong for counts, so plain thousands. */
export function compactCount(n: number): string {
  if (Math.abs(n) >= 1e6) return `${Math.round(n / 1e5) / 10}M`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

/** "2026-11" → "Nov"; the first month shown and every January also carry the year ("Jan 27"). */
export function monthTick(month: string, index: number): string {
  const [y, m] = month.split("-").map(Number);
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? month;
  return index === 0 || m === 1 ? `${name} ${String(y).slice(2)}` : name;
}

/** Share of a total as "42%" (or "<1%" when it rounds to nothing but exists). */
export function sharePercent(value: number, total: number): string {
  if (!(total > 0) || !(value > 0)) return "0%";
  const p = (value / total) * 100;
  return p < 1 ? "<1%" : `${Math.round(p)}%`;
}
