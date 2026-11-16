// What a client sends from the public testimonial form, checked and cleaned. Nothing here is published: it lands in a queue
// for staff, who decide. The form is open to anyone with the link, so it is strict about size and strips junk.

export type Submission = {
  name: string;
  city: string | null;
  product: string | null;
  role: string | null;
  contact: string | null;
  rating: number;
  quote: string;
  consentPhoto: boolean;
  signedName: string;
};

export type Read = { spam: true } | { error: string } | { value: Submission };

const clean = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const yes = (v: unknown) => v === true || (typeof v === "string" && /^(true|on|yes|1)$/i.test(v.trim()));

/** `website` is a field real people never see: a bot that fills it in is quietly dropped. */
export function readSubmission(raw: Record<string, unknown>, hasPhoto: boolean): Read {
  if (clean(raw.website)) return { spam: true };

  const name = clean(raw.name);
  if (name.length < 2 || name.length > 120) return { error: "Please enter your full name." };

  const quote = clean(raw.quote);
  if (quote.length < 20) return { error: "Please write a little more, at least a couple of sentences." };
  if (quote.length > 1200) return { error: "That is a bit long. Please keep it under 1,200 characters." };
  if ((quote.match(/https?:\/\/|www\./gi) ?? []).length > 0) return { error: "Please leave web links out of your message." };

  const rating = Number(clean(raw.rating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Please choose a rating from 1 to 5." };

  if (!yes(raw.consentWords)) return { error: "Please tick the box that lets us publish your words, name and city." };

  const signedName = clean(raw.signedName);
  if (signedName.length < 2 || signedName.length > 120) return { error: "Please type your full name as your signature." };

  const optional = (v: unknown, max: number, label: string): string | null | { error: string } => {
    const s = clean(v).replace(/\n/g, " ");
    if (!s) return null;
    return s.length > max ? { error: `${label} is too long.` } : s;
  };
  const city = optional(raw.city, 80, "City");
  const product = optional(raw.product, 120, "Loan");
  const role = optional(raw.role, 120, "Work");
  const contact = optional(raw.contact, 120, "Phone or email");
  for (const x of [city, product, role, contact]) if (x && typeof x === "object") return x;

  return {
    value: {
      name,
      city: city as string | null,
      product: product as string | null,
      role: role as string | null,
      contact: contact as string | null,
      rating,
      quote,
      consentPhoto: hasPhoto && yes(raw.consentPhoto),
      signedName,
    },
  };
}
