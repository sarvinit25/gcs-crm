/**
 * Calendar days are India time (the firm works in Mumbai), wherever the browser
 * is. Everything here is arithmetic on a fixed +05:30 offset — no Intl/locale
 * output, which varies between browsers and versions.
 */
const IST_OFFSET_MS = 330 * 60_000;
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The India wall-clock fields of an instant. */
export function istFields(d: Date = new Date()) {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
  };
}

/** Today's India date as YYYY-MM-DD — never the browser's or UTC's idea of "today". */
export const todayIST = (now: Date = new Date()) => {
  const f = istFields(now);
  return `${f.year}-${pad(f.month)}-${pad(f.day)}`;
};

/** True when a YYYY-MM-DD day is after today in India. */
export const isFutureDay = (ymd: string) => ymd > todayIST();

export const nowParts = () => {
  const { year, month } = istFields();
  return { year, month };
};

/** "30 Sep 2026" */
export const formatDateIST = (d: Date) => {
  const f = istFields(d);
  return `${pad(f.day)} ${MONTHS_SHORT[f.month - 1]} ${f.year}`;
};

/** "3:30 pm" */
export const formatTimeIST = (d: Date) => {
  const { hour, minute } = istFields(d);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)} ${hour < 12 ? "am" : "pm"}`;
};

/** "30 Sep 2026, 3:30 pm" */
export const formatDateTimeFullIST = (d: Date) => `${formatDateIST(d)}, ${formatTimeIST(d)}`;
