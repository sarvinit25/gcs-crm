import { normalisePhone } from "../common/phone.util";

/**
 * What we pull out of a voice agent's end-of-call message.
 * Sarvam's inbound payload is not documented the way its campaign payload is, so the reader looks for each
 * detail under several likely names, at any depth, and the whole raw message is kept next to the result.
 */
export type CallDetails = {
  callId: string | null;
  phone: string | null;
  name: string | null;
  city: string | null;
  amount: number | null;
  loanType: string | null;
  /** The rest of what the agent collects after the first form: kept on the lead's notes, and some fill the lead's own fields. */
  extra: CallExtra;
  summary: string | null;
  transcript: string | null;
  durationSec: number | null;
  status: string | null;
  connected: boolean;
};

export type CallExtra = {
  email: string | null;
  employmentType: "SALARIED" | "SELF_EMPLOYED" | "BUSINESS" | "PROFESSIONAL" | "OTHER" | null;
  monthlyIncome: number | null;
  employer: string | null;
  yearsInJob: number | null;
  /** Total work experience in years, when the caller gave it. */
  totalExperience: number | null;
  businessType: string | null;
  businessYears: number | null;
  annualTurnover: number | null;
  existingEmi: number | null;
  cibil: number | null;
  ageOrBirthYear: string | null;
  propertyType: string | null;
  propertyValue: number | null;
  propertyHasLoan: string | null;
  coApplicant: string | null;
  callbackTime: string | null;
  /** A separate number the caller gave for work: kept on the lead as its second number. */
  workPhone: string | null;
  /** A number the caller asked to be called back on, when it is not the one they called from. */
  callbackNumber: string | null;
  /** What the caller wants help with: a loan, CA and legal services, or both. */
  serviceInterest: "loan" | "ca_legal" | "both" | null;
  /** The CA or legal service they asked about, and what they need, in the agent's words. */
  caLegalService: string | null;
  caLegalNeed: string | null;
  outcome: string | null;
  humanCallback: boolean;
  doNotCall: boolean;
};

const MAX_DEPTH = 4;
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Names are tried in the order given; for each, the shallowest match wins, so top-level fields beat nested ones. */
function find(root: unknown, names: string[]): unknown {
  for (const name of names) {
    const wanted = norm(name);
    let level: unknown[] = [root];
    for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
      const next: unknown[] = [];
      for (const node of level) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (norm(key) === wanted && value !== null && value !== undefined && value !== "") return value;
          if (value && typeof value === "object") next.push(value);
        }
      }
      level = next;
    }
  }
  return undefined;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|k|thousand)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  const factor = !unit ? 1 : unit.startsWith("cr") ? 1e7 : ["lakh", "lac", "l"].includes(unit) ? 1e5 : 1e3;
  return Math.round(n * factor);
};

/** Ten digits for an Indian mobile (starts 6 to 9), otherwise null. */
export function indianMobile(v: unknown): string | null {
  const d = normalisePhone(v);
  return d && /^[6-9]\d{9}$/.test(d) ? d : null;
}

function transcriptText(v: unknown): string | null {
  if (typeof v === "string") return text(v, 20000);
  if (!Array.isArray(v)) return null;
  const lines = v
    .map((turn) => {
      if (!turn || typeof turn !== "object") return null;
      const t = turn as Record<string, unknown>;
      const said = text(t.en_text ?? t.text ?? t.content ?? t.message ?? t.transcript ?? t.indic_text, 2000);
      if (!said) return null;
      const who = text(t.role ?? t.speaker, 20);
      return who ? `${who}: ${said}` : said;
    })
    .filter((l): l is string => Boolean(l));
  return lines.length ? lines.join("\n").slice(0, 20000) : null;
}

const yes = (v: unknown) => v === true || (typeof v === "string" && /^(true|yes|y)$/i.test(v.trim()));

function employment(v: unknown): CallExtra["employmentType"] {
  const t = text(v, 40)?.toLowerCase() ?? "";
  if (!t) return null;
  if (/self/.test(t)) return "SELF_EMPLOYED";
  if (/business|owner|proprietor/.test(t)) return "BUSINESS";
  if (/profession|doctor|\bca\b|lawyer|architect/.test(t)) return "PROFESSIONAL";
  if (/salar/.test(t)) return "SALARIED";
  return "OTHER";
}

