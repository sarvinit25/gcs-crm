// The Customer Loan Profile: the one list of questions that the WhatsApp assistant, the AI telecaller, the
// website assistant (Gia) and staff all work from. The AI may word a question however suits the person, but what
// is stored is fixed here: every answer is turned into one of these allowed values (or a clean number/text) before
// it is kept. Change a question or an option here and every channel follows.

export type Answers = Record<string, string>;

export type Kind =
  | "choice" // exactly one of `options`
  | "multi" // one or more of `options`
  | "yesno"
  | "money" // rupees, stored as whole-number text
  | "int"
  | "percent"
  | "text";

export type Field = {
  /** Stable key. Stored answers are kept under `lp-<id>`. */
  id: string;
  /** Number in the form, for staff ("1.1"). */
  num: string;
  section: string;
  label: string;
  /** Plain default wording; the AI may reword it. */
  ask: string;
  kind: Kind;
  options?: string[];
  min?: number;
  max?: number;
  /** A line shown after the question, e.g. "in years". */
  hint?: string;
  /** Can be left blank by saying "skip". */
  optional?: boolean;
};

const YN = ["Yes", "No"];
const RELATION = ["Spouse", "Father", "Mother", "Son", "Daughter", "Other"];
const PROFILE = ["Salaried", "Self-Employed", "Business Owner"];
const CONFIG = ["1 RK", "1 BHK", "2 BHK", "3 BHK", "Other"];
const AREA_TYPE = ["Carpet", "Built-Up"];
const OCCUPANCY = ["Self-Occupied", "Rented", "Vacant"];
const PROP_ALL = ["Flat", "Shop", "Office", "Commercial", "Industrial", "Other"];
const PROP_SELF = ["Residential Flat", "Shop", "Office", "Commercial", "Industrial", "Other"];
const LOAN_TYPES = ["Home Loan", "LAP", "Business Loan", "Personal Loan", "Vehicle Loan", "OD", "CC", "Other"];

export const MAX_REPEATS = 6;

const f = (
  num: string,
  section: string,
  id: string,
  label: string,
  ask: string,
  kind: Kind,
  extra: Partial<Field> = {},
): Field => ({ id, num, section, label, ask, kind, ...extra });

const loanFields = (n: number): Field[] => {
  const s = "Existing loans";
  const p = `loan-${n}-`;
  const t = n === 1 ? "" : ` (loan ${n})`;
  return [
    f(`8.2`, s, `${p}bank`, `Bank / NBFC${t}`, `Which bank or NBFC is this loan with?`, "text"),
    f(`8.3`, s, `${p}type`, `Loan type${t}`, `What type of loan is it?`, "choice", { options: LOAN_TYPES }),
    f(`8.4`, s, `${p}original`, `Original loan amount${t}`, `What was the original loan amount?`, "money"),
    f(`8.5`, s, `${p}outstanding`, `Current outstanding${t}`, `How much is outstanding right now?`, "money"),
    f(`8.6`, s, `${p}emi`, `Monthly EMI${t}`, `What is the monthly EMI?`, "money"),
    f(`8.7`, s, `${p}roi`, `Current ROI${t}`, `What interest rate are you paying (% per year)?`, "percent", { optional: true }),
    f(`8.8`, s, `${p}tenure`, `Remaining tenure${t}`, `How much tenure is left? (months or years)`, "text"),
    f(`8.9`, s, `${p}since`, `Running since${t}`, `Since when has this loan been running?`, "text"),
    f(`8.9`, s, `add-loan-${n}`, `Add another loan`, `Is there another running loan or credit facility to add?`, "yesno"),
  ];
};

const otherPropertyFields = (n: number): Field[] => {
  const s = "Other existing property";
  const p = `other-property-${n}-`;
  const t = n === 1 ? "" : ` (property ${n})`;
  return [
    f("6.2", s, `${p}type`, `Property type${t}`, `What type of property is it?`, "choice", { options: PROP_ALL }),
    f("6.3", s, `${p}location`, `Property location${t}`, `Where is it located?`, "text"),
    f("6.4", s, `${p}occupancy`, `Occupancy status${t}`, `Is it self-occupied, rented or vacant?`, "choice", { options: OCCUPANCY }),
    f("6.4", s, `add-property-${n}`, `Add another property`, `Do you own any other property to add?`, "yesno"),
  ];
};

