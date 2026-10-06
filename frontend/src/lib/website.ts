import type { LeadStatus } from "./types";

export type SubmissionOutcome = "NEW_LEAD" | "DUPLICATE_KEPT" | "DUPLICATE_UPDATED";

export type Submission = {
  id: string;
  receivedAt: string;
  form: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  loanType: string | null;
  amount: string | null;
  detail: string | null;
  landingPage: string | null;
  entries: number;
  outcome: SubmissionOutcome;
  sharedPhone: boolean;
  leadId: string | null;
  /** How many other entries were merged into the same lead. */
  others: number;
  lead: { id: string; leadNo: number; name: string; status: LeadStatus; assignedOfficer: { id: string; name: string } | null } | null;
};

export type SubmissionList = {
  items: Submission[];
  total: number;
  page: number;
  pageSize: number;
  summary: { received: number; newLeads: number; duplicatesKept: number; duplicatesUpdated: number; sharedPhone: number };
  forms: { form: string; count: number }[];
};

// The forms the website sends today. A form not listed here still shows, under a tidied-up version of its own name.
const FORM_LABEL: Record<string, string> = {
  "contact-form": "Apply / contact form",
  "ca-legal-enquiry": "CA & Legal enquiry",
  "checklist-download": "Checklist download",
  "partner-enquiry": "Become-a-partner enquiry",
};

export function formLabel(form: string): string {
  const known = FORM_LABEL[form];
  if (known) return known;
  const words = form.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown form";
}

export const OUTCOME_LABEL: Record<SubmissionOutcome, { label: string; hint: string; chip: string }> = {
  NEW_LEAD: { label: "New lead", hint: "Created a new lead", chip: "bg-emerald-50 text-emerald-700" },
  DUPLICATE_KEPT: { label: "Duplicate", hint: "Same person was already a lead with at least as much detail, so this was only logged", chip: "bg-slate-100 text-slate-600" },
  DUPLICATE_UPDATED: { label: "Duplicate · merged", hint: "Same person was already a lead; this entry had more detail, so the lead was updated from it", chip: "bg-amber-50 text-amber-700" },
};

export type AdStatus = "LIVE" | "SCHEDULED" | "ENDED" | "PAUSED";

export type WebsiteAd = {
  id: string;
  title: string;
  imageMime: string;
  imageSize: number;
  linkUrl: string | null;
  startsOn: string;
  endsOn: string;
  paused: boolean;
  status: AdStatus;
  createdByName: string;
  createdAt: string;
};

export const AD_STATUS: Record<AdStatus, { label: string; chip: string; hint: string }> = {
  LIVE: { label: "Live now", chip: "bg-emerald-50 text-emerald-700", hint: "Visitors to the website see this poster" },
  SCHEDULED: { label: "Scheduled", chip: "bg-sky-50 text-sky-700", hint: "Starts on its first day" },
  ENDED: { label: "Ended", chip: "bg-slate-100 text-slate-600", hint: "Its last day has passed" },
  PAUSED: { label: "Paused", chip: "bg-amber-50 text-amber-700", hint: "Switched off; the dates are kept" },
};

export const MAX_AD_MB = 3;
export const AD_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** A problem with the chosen poster file, or null if it is fine. (The server checks again from the file's real contents.) */
export function adFileProblem(file: { type: string; size: number }): string | null {
  if (!AD_TYPES.includes(file.type)) return "The poster must be a PNG, JPG or WebP image";
  if (file.size > MAX_AD_MB * 1024 * 1024) return `The poster must be ${MAX_AD_MB} MB or smaller`;
  return null;
}
