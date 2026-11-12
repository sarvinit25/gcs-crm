// The emails the CRM sends: an alert for the team, a thank-you for the customer and the sign-in code for the
// website chat. Plain tables and inline styles, because email programs ignore most modern styling. The look
// matches the website's own emails. Company name, address, phone and email come from Settings -> Organisation.

const NAVY = "#0b1849";
const GOLD = "#e4b028";
const GOLD_DARK = "#9c7410";
const PALE = "#fbf5e4";
const MUTED = "#5b6478";

/** `phone` is the number people call; `whatsapp` is the number the WhatsApp links open (falls back to `phone` if not set). */
export type Org = { name: string; address: string; phone: string; whatsapp?: string; email: string; websiteUrl: string };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
export const telHref = (phone: string) => `tel:+91${digits(phone)}`;
export const whatsappHref = (phone: string, text?: string) =>
  `https://wa.me/91${digits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** The shared frame: logo band, a gold line, the body, and a footer with how to reach us. */
function frame(org: Org, preheader: string, inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f3f8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f3f8;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:${NAVY};">
<tr><td style="background:${NAVY};padding:22px 28px;" align="left">
<img src="${org.websiteUrl}/brand/gcs-lockup.png" alt="${esc(org.name)}" width="150" style="display:block;border:0;height:auto;background:#ffffff;border-radius:8px;padding:6px 10px;">
</td></tr>
<tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 8px 28px;">${inner}</td></tr>
<tr><td style="padding:8px 28px 26px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e9f2;">
<tr><td style="padding-top:18px;font-size:13px;line-height:1.6;color:${MUTED};">
<strong style="color:${NAVY};">${esc(org.name)}</strong><br>
${esc(org.address)}<br>
Phone <a href="${telHref(org.phone)}" style="color:${GOLD_DARK};text-decoration:none;">${esc(org.phone)}</a>
 &nbsp;|&nbsp; <a href="mailto:${esc(org.email)}" style="color:${GOLD_DARK};text-decoration:none;">${esc(org.email)}</a>
</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string, solid: boolean) =>
  `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;${
    solid ? `background:${GOLD};color:${NAVY};` : `border:1px solid ${NAVY};color:${NAVY};`
  }">${esc(label)}</a>`;

/** What the customer receives after sending an enquiry. `message` is the wording set in Settings -> Alerts. */
export function customerThankYou(org: Org, firstName: string, message: string): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return frame(
    org,
    "We have received your enquiry. A loan expert will contact you.",
    `<h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:${NAVY};">Thank you, ${esc(firstName)}.</h1>
${paragraphs}
<p style="margin:6px 0 22px 0;">${button(whatsappHref(org.whatsapp || org.phone), "Message us on WhatsApp", true)}${button(telHref(org.phone), "Call us", false)}</p>
<p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:${MUTED};">This is an enquiry, not a loan approval. A lender decides after its own checks. If you did not make this enquiry, you can ignore this email.</p>`,
  );
}

type Row = [label: string, value: string];

/** What the team receives for each new enquiry or partner sign-up. */
export function teamAlert(org: Org, heading: string, rows: Row[], detail: string, phone: string, whatsappText: string): string {
  const table = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:9px 0;width:120px;font-size:13px;color:${MUTED};border-bottom:1px solid #eef0f6;">${esc(k)}</td><td style="padding:9px 0;font-size:14px;font-weight:600;border-bottom:1px solid #eef0f6;">${esc(v)}</td></tr>`,
    )
    .join("");
  return frame(
    org,
    heading,
    `<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:1.5px;color:${GOLD_DARK};text-transform:uppercase;">${esc(heading)}</p>
<h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.3;color:${NAVY};">${esc(rows[0]?.[1] ?? "New enquiry")}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">${table}</table>
${
  detail
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:1.5px;color:${GOLD_DARK};text-transform:uppercase;">Details</p>
<div style="background:${PALE};border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0 0 20px 0;">${esc(detail)}</div>`
    : ""
}
<p style="margin:0 0 20px 0;">${button(telHref(phone), "Call the customer", true)}${button(whatsappHref(phone, whatsappText), "WhatsApp", false)}</p>`,
  );
}

/** The code that proves a mobile number is theirs, before a GCS ID is sent. */
export function recoveryCode(org: Org, code: string, validMinutes: number, idName: string): string {
  return frame(
    org,
    `Your ${org.name} code is ${code}`,
    `<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${NAVY};">Your confirmation code</h1>
<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">Type this code on the Track Application page to get your ${esc(idName)}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;"><tr><td style="background:${PALE};border:1px solid ${GOLD};border-radius:12px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};">${esc(code)}</td></tr></table>
<p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:${MUTED};">It works for ${validMinutes} minutes. Please do not share it with anyone. If you did not ask for it, you can ignore this email.</p>`,
  );
}

/** The GCS ID(s) a client or partner asked for, sent only to the email address held on their file. */
export function gcsIdMessage(org: Org, idName: string, ids: string[]): string {
  const rows = ids
    .map((id) => `<tr><td style="background:${PALE};border:1px solid ${GOLD};border-radius:10px;padding:12px 22px;font-size:24px;font-weight:700;letter-spacing:4px;color:${NAVY};">${esc(id)}</td></tr><tr><td style="height:8px;"></td></tr>`)
    .join("");
  return frame(
    org,
    `Your ${idName}`,
    `<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${NAVY};">Your ${esc(idName)}</h1>
<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">Here ${ids.length > 1 ? "are your IDs, newest first" : "is your ID"}. Use ${ids.length > 1 ? "one" : "it"} with your mobile number on the Track Application page.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;">${rows}</table>
<p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:${MUTED};">Keep it private. If you did not ask for it, please call us on ${esc(org.phone)}.</p>`,
  );
}

/** The one-time code that signs a visitor in to the website chat. */
export function signInCode(org: Org, firstName: string, code: string, validMinutes: number): string {
  return frame(
    org,
    `Your ${org.name} code is ${code}`,
    `<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${NAVY};">Hi ${esc(firstName)}, here is your code</h1>
<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">Type this code in the chat window to start talking to Gia, our assistant.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;"><tr><td style="background:${PALE};border:1px solid ${GOLD};border-radius:12px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};">${esc(code)}</td></tr></table>
<p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:${MUTED};">It works for ${validMinutes} minutes. Please do not share it with anyone. If you did not ask for it, you can ignore this email.</p>`,
  );
}
