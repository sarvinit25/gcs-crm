import { NotificationRecipient, NotificationTrigger } from "@prisma/client";

export type TriggerVariable = { key: string; label: string; example: string };

export type TriggerInfo = {
  label: string;
  description: string;
  recipients: NotificationRecipient[];
  variables: TriggerVariable[];
};

const V = (key: string, label: string, example: string): TriggerVariable => ({ key, label, example });

const company = V("company", "Company name", "Growth Capital Services");

/** What each automatic message is for, who may receive it, and which placeholders its wording may use. */
export const TRIGGERS: Record<NotificationTrigger, TriggerInfo> = {
  LEAD_CREATED: {
    label: "Lead created",
    description: "A new enquiry reaches the CRM — from the website, a partner, or typed in by staff.",
    recipients: ["CUSTOMER", "EMPLOYEE"],
    variables: [V("name", "Customer name", "Rahul Mehta"), V("phone", "Customer phone", "9820592765"), V("loanType", "Loan type", "Home Loan"), V("source", "Where it came from", "website"), company],
  },
  FILE_STAGE_CHANGED: {
    label: "File stage changed",
    description: "A loan file moves to a new stage (submitted, bank login, under review, …).",
    recipients: ["CUSTOMER", "EMPLOYEE"],
    variables: [V("name", "Customer name", "Rahul Mehta"), V("applicationNo", "Application number", "GCS-2026-0042"), V("stage", "New stage", "Under review"), V("loanType", "Loan type", "Home Loan"), company],
  },
  FILE_REJECTED: {
    label: "File rejected",
    description: "A file is rejected by the lender or marked rejected.",
    recipients: ["CUSTOMER", "EMPLOYEE"],
    variables: [V("name", "Customer name", "Rahul Mehta"), V("applicationNo", "Application number", "GCS-2026-0042"), V("loanType", "Loan type", "Home Loan"), company],
  },
  SANCTION_APPROVED: {
    label: "Sanction approved",
    description: "The lender's financial sanction is recorded as approved.",
    recipients: ["CUSTOMER", "EMPLOYEE"],
    variables: [V("name", "Customer name", "Rahul Mehta"), V("applicationNo", "Application number", "GCS-2026-0042"), V("amount", "Sanctioned amount", "₹42,00,000"), V("lender", "Lender", "HDFC Bank"), company],
  },
  DISBURSAL_COMPLETED: {
    label: "Disbursal completed",
    description: "A payout is recorded against a sanctioned file.",
    recipients: ["CUSTOMER", "EMPLOYEE"],
    variables: [V("name", "Customer name", "Rahul Mehta"), V("applicationNo", "Application number", "GCS-2026-0042"), V("amount", "Amount disbursed", "₹10,00,000"), company],
  },
  MORNING_BRIEF: {
    label: "Morning brief",
    description: "Sent to the admin's phone at the morning time set in WhatsApp setup.",
    recipients: ["EMPLOYEE"],
    variables: [V("date", "Today's date", "4 Nov 2026"), V("activeFiles", "Files being worked", "18"), V("followUpsDue", "Follow-ups due today", "6"), V("newLeadsYesterday", "New leads yesterday", "4"), company],
  },
  EVENING_BRIEF: {
    label: "Evening brief",
    description: "Sent to the admin's phone at the evening time set in WhatsApp setup.",
    recipients: ["EMPLOYEE"],
    variables: [V("date", "Today's date", "4 Nov 2026"), V("newLeadsToday", "New leads today", "5"), V("sanctionedToday", "Sanctions today", "2"), V("disbursedToday", "Payouts today", "1"), V("disbursedAmountToday", "Amount disbursed today", "₹10,00,000"), V("followUpsPending", "Follow-ups still pending", "3"), company],
  },
};

export const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  BANK_LOGIN: "Logged in with the bank",
  UNDER_REVIEW: "Under review",
  SANCTIONED: "Sanctioned",
  DISBURSED: "Disbursed",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Placeholders in order of first appearance, without repeats. */
export function extractVariables(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(VARIABLE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Fills the placeholders in. A value that is missing becomes empty rather than leaving "{{name}}" in a customer's phone. */
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE, (_m, key: string) => values[key] ?? "");
}

/** Meta numbers the placeholders: "Hi {{name}}, {{stage}}" becomes "Hi {{1}}, {{2}}". */
export function toMetaBody(body: string): string {
  const order = extractVariables(body);
  return body.replace(VARIABLE, (_m, key: string) => `{{${order.indexOf(key) + 1}}}`);
}

/** The values to pass, in placeholder order. */
export function orderedValues(body: string, values: Record<string, string>): string[] {
  return extractVariables(body).map((key) => values[key] ?? "");
}

/**
 * Things worth catching here rather than after Meta rejects the template.
 * Returns a plain-language problem, or null when the wording is fine.
 */
