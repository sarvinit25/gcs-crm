// Lays out what a customer told Ria on WhatsApp (or typed into the website's second form) as CAM answers, so the CAM starts
// part filled and nobody is asked the same thing twice. Pure and cautious: it never turns a band ("700 to 749") into a
// figure, never guesses, and a value a person already put in the CAM or on the lead always wins (see withPrefill).

import { parseMoney } from "../whatsapp/intake/intake.engine";
import type { CamData } from "./cam-schema";

export type ChatRow = { label: string; value: string };

type Rec = Record<string, unknown>;
const NOT_GIVEN = /^Not (sure|given)/i;

/** A CAM select answer from the customer's words, or null when none of the CAM's choices fits. */
const pick = (value: string, table: [RegExp, string][]): string | null => table.find(([rx]) => rx.test(value))?.[1] ?? null;
const yes = (v: string) => /^yes/i.test(v);
const no = (v: string) => /^no\b/i.test(v);

const PROPERTY_TYPE: [RegExp, string][] = [
  [/^residential/i, "Residential flat"],
  [/^commercial/i, "Commercial shop / office"],
  [/^industrial/i, "Industrial"],
  [/^mixed/i, "Mixed use"],
  [/^plot|^land/i, "Plot / land"],
  [/^other/i, "Other"],
];
const LOAN_TYPE: [RegExp, string][] = [
  [/home loan/i, "Home loan"],
  [/loan against property|^lap/i, "Loan against property"],
  [/business loan/i, "Business loan"],
  [/personal loan/i, "Personal loan"],
  [/vehicle|car loan/i, "Car loan"],
  [/education/i, "Education loan"],
];