/** The questions that apply, in the order they are asked, given the answers so far. Asked ones stay in the list. */
export function fieldsFor(a: Answers): Field[] {
  const out: Field[] = [];
  const g = (id: string) => a[`lp-${id}`];
  const push = (...fs: Field[]) => out.push(...fs);

  // 1. Loan requirement
  push(
    f("1.1", "Loan requirement", "loan-product", "Loan product required", "Which loan are you looking for?", "choice", {
      options: ["Home Loan (HL)", "Loan Against Property (LAP)", "Business Loan (BL)", "Overdraft (OD)"],
    }),
    f("1.2", "Loan requirement", "loan-amount", "Loan amount required", "How much loan amount do you need?", "money"),
    f("1.3", "Loan requirement", "purpose", "Purpose / end use", "What will the loan be used for?", "choice", {
      options: ["Property Purchase", "Business Expansion", "Working Capital", "Balance Transfer", "Balance Transfer + Top-Up", "Personal Requirement", "Other"],
    }),
  );

  // 2. Applicant
  push(
    f("2.1", "Applicant", "age", "Applicant age", "What is your age?", "int", { min: 18, max: 85, hint: "in years" }),
    f("2.2", "Applicant", "profile", "Applicant profile", "Are you salaried, self-employed or a business owner?", "choice", { options: PROFILE }),
    f("2.3", "Applicant", "coapp", "Co-applicant available", "Will there be a co-applicant?", "yesno"),
  );
  if (g("coapp") === "Yes") {
    push(
      f("2.4", "Applicant", "coapp-relation", "Co-applicant relationship", "How is the co-applicant related to you?", "choice", { options: RELATION }),
      f("2.5", "Applicant", "coapp-age", "Co-applicant age", "What is the co-applicant's age?", "int", { min: 18, max: 85, hint: "in years" }),
    );
  }

  // 3. Income / occupation
  const salaried = g("profile") === "Salaried";
  if (g("profile")) {
    if (salaried) {
      const s = "Salaried details";
      push(
        f("3.1", s, "sal-company", "Company name", "Which company do you work for?", "text"),
        f("3.2", s, "sal-since", "Working since", "Since when are you working there?", "text"),
        f("3.3", s, "sal-designation", "Designation", "What is your designation?", "text"),
        f("3.4", s, "sal-gross", "Gross monthly salary", "What is your gross monthly salary?", "money"),
        f("3.5", s, "sal-net", "Net monthly salary", "And your net (in-hand) monthly salary?", "money"),
        f("3.6", s, "sal-lt2", "Less than 2 years in current company", "Have you been with the current company for less than 2 years?", "yesno"),
      );
      if (g("sal-lt2") === "Yes") {
        push(
          f("3.7", s, "sal-prev-company", "Previous company", "What was your previous company?", "text"),
          f("3.8", s, "sal-prev-period", "Previous employment period", "For how long did you work there?", "text"),
          f("3.9", s, "sal-prev-letter", "Relieving / experience letter available", "Do you have the relieving or experience letter from that company?", "yesno"),
        );
      }
    } else {
      const s = "Business details";
      push(
        f("3.1", s, "biz-name", "Business name", "What is your business called?", "text"),
        f("3.2", s, "biz-constitution", "Business constitution", "What is the business constitution?", "choice", {
          options: ["Sole Proprietorship", "Partnership Firm", "LLP", "Private Limited Company", "Limited Company", "Other"],
        }),
        f("3.3", s, "biz-nature", "Nature of business", "What is the nature of the business?", "choice", {
          options: ["Trading", "Manufacturing", "Services", "Contractor", "Professional", "Other"],
        }),
        f("3.4", s, "biz-activity", "Business activity", "Briefly, what does the business do?", "text"),
        f("3.5", s, "biz-premises", "Business premises", "Are the business premises owned or rented?", "choice", { options: ["Owned", "Rented"] }),
        f("3.6", s, "biz-location", "Business location", "Where is the business located?", "text"),
        f("3.7", s, "biz-vintage", "Business vintage", "Since when is the business operating?", "text"),
        f("3.8", s, "biz-employees", "Number of employees", "How many employees or staff do you have?", "int", { min: 0, max: 100000 }),
        f("3.9", s, "biz-gst", "GST registered", "Is the business GST registered?", "yesno"),
        f("3.10", s, "biz-itr", "ITR filing", "Do you file income tax returns?", "yesno"),
      );
      if (g("biz-itr") === "Yes") push(f("3.10", s, "biz-itr-since", "ITR filing since", "Since when have you been filing ITR?", "text"));
      push(
        f("3.11", s, "biz-turnover", "Latest annual turnover", "What was the latest annual turnover?", "money"),
        f("3.12", s, "biz-profit", "Latest net profit", "And the latest net profit?", "money"),
      );
    }
  }

  // 4. Additional earning member
  push(f("4.1", "Additional earning member", "earner", "Additional earning member", "Is there another earning family member whose income can be considered?", "yesno"));
  if (g("earner") === "Yes") {
    const s = "Additional earning member";
    push(
      f("4.2", s, "earner-relation", "Relationship", "How is that person related to you?", "choice", { options: RELATION }),
      f("4.3", s, "earner-age", "Age", "What is their age?", "int", { min: 18, max: 90, hint: "in years" }),
      f("4.4", s, "earner-profile", "Income profile", "Are they salaried, self-employed or a business owner?", "choice", { options: PROFILE }),
    );
    if (g("earner-profile") === "Salaried") {
      push(
        f("4.4", s, "earner-company", "Company name", "Which company do they work for?", "text"),
        f("4.4", s, "earner-since", "Working since", "Since when are they working there?", "text"),
        f("4.4", s, "earner-designation", "Designation", "What is their designation?", "text"),
        f("4.4", s, "earner-gross", "Gross monthly salary", "What is their gross monthly salary?", "money"),
        f("4.4", s, "earner-net", "Net monthly salary", "And their net monthly salary?", "money"),
      );
    } else if (g("earner-profile")) {
      push(
        f("4.4", s, "earner-biz", "Business name", "What is their business called?", "text"),
        f("4.4", s, "earner-vintage", "Business vintage", "Since when has the business been running?", "text"),
        f("4.4", s, "earner-turnover", "Annual turnover", "What is the annual turnover?", "money"),
        f("4.4", s, "earner-profit", "Net profit", "And the net profit?", "money"),
      );
    }
  }

  // 5. Property / transaction
  const s5 = "Property / transaction";
  push(f("5.1", s5, "property-involved", "Property involved in this loan", "Is a property involved in this loan requirement?", "yesno"));
  if (g("property-involved") === "Yes") {
    push(
      f("5.2", s5, "tx-type", "Property transaction type", "Is it a resale property, a builder purchase, or a property you already own?", "choice", {
        options: ["Resale Property", "Builder Purchase", "Self-Owned Property"],
      }),
    );
    const tx = g("tx-type");
    if (tx === "Resale Property") {
      push(
        f("5.3", s5, "rs-type", "Property type", "What type of property is it?", "choice", { options: PROP_ALL }),
        f("5.4", s5, "rs-location", "Property location", "Where is the property located?", "text"),
        f("5.5", s5, "rs-config", "Configuration", "What is the configuration?", "choice", { options: CONFIG, optional: true }),
        f("5.6", s5, "rs-area", "Area (sq. ft.)", "What is the area in sq. ft.?", "int", { min: 1, max: 10000000 }),
        f("5.7", s5, "rs-area-type", "Area type", "Is that carpet or built-up area?", "choice", { options: AREA_TYPE }),
        f("5.8", s5, "rs-building", "Building name", "What is the building name?", "text"),
        f("5.9", s5, "rs-total-floors", "Total floors in building / tower", "How many floors does the building or tower have?", "int", { min: 1, max: 200 }),
        f("5.10", s5, "rs-floor", "Property floor", "Which floor is the property on?", "int", { min: 0, max: 200 }),
        f("5.11", s5, "rs-token", "Token amount paid", "How much token amount have you paid?", "money"),
        f("5.12", s5, "rs-av", "Agreement / deal value (AV)", "What is the agreement or deal value?", "money"),
        f("5.13", s5, "rs-mv", "Approx. market value (MV)", "What is the approximate market value?", "money"),
      );
    } else if (tx === "Builder Purchase") {
      push(f("5.3", s5, "bp-status", "Property status", "Is it ready to move in, or under construction?", "choice", { options: ["Ready to Move", "Under Construction"] }));
      if (g("bp-status") === "Under Construction") push(f("5.4", s5, "bp-possession", "Expected possession date", "What is the expected possession date?", "text"));
      push(
        f("5.5", s5, "bp-location", "Project location", "Where is the project located?", "text"),
        f("5.6", s5, "bp-config", "Configuration", "What is the configuration?", "choice", { options: CONFIG }),
        f("5.7", s5, "bp-area", "Area (sq. ft.)", "What is the area in sq. ft.?", "int", { min: 1, max: 10000000 }),
        f("5.8", s5, "bp-area-type", "Area type", "Is that carpet or built-up area?", "choice", { options: AREA_TYPE }),
        f("5.9", s5, "bp-project", "Project name", "What is the project name?", "text"),
        f("5.10", s5, "bp-builder", "Builder name", "Who is the builder?", "text"),
        f("5.11", s5, "bp-total-floors", "Total floors in tower", "How many floors does the tower have?", "int", { min: 1, max: 200 }),
        f("5.12", s5, "bp-completed", "Construction completed up to (floor)", "Up to which floor has construction been completed?", "int", { min: 0, max: 200 }),
        f("5.13", s5, "bp-floor", "Customer's flat floor", "Which floor is your flat on?", "int", { min: 0, max: 200 }),
        f("5.14", s5, "bp-token", "Token / OCR amount paid", "How much token or OCR amount have you paid?", "money"),
        f("5.15", s5, "bp-av", "Agreement / deal value (AV)", "What is the agreement or deal value?", "money"),
        f("5.16", s5, "bp-loan-amount", "Loan amount required", "And the loan amount you need for this purchase?", "money"),
      );
    } else if (tx === "Self-Owned Property") {
      push(
        f("5.3", s5, "so-type", "Property type", "What type of property is it?", "choice", { options: PROP_SELF }),
        f("5.4", s5, "so-location", "Property location", "Where is it located?", "text"),
        f("5.5", s5, "so-occupancy", "Property occupancy", "Is it self-occupied, rented or vacant?", "choice", { options: OCCUPANCY }),
        f("5.6", s5, "so-mv", "Approx. market value (MV)", "What is its approximate market value?", "money"),
      );
    }
  }

  // 6. Other existing property (repeating)
  push(f("6.1", "Other existing property", "owns-other", "Owns any other property", "Do you currently own any other property?", "yesno"));
  if (g("owns-other") === "Yes") {
    for (let n = 1; n <= MAX_REPEATS; n++) {
      push(...otherPropertyFields(n));
      if (g(`add-property-${n}`) !== "Yes") break;
    }
  }

  // 7. Rental income
  push(f("7.1", "Rental income", "rental", "Additional rental income", "Do you have any additional rental income?", "yesno"));
  if (g("rental") === "Yes") {
    push(
      f("7.2", "Rental income", "rental-type", "Rental property type", "What type of property gives the rent?", "choice", { options: ["Flat", "Shop", "Office", "Other"] }),
      f("7.3", "Rental income", "rental-status", "Rental property status", "Is it already owned, or a proposed purchase?", "choice", { options: ["Already Owned", "Proposed Purchase"] }),
      f("7.4", "Rental income", "rental-amount", "Monthly rental income", "What is the monthly rental income?", "money"),
    );
  }

  // 8. Existing loans (repeating)
  push(f("8.1", "Existing loans", "has-loans", "Running loans / credit facilities", "Do you have any running loans or credit facilities?", "yesno"));
  if (g("has-loans") === "Yes") {
    for (let n = 1; n <= MAX_REPEATS; n++) {
      push(...loanFields(n));
      if (g(`add-loan-${n}`) !== "Yes") break;
    }
  }

  // 9. Credit profile
  push(
    f("9.1", "Credit profile", "cibil", "Approx. CIBIL score", "Roughly what is your CIBIL score?", "choice", { options: ["750+", "700–749", "650–699", "Below 650", "Don't Know"] }),
    f("9.2", "Credit profile", "credit-concern", "Credit / repayment concern", "Is there any credit or repayment concern we should know about?", "yesno"),
  );
  if (g("credit-concern") === "Yes") {
    push(
      f("9.2", "Credit profile", "credit-concern-types", "Concern type", "Which of these apply? (you can pick more than one)", "multi", {
        options: ["EMI Delay", "EMI Bounce", "Overdue", "Loan Settlement", "Write-Off", "Cheque Bounce", "Credit Card Overdue", "CIBIL Reporting Issue", "Other"],
      }),
      f("9.3", "Credit profile", "credit-concern-details", "Details of concern", "Please tell us briefly what happened.", "text", { optional: true }),
    );
  }

  // 10. Previous / current application
  push(f("10.1", "Previous application", "applied", "Applied with a bank / NBFC", "Have you already applied for this loan with any bank or NBFC?", "yesno"));
  if (g("applied") === "Yes") {
    push(
      f("10.2", "Previous application", "applied-bank", "Bank / NBFC name", "Which bank or NBFC?", "text"),
      f("10.3", "Previous application", "applied-status", "Application status", "What is the status of that application?", "choice", {
        options: ["Applied", "Under Process", "Approved", "Sanctioned", "Declined", "On Hold", "Withdrawn", "Other"],
      }),
      f("10.4", "Previous application", "applied-remarks", "Reason / remarks", "Any reason or remarks you know of?", "text", { optional: true }),
    );
  }
  return out;
}