export function templateProblem(body: string, trigger: NotificationTrigger): string | null {
  const text = body.trim();
  if (!text) return "The message can't be empty";
  if (text.length > 1024) return "WhatsApp allows at most 1,024 characters in a message";
  const allowed = TRIGGERS[trigger].variables.map((v) => v.key);
  const unknown = extractVariables(text).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    return `{{${unknown[0]}}} isn't available for "${TRIGGERS[trigger].label}". You can use: ${allowed.map((k) => `{{${k}}}`).join(", ")}`;
  }
  // Meta refuses a message that opens or closes on a placeholder, or that is mostly placeholders.
  if (/^\s*\{\{/.test(text)) return "WhatsApp doesn't allow a message to start with a placeholder — begin with a word or two";
  if (/\}\}\s*$/.test(text)) return "WhatsApp doesn't allow a message to end with a placeholder — add a closing word or full stop";
  return null;
}

/** Sample values for Meta's review, in placeholder order. */
export function examplesFor(body: string, trigger: NotificationTrigger): string[] {
  const info = TRIGGERS[trigger];
  return extractVariables(body).map((k) => info.variables.find((v) => v.key === k)?.example ?? "Sample");
}

/** Meta names: lowercase letters, digits and underscores, up to 512 characters. */
export const metaName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

type Default = { code: string; name: string; trigger: NotificationTrigger; recipient: NotificationRecipient; body: string };

export const DEFAULT_TEMPLATES: Default[] = [
  { code: "lead_created_customer_wa", name: "Enquiry received (customer)", trigger: "LEAD_CREATED", recipient: "CUSTOMER", body: "Hello {{name}}, thank you for contacting {{company}} about your {{loanType}}. Our team will call you shortly. You can reply here with any question." },
  { code: "lead_created_employee_wa", name: "New lead assigned (employee)", trigger: "LEAD_CREATED", recipient: "EMPLOYEE", body: "New lead for you: {{name}}, {{phone}}, interested in {{loanType}}, from {{source}}. Please call them today." },
  { code: "file_stage_changed_customer_wa", name: "File stage update (customer)", trigger: "FILE_STAGE_CHANGED", recipient: "CUSTOMER", body: "Hello {{name}}, your {{loanType}} file {{applicationNo}} is now: {{stage}}. We will keep you posted at every step. — {{company}}." },
  { code: "file_stage_changed_employee_wa", name: "File stage update (employee)", trigger: "FILE_STAGE_CHANGED", recipient: "EMPLOYEE", body: "File {{applicationNo}} of {{name}} moved to: {{stage}}." },
  { code: "file_rejected_customer_wa", name: "File rejected (customer)", trigger: "FILE_REJECTED", recipient: "CUSTOMER", body: "Hello {{name}}, unfortunately your {{loanType}} file {{applicationNo}} could not go ahead with this lender. Our team will call you about other options. — {{company}}." },
  { code: "file_rejected_employee_wa", name: "File rejected (employee)", trigger: "FILE_REJECTED", recipient: "EMPLOYEE", body: "File {{applicationNo}} of {{name}} was rejected. Please speak to the customer about alternatives." },
  { code: "sanction_approved_customer_wa", name: "Sanction approved (customer)", trigger: "SANCTION_APPROVED", recipient: "CUSTOMER", body: "Good news {{name}}! {{lender}} has sanctioned {{amount}} on your file {{applicationNo}}. We will guide you through the next steps. — {{company}}." },
  { code: "sanction_approved_employee_wa", name: "Sanction approved (employee)", trigger: "SANCTION_APPROVED", recipient: "EMPLOYEE", body: "Sanction approved: {{amount}} from {{lender}} for {{name}} (file {{applicationNo}})." },
  { code: "disbursal_completed_customer_wa", name: "Disbursal completed (customer)", trigger: "DISBURSAL_COMPLETED", recipient: "CUSTOMER", body: "Hello {{name}}, {{amount}} has been disbursed against your file {{applicationNo}}. Thank you for choosing {{company}}." },
  { code: "disbursal_completed_employee_wa", name: "Disbursal completed (employee)", trigger: "DISBURSAL_COMPLETED", recipient: "EMPLOYEE", body: "Disbursal recorded: {{amount}} for {{name}} (file {{applicationNo}}). Remember to record the commission." },
  { code: "morning_brief_wa", name: "Morning brief (admin)", trigger: "MORNING_BRIEF", recipient: "EMPLOYEE", body: "Good morning! {{date}}: {{activeFiles}} files in progress, {{followUpsDue}} follow-ups due today, {{newLeadsYesterday}} new leads yesterday. — {{company}}." },
  { code: "evening_brief_wa", name: "Evening brief (admin)", trigger: "EVENING_BRIEF", recipient: "EMPLOYEE", body: "Day summary for {{date}}: {{newLeadsToday}} new leads, {{sanctionedToday}} sanctions, {{disbursedToday}} payouts ({{disbursedAmountToday}}), {{followUpsPending}} follow-ups still pending. — {{company}}." },
];