export function prefillFromAnswers(rows: ChatRow[]): CamData {
  const by = new Map<string, string>();
  for (const r of rows) {
    const v = (r.value ?? "").trim();
    if (v && !NOT_GIVEN.test(v)) by.set(r.label.trim().toLowerCase(), v);
  }
  // Several questions share a wording across forms; the first label found that starts with the text wins.
  const get = (start: string): string | null => {
    const s = start.toLowerCase();
    for (const [k, v] of by) if (k.startsWith(s)) return v;
    return null;
  };

  const out: Record<string, Rec> = {};
  const set = (section: string, key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    (out[section] ??= {})[key] = value;
  };
  const money = (start: string) => {
    const v = get(start);
    return v ? parseMoney(v) : null;
  };

  // ── how they earn ──
  set("income", "employerType", pick(get("Where do you work?") ?? "", [[/^government/i, "Government / PSU"], [/^listed/i, "Listed company / MNC"], [/^private limited/i, "Private limited"], [/^small firm/i, "Proprietorship / partnership firm"], [/^other/i, "Other"]]));
  set("income", "salaryMode", pick(get("How is the salary paid?") ?? "", [[/^credited/i, "Bank transfer"], [/^partly/i, "Part bank, part cash"], [/^cash/i, "Cash"]]));
  set("income", "nature", get("Your business or profession"));
  const who = get("Name of your employer or business");
  if (who) { set("income", "employer", who); set("income", "businessName", who); }
  const gst = get("Is your business registered under GST?");
  if (gst) set("income", "gstRegistered", yes(gst) ? "Yes" : no(gst) ? "No" : null);
  const itr = get("ITR filed for how many years?");
  if (itr) set("income", "itrFiled", /2 years|3 years/i.test(itr) ? "Yes" : /none|1 year/i.test(itr) ? "No" : null);
  const other = money("Other regular monthly income");
  if (other && other > 0) set("income", "otherIncome", other);
  const rent = money("Rent you receive every month");
  if (rent && rent > 0) set("income", "rentalIncome", rent);
  const turnover = money("Annual turnover");
  const profit = money("Net profit as shown");
  if (turnover || profit) set("income", "financials", [{ year: "Last financial year", ...(turnover ? { turnover } : {}), ...(profit ? { netProfit: profit } : {}) }]);

  // ── banking ──
  const bank = get("Your main bank");
  if (bank) { set("banking", "mainBank", bank); set("loanRequest", "existingBank", bank); }

  // ── credit conduct ──
  const late = get("Any late or missed EMI or card payments");
  if (late) {
    if (no(late)) set("obligations", "overdue", "No");
    else if (/yes/i.test(late)) { set("obligations", "overdue", "Yes"); set("obligations", "overdueDetails", late); }
  }
  const regular = get("How regular has the repayment been?");
  if (regular) {
    if (/every emi on time/i.test(regular)) set("obligations", "overdue", "No");
    else {
      set("obligations", "overdue", "Yes");
      const why = get("Briefly, what caused the delay or overdue?");
      set("obligations", "overdueDetails", `${regular}${why ? `: ${why}` : ""}`);
    }
  }
  const concern = get("Is there anything on your credit report");
  if (concern && /write-off|settlement/i.test(concern)) { set("obligations", "settled", "Yes"); set("obligations", "settledDetails", concern); }

  // ── loans running now ──
  const loans: Rec[] = [];
  const second = get("Is there another running loan");
  const lender1 = get("Bank or NBFC of your biggest running loan");
  if (lender1) {
    const row: Rec = { lender: lender1, status: "Live" };
    const original = money("Original loan amount");
    if (original) row.sanctioned = original;
    // The questions for a second loan share their wording with the first, so the figures are only trusted when there is no second loan.
    if (!second || !yes(second)) {
      const type = pick(get("What kind of loan is it?") ?? "", LOAN_TYPE);
      if (type) row.type = type;
      const left = money("Amount still to be repaid");
      if (left) row.outstanding = left;
      const emi = money("Its monthly EMI");
      if (emi) row.emi = emi;
    }
    loans.push(row);
  }
  // the loan they want moved is a loan running now that will close
  const moving = get("Which bank or finance company has it now?") ?? get("Which lender has it now?") ?? get("Which lender?");
  if (moving) {
    const row: Rec = { lender: moving, status: "Will be closed from this loan" };
    const type = pick(get("Type of loan") ?? "", LOAN_TYPE);
    if (type) row.type = type;
    const emi = money("Your EMI for this loan");
    if (emi) row.emi = emi;
    loans.push(row);
  }
  if (loans.length) set("obligations", "loans", loans);

  // ── the property ──
  const ptype = pick(get("Type of property") ?? get("What kind of property?") ?? "", PROPERTY_TYPE);
  set("property", "type", ptype);
  set("property", "address", get("Location of the property"));
  set("property", "marketValue", money("Approximate market value"));
  set("property", "agreementValue", money("Property price / agreement value"));
  const owner = get("Whose name is the property in?");
  if (owner) {
    if (/^my own/i.test(owner)) set("property", "ownership", "Sole");
    else if (/^jointly/i.test(owner)) set("property", "ownership", "Joint with family");
    else if (/^my company/i.test(owner)) set("property", "ownership", "Company / firm");
    else set("property", "ownerName", owner);
  }
  const use = get("How is the property used today?");
  if (use) set("property", "usage", pick(use, [[/self/i, "Self-occupied"], [/rented/i, "Rented out"], [/vacant/i, "Vacant"]]));
  const charge = get("Is there already a loan on");
  if (charge) {
    set("property", "existingCharge", yes(charge) ? "Yes" : no(charge) ? "No" : null);
    if (yes(charge)) set("property", "existingChargeAmount", money("Amount still to be repaid on it"));
  }
  const title = get("Is the title clear");
  if (title && yes(title)) set("property", "titleClear", "Yes");
  if (ptype && get("Location of the property")) set("loanRequest", "security", `${ptype} at ${get("Location of the property")}`);

  // ── what they want, and who applies with them ──
  const purpose = get("What do you need the money for?") ?? get("What is the loan for?") ?? get("What will you use the money for?") ?? get("What is the top-up for?");
  const purposeDetail = get("Please say what it is for");
  if (purpose) set("loanRequest", "purpose", purposeDetail && /^other/i.test(purpose) ? `Other: ${purposeDetail}` : purpose);
  const when = get("When do you need it?") ?? get("When do you need the loan?") ?? get("When would you like to move the loan?") ?? get("When do you need the funds?");
  if (when) set("loanRequest", "timeline", pick(when, [[/^immediately/i, "Within a week"], [/^within a month/i, "Within a month"], [/1 to 3 months/i, "1 to 3 months"], [/exploring/i, "Just exploring"]]));
  const co = get("Will someone apply with you");
  if (co) {
    set("loanRequest", "coApplicant", yes(co) ? "Yes" : no(co) ? "No" : null);
    if (yes(co)) set("loanRequest", "coApplicantIncome", money("Their monthly income"));
  }
  const declined = [...by.entries()].find(([k]) => k.endsWith("application of yours been declined before?"));
  if (declined) {
    set("loanRequest", "previousRejection", yes(declined[1]) ? "Yes" : no(declined[1]) ? "No" : null);
    if (yes(declined[1])) set("loanRequest", "rejectionDetails", get("Which lender, and when?"));
  }

  return out as CamData;
}
