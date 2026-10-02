/**
 * Reduces whatever was typed or pasted ("+91 98205 92765", "098205-92765", "836 9122426")
 * to the plain 10-digit number we store. Anything that doesn't come out as ten digits is
 * returned as digits only, so validation can reject it with a clear message.
 */
export function normalisePhone(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let d = String(value).replace(/\D/g, "");
  if (!d) return undefined;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