/** The second-form details. Only numbers that are plausible are kept, so a mis-heard figure does not land on a lead. */
function serviceInterest(v: unknown): CallExtra["serviceInterest"] {
  const t = String(v ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!t) return null;
  if (t === "both") return "both";
  const legal = /\b(ca|legal|gst|tax|itr|accounting|registration)\b/.test(t);
  const loan = /\bloan\b/.test(t);
  if (legal && loan) return "both";
  if (legal) return "ca_legal";
  return loan ? "loan" : null;
}

/** Ten digits for any phone number a caller gives, mobile or a landline with its area code ("022 6987 0988"), else null. */
function tenDigits(v: unknown): string | null {
  const d = normalisePhone(v);
  return d && /^\d{10}$/.test(d) ? d : null;
}

export function readExtra(payload: unknown): CallExtra {
  const email = text(find(payload, ["email", "email_id", "customer_email"]), 120);
  const cibil = num(find(payload, ["cibil_score", "cibil", "credit_score"]));
  const outcome = text(find(payload, ["outcome", "call_outcome"]), 40);
  return {
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    employmentType: employment(find(payload, ["employment_type", "employment", "occupation"])),
    monthlyIncome: num(find(payload, ["monthly_income_inr", "monthly_income", "monthly_salary", "salary"])),
    employer: text(find(payload, ["employer_or_company", "employer", "company"]), 120),
    yearsInJob: num(find(payload, ["years_in_current_job", "years_in_job", "job_experience_years"])),
    totalExperience: num(find(payload, ["total_experience_years", "total_work_experience_years", "total_experience"])),
    businessType: text(find(payload, ["business_type", "profession"]), 120),
    businessYears: num(find(payload, ["business_vintage_years", "years_in_business"])),
    annualTurnover: num(find(payload, ["annual_turnover_inr", "annual_turnover", "turnover"])),
    existingEmi: num(find(payload, ["existing_emi_total_inr", "existing_emi", "total_emi"])),
    cibil: cibil !== null && cibil >= 300 && cibil <= 900 ? cibil : null,
    ageOrBirthYear: text(find(payload, ["age_or_birth_year", "age", "birth_year"]), 20),
    propertyType: text(find(payload, ["property_type"]), 40),
    propertyValue: num(find(payload, ["property_value_inr", "property_value"])),
    propertyHasLoan: text(find(payload, ["property_has_existing_loan"]), 10),
    coApplicant: text(find(payload, ["co_applicant", "coapplicant"]), 120),
    callbackTime: text(find(payload, ["callback_time_preference", "callback_time", "preferred_time"]), 80),
    workPhone: tenDigits(find(payload, ["work_phone_number", "work_number", "office_phone_number", "office_number", "alternate_phone_number", "alternate_number", "secondary_phone"])),
    callbackNumber: tenDigits(find(payload, ["callback_phone_number", "callback_number", "preferred_callback_number", "call_back_number"])),
    serviceInterest: serviceInterest(find(payload, ["service_interest", "service_needed", "service_type"])),
    caLegalService: text(find(payload, ["ca_legal_service", "ca_service", "legal_service"]), 120),
    caLegalNeed: text(find(payload, ["ca_legal_need", "ca_legal_requirement", "service_details"]), 400),
    outcome,
    humanCallback: yes(find(payload, ["human_callback_requested"])) || outcome === "human_callback_requested",
    doNotCall: yes(find(payload, ["do_not_call"])) || outcome === "do_not_call",
  };
}

