/** Calendar days are India time (the firm works in Mumbai), wherever the browser is. */
const TZ = "Asia/Kolkata";

/** Today's India date as YYYY-MM-DD — never the browser's or UTC's idea of "today". */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

/** True when a YYYY-MM-DD day is after today in India. */
export const isFutureDay = (ymd: string) => ymd > todayIST();

export const nowParts = () => {
  const [year, month] = todayIST().split("-").map(Number);
  return { year, month };
};