export const answerKey = (id: string) => `lp-${id}`;

/** The next question still unanswered, or null when the profile is complete. */
export function nextField(a: Answers): Field | null {
  return fieldsFor(a).find((x) => a[answerKey(x.id)] === undefined) ?? null;
}

export function progress(a: Answers) {
  const all = fieldsFor(a);
  const done = all.filter((x) => a[answerKey(x.id)] !== undefined).length;
  return { done, total: all.length, complete: done === all.length };
}

// ── Reading an answer ─────────────────────────────────────────

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIASES: Record<string, string[]> = {
  "Home Loan (HL)": ["hl", "home loan", "home", "housing loan", "ghar ka loan"],
  "Loan Against Property (LAP)": ["lap", "loan against property", "property loan", "mortgage"],
  "Business Loan (BL)": ["bl", "business loan", "business"],
  "Overdraft (OD)": ["od", "overdraft", "cc", "cash credit"],
  Salaried: ["salaried", "salary", "job", "service", "employee", "naukri"],
  "Self-Employed": ["self employed", "self-employed", "selfemployed", "professional", "freelancer"],
  "Business Owner": ["business owner", "business", "owner", "businessman", "vyapari"],
  "Resale Property": ["resale", "re sale", "second hand", "secondary"],
  "Builder Purchase": ["builder", "builder purchase", "new", "from builder", "primary"],
  "Self-Owned Property": ["self owned", "self-owned", "own", "owned", "already own", "mine"],
  "Ready to Move": ["ready", "ready to move", "rtm", "possession ready"],
  "Under Construction": ["under construction", "uc", "construction", "ongoing"],
  Carpet: ["carpet"],
  "Built-Up": ["built up", "built-up", "builtup", "super built up"],
  "Self-Occupied": ["self occupied", "self-occupied", "own use", "living", "staying"],
  Rented: ["rented", "rent", "tenant", "on rent"],
  Vacant: ["vacant", "empty"],
  LAP: ["lap", "loan against property"],
  "Home Loan": ["hl", "home loan", "housing"],
  "Business Loan": ["bl", "business loan"],
  "Personal Loan": ["pl", "personal loan", "personal"],
  "Vehicle Loan": ["vehicle", "car loan", "auto loan", "two wheeler", "bike loan", "car"],
  OD: ["od", "overdraft"],
  CC: ["cc", "cash credit", "credit card"],
  "Don't Know": ["dont know", "don t know", "do not know", "not sure", "no idea", "unknown", "pata nahi", "nahi pata"],
  "Below 650": ["below 650", "less than 650", "under 650", "low"],
  "750+": ["750+", "750 plus", "above 750", "750 and above", "more than 750"],
  "Property Purchase": ["property purchase", "buy property", "purchase", "buying", "to buy", "ghar kharidna"],
  "Business Expansion": ["business expansion", "expansion", "expand"],
  "Working Capital": ["working capital", "wc", "capital"],
  "Balance Transfer": ["balance transfer", "bt", "transfer"],
  "Balance Transfer + Top-Up": ["balance transfer top up", "bt top up", "bt + top up", "transfer and top up", "top up"],
  "Personal Requirement": ["personal requirement", "personal", "personal use"],
  "Sole Proprietorship": ["sole proprietorship", "proprietorship", "proprietor", "sole prop", "sole"],
  "Partnership Firm": ["partnership", "partnership firm", "partner"],
  LLP: ["llp"],
  "Private Limited Company": ["private limited", "pvt ltd", "pvt limited", "private limited company"],
  "Limited Company": ["limited company", "public limited", "ltd"],
  "EMI Delay": ["emi delay", "delay", "late emi", "late payment"],
  "EMI Bounce": ["emi bounce", "bounce"],
  "Loan Settlement": ["settlement", "loan settlement", "settled"],
  "Write-Off": ["write off", "write-off", "written off"],
  "Cheque Bounce": ["cheque bounce", "check bounce"],
  "Credit Card Overdue": ["credit card overdue", "card overdue"],
  "CIBIL Reporting Issue": ["cibil reporting", "reporting issue", "cibil error", "reporting error"],
  "Under Process": ["under process", "in process", "processing"],
  "On Hold": ["on hold", "hold"],
  "Residential Flat": ["residential flat", "flat", "apartment", "house"],
};