/** The CRM loan product a spoken loan type means (the agent may say "home", "LAP", "loan against my shop"), or null. */
export function loanSlug(...texts: (string | null | undefined)[]): string | null {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t.trim()) return null;
  const rules: [RegExp, string][] = [
    [/against\s+(?:\w+\s+)?(?:property|shop|house|flat|office|land)|\blap\b/, "loan-against-property"],
    [/balance\s*transfer|top[-\s]?up/, "balance-transfer"],
    [/home\s*loan|housing|house\s*loan|flat\s*loan/, "home-loan"],
    [/education|study|abroad|student/, "education-loan"],
    [/used\s*car|second[-\s]?hand\s*car/, "used-car-loan"],
    [/car\s*refinance/, "car-refinance"],
    [/car\s*loan|new\s*car|\bcar\b/, "new-car-loan"],
    [/consolidat|combine\s+(?:my\s+)?(?:loans|emis?)/, "loan-consolidation"],
    [/personal/, "personal-loan"],
    [/working\s*capital|cash\s*credit|overdraft/, "working-capital-term-loan"],
    [/business|msme|shop\s*loan|\bmudra\b/, "business-loan"],
    [/\bhome\b/, "home-loan"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? null;
}

/** "40 lakhs" or "1.5 crore" said in running text, when the agent gave no structured amount. */
export function amountIn(text: string | null | undefined): number | null {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?)\b/i);
  return m ? num(m[0]) : null;
}

/** The name the caller said out loud ("my name is Vineet", "this is Asha speaking", "मेरा नाम विनीत है"), from the caller's own lines. */
export function nameFromTranscript(transcript: string | null): string | null {
  if (!transcript) return null;
  for (const line of transcript.split("\n")) {
    if (!/^(user|customer|caller)\s*:/i.test(line)) continue;
    const said = line.replace(/^[^:]*:\s*/, "");
    const m = said.match(/\b(?:my name is|my name's|this is|i am|i'm|name is)\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)/i) ?? said.match(/मेरा नाम\s+(\S+(?:\s+\S+)?)/);
    if (!m) continue;
    const words = m[1]!.split(/\s+/).filter((w) => !/^(and|from|calling|speaking|looking|interested|here|self|salaried|in|a|the|needing|want|wanting|ji|sir|fine|good|ok|okay|not|working|ready|busy|sorry|also|already|just|very|really|thinking|trying|asking|employed|business|professional|nri|an|on|at|to)$/i.test(w));
    if (words.length) return words.slice(0, 2).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  }
  return null;
}

export function readCall(payload: unknown): CallDetails {
  const callId = text(find(payload, ["interaction_id", "interactionId", "call_id", "callId", "call_uuid", "attempt_id", "id"]), 120);
  // Who rang us: prefer fields that name the caller; the number we own is never the answer.
  const phone = indianMobile(
    find(payload, ["user_phone_number", "from", "from_number", "caller", "caller_number", "caller_id", "customer_number", "customer_phone", "phone_number", "phone", "mobile"]),
  );
  const durationRaw = num(find(payload, ["duration", "duration_sec", "duration_seconds", "call_duration", "billsec"]));
  const status = text(find(payload, ["status", "call_status", "completion_status", "hangup_cause"]), 60);
  const transcript = transcriptText(find(payload, ["interaction_transcript", "transcript", "transcripts", "conversation", "messages"]));
  const failed = status ? /fail|error|busy|no[-_ ]?answer|not[-_ ]?connected|cancel/i.test(status) : false;
  const connectedFlag = find(payload, ["connected", "is_connected"]);

  return {
    callId,
    phone,
    name: text(find(payload, ["full_name"]), 120) ?? nameFromTranscript(transcript) ?? text(find(payload, ["name", "customer_name", "caller_name", "lead_name", "user_name"]), 120),
    city: text(find(payload, ["city", "location", "customer_city"]), 80),
    amount: num(find(payload, ["loan_amount_inr", "loan_amount", "amount", "required_amount", "loan_requirement"])) ?? amountIn(text(find(payload, ["call_summary", "summary", "conversation_summary"]), 1500)),
    extra: readExtra(payload),
    loanType: text(find(payload, ["loan_type", "loan_product", "product", "loan_purpose", "purpose"]), 120),
    summary: text(find(payload, ["summary", "call_summary", "conversation_summary", "notes"]), 1500),
    transcript,
    durationSec: durationRaw === null ? null : Math.max(0, Math.round(durationRaw)),
    status,
    connected: connectedFlag === false ? false : !failed && (Boolean(transcript) || (durationRaw ?? 0) > 0),
  };
}
