import { formatDateIST, formatDateTimeFullIST } from "./date";

/** Indian digit grouping without Intl: 1234567 → "12,34,567". */
export function formatIndianNumber(n: number): string {
  const [int, frac] = Math.abs(n).toFixed(2).replace(/\.00$/, "").split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${rest ? `${rest},` : ""}${last3}${frac ? `.${frac}` : ""}`;
}

const inr = (n: number) => `${n < 0 ? "-" : ""}₹${formatIndianNumber(Math.abs(Math.round(n)))}`;

export const formatAmount = (value: string | number | null | undefined) =>
  value == null || value === "" || Number.isNaN(Number(value)) ? "—" : inr(Number(value));

export const formatDate = (iso: string | null | undefined) => (iso ? formatDateIST(new Date(iso)) : "—");

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? formatDateTimeFullIST(new Date(iso)) : "—";

export const isOverdue = (iso: string | null | undefined) =>
  Boolean(iso && new Date(iso).getTime() < Date.now());

/** "BANK_LOGIN" / "website-enquiry" → "Bank login" / "Website enquiry". */
export const humanize = (value: string | null | undefined) => {
  if (!value) return "—";
  const text = value.replace(/[-_]+/g, " ").trim();
  const spaced = /^[A-Z ]+$/.test(text) ? text.toLowerCase() : text;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** ₹52,00,000 → ₹52 L, ₹4,50,00,000 → ₹4.5 Cr — for tight spaces; show the full figure in a tooltip. */
export const formatCompact = (value: string | number | null | undefined) => {
  if (value == null || value === "") return "—";
  const n = Number(value);
  const trim = (x: number) => String(Math.round(x * 100) / 100);
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
  return inr(n);
};

/** "commissionPercent" / "SourcingPartner" → "Commission percent" / "Sourcing partner". */
export const humanizeKey = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