const YES = /^(y|yes|yeah|yep|yup|ya|yaa|haan|han|ha|hanji|ji haan|sure|ok|okay|of course|correct|right|true|1)$/;
const NO = /^(n|no|nope|nah|nahi|nahin|na|not really|none|false|0)$/;

/** Reads "50 lakh", "1.5 cr", "₹ 75,000", "5L", "40k" as whole rupees. */
export function parseMoney(raw: string): number | null {
  const t = raw.toLowerCase().replace(/(?<=\d),(?=\d)/g, "").replace(/[₹,]|rs\.?|inr/g, " ").replace(/\s+/g, " ").trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lac|l|thousand|k|hazaar|million|mn|m)?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const mult = /^(crores?|cr)$/.test(unit) ? 1e7 : /^(lakhs?|lacs?|lac|l)$/.test(unit) ? 1e5 : /^(thousand|k|hazaar)$/.test(unit) ? 1e3 : /^(million|mn|m)$/.test(unit) ? 1e6 : 1;
  const v = Math.round(n * mult);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

function matchOne(text: string, options: string[]): string | null {
  const t = norm(text);
  if (!t) return null;
  // a number picks from the list shown
  if (/^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= options.length) return options[Number(t) - 1]!;
  for (const o of options) if (norm(o) === t) return o;
  const hits = new Set<string>();
  for (const o of options) {
    const names = [o, ...(ALIASES[o] ?? [])].map(norm);
    if (names.some((n) => n === t)) hits.add(o);
  }
  if (hits.size === 1) return [...hits][0]!;
  // the answer contains exactly one option (or alias), the longest wins
  const found: { o: string; len: number }[] = [];
  for (const o of options) {
    const names = [o, ...(ALIASES[o] ?? [])].map(norm).filter((n) => n.length >= 2);
    const best = names.filter((n) => new RegExp(`(^|\\s)${n.replace(/[+.*?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(t)).sort((x, y) => y.length - x.length)[0];
    if (best) found.push({ o, len: best.length });
  }
  if (!found.length) return null;
  found.sort((x, y) => y.len - x.len);
  if (found.length > 1 && found[0]!.len === found[1]!.len) return null;
  return found[0]!.o;
}

export type Parsed = { ok: true; value: string } | { ok: false; reason: string };

/** Turns what the person said into the stored value for this question, or says why it can't. */
export function parseAnswer(field: Field, raw: string): Parsed {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (field.optional && /^(skip|na|n\/a|not applicable|pass|none)$/i.test(text)) return { ok: true, value: "Not provided" };
  const bad = (reason: string): Parsed => ({ ok: false, reason });

  switch (field.kind) {
    case "yesno": {
      const t = norm(text);
      if (YES.test(t)) return { ok: true, value: "Yes" };
      if (NO.test(t)) return { ok: true, value: "No" };
      return bad("Please answer Yes or No.");
    }
    case "choice": {
      const v = matchOne(text, field.options ?? []);
      return v ? { ok: true, value: v } : bad("Please pick one of the options.");
    }
    case "multi": {
      const parts = text.split(/[,;/&\n]|\band\b/i).map((p) => p.trim()).filter(Boolean);
      const picked = new Set<string>();
      for (const p of parts) {
        const v = matchOne(p, field.options ?? []);
        if (v) picked.add(v);
      }
      return picked.size ? { ok: true, value: [...picked].join(", ") } : bad("Please pick from the options.");
    }
    case "money": {
      const v = parseMoney(text);
      return v === null ? bad("Please send an amount, for example 50 lakh or 4,50,000.") : { ok: true, value: String(v) };
    }
    case "int": {
      const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
      if (!m) return bad("Please send a number.");
      const v = Math.round(Number(m[0]));
      if ((field.min !== undefined && v < field.min) || (field.max !== undefined && v > field.max)) {
        return bad(`That doesn't look right. Please send a number between ${field.min ?? 0} and ${field.max}.`);
      }
      return { ok: true, value: String(v) };
    }
    case "percent": {
      const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
      const v = m ? Number(m[0]) : NaN;
      return Number.isFinite(v) && v >= 0 && v <= 60 ? { ok: true, value: String(v) } : bad("Please send the rate as a percentage, for example 9.5.");
    }
    default: {
      const v = text.replace(/\s+/g, " ").slice(0, 300);
      return v.length >= 1 ? { ok: true, value: v } : bad("empty");
    }
  }
}

