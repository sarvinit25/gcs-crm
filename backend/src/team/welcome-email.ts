import type { Role } from "@prisma/client";

const NAVY = "#0b1849";
const GOLD = "#e4b028";
const GOLD_DARK = "#9c7410";
const PALE = "#fbf6e6";
const MUTED = "#5b6478";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Super Admin", MANAGER: "Admin", ADVISOR: "Staff" } as Record<Role, string>;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const crmLoginUrl = () => (process.env.CRM_PUBLIC_URL?.trim() || "https://crm.growthcapitalservices.in/crm") + "/login";

/** The mail a new team member gets: who they are, how to sign in, and the first thing to do. */
export function welcomeEmail(input: { name: string; email: string; role: Role; password: string; loginUrl?: string }) {
  const url = input.loginUrl ?? crmLoginUrl();
  const first = input.name.trim().split(/\s+/)[0] ?? input.name;
  const role = ROLE_LABEL[input.role] ?? "Staff";
  const subject = "Your Growth Capital Services CRM account is ready";

  const text = [
    `Hello ${first},`,
    "",
    `Your CRM account at Growth Capital Services is ready (${role}).`,
    "",
    `Open the CRM: ${url}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    "",
    "You will be asked to choose your own password the first time you sign in. We also suggest switching on two-step login from your profile.",
    "",
    "Growth Capital Services",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f2;">
<tr><td style="background:${NAVY};padding:22px 28px;">
<div style="font-size:11px;letter-spacing:2px;color:${GOLD};text-transform:uppercase;font-weight:700;">Growth Capital Services</div>
<div style="font-size:22px;color:#ffffff;font-weight:700;margin-top:4px;">Welcome to the team</div></td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;">Hello ${esc(first)},</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:${MUTED};">Your CRM account is ready. You have been added as <strong style="color:${NAVY};">${esc(role)}</strong>. Here is everything you need to sign in.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALE};border-radius:10px;margin:0 0 22px 0;"><tr><td style="padding:18px 20px;">
<div style="font-size:12px;letter-spacing:1.5px;color:${GOLD_DARK};text-transform:uppercase;font-weight:700;margin-bottom:10px;">Your sign-in details</div>
<div style="font-size:13px;color:${MUTED};">Email</div>
<div style="font-size:15px;font-weight:700;margin-bottom:12px;">${esc(input.email)}</div>
<div style="font-size:13px;color:${MUTED};">Temporary password</div>
<div style="font-size:18px;font-weight:700;letter-spacing:.5px;font-family:Consolas,Menlo,monospace;">${esc(input.password)}</div></td></tr></table>
<p style="margin:0 0 24px 0;"><a href="${esc(url)}" style="display:inline-block;background:${GOLD};color:${NAVY};text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:9px;">Open the CRM</a></p>
<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:${MUTED};"><strong style="color:${NAVY};">First time?</strong> You will be asked to choose your own password right after you sign in. We also suggest switching on two-step login from your profile.</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">If the button does not open, copy this link into your browser:<br><span style="color:${GOLD_DARK};word-break:break-all;">${esc(url)}</span></p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e6e9f2;font-size:12px;color:${MUTED};">Please do not share this email. If you were not expecting it, tell the office.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text };
}
