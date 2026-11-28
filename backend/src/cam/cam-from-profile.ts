// The loan-profile answers a lead or customer gave hold many things the CAM asks for. They fill blank boxes only, after what
// staff saved and what the application says.

import type { CamData } from "./cam-schema";

type Row = Record<string, unknown>;
const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const fill = (into: Row, from: Row): Row => {
  const out = { ...into };
  for (const [k, v] of Object.entries(from)) if (blank(out[k]) && !blank(v)) out[k] = v;
  return out;
};
const key = (v: unknown) => String(v ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const pick = (v: string | undefined, options: string[]) => options.find((o) => key(o) === key(v));

/** `answers` is keyed without the "lp-" prefix, for example "rs-mv". `place` is the town the property is in. */
export function camFromProfile(data: CamData, answers: Record<string, string>, place?: string | null, today: Date = new Date()): CamData {
  const a = (k: string) => answers[k]?.trim() || undefined;
  const money = (k: string) => {
    const n = Number(String(a(k) ?? "").replace(/[^\d.]/g, ""));
    return n > 0 ? n : undefined;
  };
  const yes = (k: string) => (a(k) === "Yes" || a(k) === "No" ? a(k) : undefined);
  const out: CamData = { ...data };
  const section = (id: string, values: Row) => {
    const next = fill(out[id] ?? {}, values);
    if (Object.keys(next).length) out[id] = next;
  };

  section("loanRequest", { coApplicant: yes("coapp"), coApplicantRelation: a("coapp-relation"), purpose: a("loan-purpose") });
  const since = money("biz-vintage");
  section("income", {
    businessName: a("biz-name"),
    constitution: pick(a("biz-constitution"), ["Proprietorship", "Partnership", "Private Limited", "LLP", "Other"]),
    industry: pick(a("biz-nature"), ["Manufacturing", "Trading", "Services", "Retail", "Construction / real estate", "Professional practice", "Other"]),
    nature: a("biz-activity"),
    businessAddress: a("biz-location"),
    // Given as the year it started, or as a number of years.
    vintageYears: since === undefined ? undefined : since > 1900 ? today.getUTCFullYear() - since : since,
    gstRegistered: yes("biz-gst"),
    itrFiled: yes("biz-itr"),
  });
  const tx = a("tx-type") ?? "";
  section("property", {
    status: /resale/i.test(tx) ? "Resale" : /self.?owned/i.test(tx) ? "Already owned (for LAP)" : undefined,
    type: /flat|apartment/i.test(a("rs-type") ?? a("bp-type") ?? "") ? "Residential flat" : undefined,
    address: a("rs-location"),
    city: place?.trim() || undefined,
    areaSqft: money("rs-area"),
    agreementValue: money("rs-av"),
    marketValue: money("rs-mv"),
  });

  const rows = (Array.isArray(out.obligations?.loans) ? (out.obligations.loans as Row[]) : []).map((r) => ({ ...r }));
  let changed = false;
  for (let n = 1; n <= 8; n++) {
    const lender = a(`loan-${n}-bank`);
    const emi = money(`loan-${n}-emi`);
    if (!lender || !emi) continue;
    const row: Row = { lender, emi, type: pick(a(`loan-${n}-type`), ["Home loan", "Loan against property", "Car loan", "Personal loan", "Business loan", "Gold loan", "Education loan"]), sanctioned: money(`loan-${n}-original`), monthsLeft: money(`loan-${n}-tenure`), status: "Live" };
    const same = rows.find((r) => Number(r.emi) === emi);
    const nameOnly = rows.find((r) => key(r.lender) === key(lender) && blank(r.emi));
    // The customer's own name for the lender replaces the one guessed from a bank statement.
    if (same) {
      if (/from bank statement/i.test(String(same.lender))) same.lender = lender;
      Object.assign(same, fill(same, row));
    } else if (nameOnly) Object.assign(nameOnly, fill(nameOnly, row));
    else rows.push(fill({}, row));
    changed = true;
  }
  if (changed) out.obligations = { ...(out.obligations ?? {}), loans: rows.slice(0, 12) };
  // A row naming only a lender, with no instalment, says nothing once that lender's instalments are listed.
  const listed = (Array.isArray(out.obligations?.loans) ? (out.obligations.loans as Row[]) : []);
  const useful = listed.filter((r) => !blank(r.emi) || !blank(r.outstanding) || !listed.some((o) => o !== r && !blank(o.emi) && key(o.lender) === key(r.lender)));
  if (useful.length !== listed.length) out.obligations = { ...(out.obligations ?? {}), loans: useful };
  return out;
}
