// The "Bank Product Policy One Pager" laid out exactly as the form we send banks: same headings, same order, same wording,
// with each minimum and maximum shown together ("₹5,00,000 to ₹5,00,00,000"). Built from the stored one-pager details, and used
// by both the on-screen view and the print / PDF copy so the two can never disagree.

export type SheetValue = string | number | string[] | null | undefined;
export type OnePagerData = Record<string, SheetValue>;
export type Line = { label: string; value: string | null };
export type Box = { label: string; on: boolean };
export type Section = { title: string; lines: Line[]; boxes?: Box[] };
export type OnePager = { title: string; intro: string; sections: Section[]; footer: Line[] };

const OPEN = ["Home Loan", "Home Loan Balance Transfer", "Home Loan Top-Up", "Loan Against Property", "LAP Balance Transfer", "LAP Top-Up", "Commercial Property Purchase", "Industrial Property"];

const given = (v: SheetValue): v is string | number | string[] => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const text = (v: SheetValue): string | null => (given(v) ? (Array.isArray(v) ? v.join(", ") : String(v)) : null);
const rupees = (v: SheetValue): string | null => {
  const n = given(v) && !Array.isArray(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : null;
};
/** "₹a to ₹b" when both are known; "from ₹a" or "up to ₹b" when only one is. */
const range = (min: SheetValue, max: SheetValue): string | null => {
  const a = rupees(min);
  const b = rupees(max);
  return a && b ? `${a} to ${b}` : a ? `from ${a}` : b ? `up to ${b}` : null;
};
const suffix = (v: SheetValue, s: string): string | null => (given(v) && !Array.isArray(v) ? `${v}${s}` : null);
const upTo = (v: SheetValue): string | null => (given(v) && !Array.isArray(v) ? `Up to ${v}%` : null);
const day = (v: SheetValue): string | null => {
  const s = text(v);
  const d = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : s;
};
const l = (label: string, value: string | null): Line => ({ label, value });

export function buildOnePager(lenderName: string | null | undefined, d: OnePagerData): OnePager {
  const dependsOn = (Array.isArray(d.roiDependsOn) ? d.roiDependsOn : []).map((x) => (x === "Other" && given(d.roiDependsOther) ? `Other: ${d.roiDependsOther}` : x));
  if (given(d.roiDependsOther) && !(Array.isArray(d.roiDependsOn) && d.roiDependsOn.includes("Other"))) dependsOn.push(`Other: ${d.roiDependsOther}`);
  const open = Array.isArray(d.productsOpen) ? d.productsOpen : [];
  const topUp = (word: "up to" | "above", pct: SheetValue, bps: SheetValue): Line =>
    l(`Top-Up ${word} ${given(pct) ? `${pct}%` : "___%"}`, given(bps) ? `ROI loading ${bps} bps` : null);

  const sections: Section[] = [
    {
      title: "Basic details",
      lines: [
        l("Bank / NBFC Name", text(lenderName)),
        l("Scheme / Product Name", text(d.scheme)),
        l("Login Fee – HL", rupees(d.loginFeeHL)),
        l("Login Fee – LAP", rupees(d.loginFeeLAP)),
        l("Login Mode", text(d.loginMode)),
      ],
    },
    {
      title: "Loan amount",
      lines: [l("Home Loan", range(d.hlMin, d.hlMax)), l("LAP", range(d.lapMin, d.lapMax)), l("Commercial Purchase", range(d.cpMin, d.cpMax))],
    },
    {
      title: "Rate of interest (ROI)",
      lines: [l("Home Loan ROI", text(d.hlRoi)), l("LAP ROI", text(d.lapRoi)), l("Commercial Purchase ROI", text(d.cpRoi)), l("ROI depends on", dependsOn.length ? dependsOn.join(" / ") : null)],
    },
    {
      title: "Processing fees",
      lines: [
        l("Salaried HL", suffix(d.pfSalHL, "% + GST")),
        l("Self-Employed HL", suffix(d.pfSepHL, "% + GST")),
        l("Salaried LAP", suffix(d.pfSalLAP, "% + GST")),
        l("Self Employed LAP", suffix(d.pfSepLAP, "% + GST")),
        l("Minimum PF, if any", rupees(d.pfMin)),
        l("Maximum PF / Capping, if any", rupees(d.pfMax)),
      ],
    },
    { title: "Credit score", lines: [l("Minimum CIBIL Score", text(d.minCibil)), l("Below-CIBIL / Credit Deviation Policy, if any", text(d.cibilDeviation))] },
    {
      title: "Home loan top-up",
      lines: [
        l("Top-Up Eligibility", text(d.topUpEligibility)),
        l("Maximum Top-Up Amount / %", text(d.topUpMax)),
        topUp("up to", d.topUpUpToPct, d.topUpUpToBps),
        topUp("above", d.topUpAbovePct, d.topUpAboveBps),
        l("Other Top-Up Conditions", text(d.topUpOther)),
      ],
    },
    {
      title: "FOIR / income eligibility",
      lines: [
        l("Salaried FOIR", upTo(d.foirSal)),
        l("Self-Employed FOIR", upTo(d.foirSep)),
        l("Other Income Considered", text(d.otherIncome)),
        l("Rental Income Considered", text(d.rentalIncome)),
        l("Banking-Based Program", text(d.bankingProgram)),
        l("Low-LTV Program", text(d.lowLtvProgram)),
        l("LIP Program", text(d.lipProgram)),
        l("AIP / Income Surrogate Program", text(d.aipProgram)),
        l("Other Special Eligibility Programs", text(d.otherPrograms)),
      ],
    },
    {
      title: "Maximum loan tenure",
      lines: [
        l("Salaried HL", suffix(d.tenSalHL, " Years")),
        l("Self-Employed HL", suffix(d.tenSepHL, " Years")),
        l("Salaried LAP", suffix(d.tenSalLAP, " Years")),
        l("Self-Employed LAP", suffix(d.tenSepLAP, " Years")),
        l("SEP / Professional HL", suffix(d.tenProfHL, " Years")),
        l("SEP / Professional LAP", suffix(d.tenProfLAP, " Years")),
      ],
    },
    {
      title: "LAP – maximum LTV",
      lines: [
        l("Self-Occupied Residential Property (SORP)", suffix(d.ltvSorp, "%")),
        l("Rented Residential Property", suffix(d.ltvRentedRes, "%")),
        l("Vacant Residential Property", suffix(d.ltvVacantRes, "%")),
        l("Self-Occupied Commercial Property (SOCP)", suffix(d.ltvSocp, "%")),
        l("Rented Commercial Property", suffix(d.ltvRentedComm, "%")),
        l("Self-Occupied Industrial Property", suffix(d.ltvIndustrial, "%")),
        l("Industrial Property with Office Setup", suffix(d.ltvIndustrialOffice, "%")),
        l(given(d.ltvOtherLabel) ? `Other Property Type (${d.ltvOtherLabel})` : "Other Property Type", suffix(d.ltvOther, "%")),
      ],
    },
    {
      title: "Other charges",
      lines: [
        l("Legal Charges", text(d.legal)),
        l("Technical / Valuation Charges", text(d.technical)),
        l("Administrative Charges", text(d.admin)),
        l("Insurance", text(d.insurance)),
        l("Insurance Premium / Structure", text(d.insuranceStructure)),
        l("MOD / Mortgage Charges", text(d.mod)),
        l("Prepayment / Foreclosure Charges", text(d.prepayment)),
        l("Other Charges", text(d.otherCharges)),
      ],
    },
    {
      title: "Products currently open",
      lines: given(d.productsOpenOther) ? [l("Other", text(d.productsOpenOther))] : [],
      boxes: OPEN.map((label) => ({ label, on: open.includes(label) })),
    },
    {
      title: "Special policy / USP",
      lines: [
        l("Special Scheme / Offer", text(d.specialScheme)),
        l("Key Product USP", text(d.usp)),
        l("Preferred Customer Profile", text(d.preferredProfile)),
        l("Major Policy Restrictions", text(d.restrictions)),
        l("Any Special Approval / Deviation Program", text(d.deviationProgram)),
      ],
    },
    {
      title: "Contact details",
      lines: [
        l("RM / Sales Manager Name", text(d.rmName)),
        l("Designation", text(d.rmDesignation)),
        l("Mobile No.", text(d.rmMobile)),
        l("Email ID", text(d.rmEmail)),
        l("Location / Branch", text(d.rmLocation)),
      ],
    },
  ];

  return {
    title: "Home Loan (HL) & Loan Against Property (LAP) Product Policy",
    intro: "Policy details in our standard one-pager format. “Not given” means the bank has not told us yet.",
    sections,
    footer: [l("Policy effective date / validity", [day(d.effectiveDate), text(d.validity)].filter(Boolean).join(" · ") || null), l("Other applicable or conditional charges", text(d.conditionalCharges))],
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Opens the one-pager in its own window, ready to print or save as a PDF. */
export function printOnePager(model: OnePager, lenderName: string): void {
  const row = (x: Line) => `<tr><td class="k">${esc(x.label)}</td><td class="${x.value ? "v" : "v none"}">${x.value ? esc(x.value) : "Not given"}</td></tr>`;
  const body = model.sections
    .map(
      (s) =>
        `<h2>${esc(s.title)}</h2>${s.lines.length ? `<table>${s.lines.map(row).join("")}</table>` : ""}${s.boxes ? `<p class="boxes">${s.boxes.map((b) => `<span>${b.on ? "☑" : "☐"} ${esc(b.label)}</span>`).join("")}</p>` : ""}`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(lenderName)} – policy one-pager</title><style>
    body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#1b2a41;margin:28px 34px}
    h1{font-size:18px;margin:0 0 2px}p.intro{margin:0 0 14px;color:#667}
    h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid #c9a24b;padding-bottom:3px;margin:16px 0 4px;break-after:avoid}
    table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top;border-bottom:1px solid #eee}
    td.k{width:48%;color:#445}td.v{font-weight:600}td.none{color:#999;font-weight:400}
    .boxes span{display:inline-block;width:48%;padding:2px 0}tr,h2{break-inside:avoid}
  </style></head><body><h1>${esc(model.title)}</h1><p class="intro">${esc(lenderName)}</p>${body}<h2>Validity and other charges</h2><table>${model.footer.map(row).join("")}</table></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