/** The question as it is shown, with the allowed answers listed so any channel reads from one place. */
export function renderQuestion(field: Field, wording?: string): string {
  const head = (wording ?? field.ask).trim();
  const unit = field.hint ? ` (${field.hint})` : "";
  const opts = field.options?.length
    ? `\n${field.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}${field.kind === "multi" ? "\n(Reply with numbers or names, e.g. 1, 3)" : ""}`
    : field.kind === "yesno"
      ? "\n(Yes / No)"
      : "";
  const skip = field.optional ? "\n(Say *skip* if not applicable)" : "";
  return `${head}${unit}${opts}${skip}`;
}

/** Totals the monthly EMIs entered for existing loans (8.10). */
export function totalEmi(a: Answers): number {
  let sum = 0;
  for (let n = 1; n <= MAX_REPEATS; n++) sum += Number(a[answerKey(`loan-${n}-emi`)]) || 0;
  return sum;
}

/** Readable "Section: label = value" lines for staff. */
export function summarise(a: Answers): { section: string; num: string; label: string; value: string }[] {
  return fieldsFor(a)
    .filter((x) => a[answerKey(x.id)] !== undefined)
    .map((x) => ({ section: x.section, num: x.num, label: x.label, value: format(x, a[answerKey(x.id)]!) }));
}

export function format(field: Field, value: string): string {
  if (field.kind === "money" && /^\d+$/.test(value)) return `₹${Number(value).toLocaleString("en-IN")}`;
  if (field.kind === "percent" && value !== "Not provided") return `${value}%`;
  return value;
}

export const PROFILE_STAGE = "loan-profile";
