const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const formatAmount = (value: string | number | null | undefined) =>
  value == null || value === "" ? "—" : INR.format(Number(value));

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "—";

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";

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
  return INR.format(n);
};

/** "commissionPercent" / "SourcingPartner" → "Commission percent" / "Sourcing partner". */
export const humanizeKey = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
