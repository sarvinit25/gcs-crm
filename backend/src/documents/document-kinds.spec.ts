import { classifyDocument } from "./document-kinds";

describe("classifyDocument", () => {
  it.each([
    ["Pan Card - Davinder Singh Sondh.pdf", "KYC"],
    ["Aadhar Card New - Saheb Singh Sondh.pdf", "KYC"],
    ["Photo - Davinder Singh.jpeg", "KYC"],
    ["Elec Bill SEP 26 - Res.pdf", "KYC"],
    ["GST Certificate NEW - LUCID CADD.pdf", "Business proof"],
    ["GSTR3B_27AAHFL8365L1ZN_062026.pdf", "Business proof"],
    ["Udyam MSME Registration - Lucid.pdf", "Business proof"],
    ["Partneship Deed - Lucid.pdf", "Business proof"],
    ["COI AY 25-26 - Lucid Cadd Engineers.pdf", "Income proof"],
    ["ITR Ack AY 25-26 - Lucid.pdf", "Income proof"],
    ["P&L BS AY 25-26 - Lucid.pdf", "Income proof"],
    ["Form 26AS AY 25-26 - Saheb.pdf", "Income proof"],
    ["Federal CA 6099 - LCEC - 01 Sep 26 To 06 Oct 26.pdf", "Bank statement"],
    ["ICICI SB 5002 - Davinder Singh - 01 Sep 26.pdf", "Bank statement"],
    ["IDFC 3038 - DHS - 01 Jul 25 To 30 Jun 26.pdf", "Bank statement"],
    ["Axis bank statement Jan 25.pdf", "Bank statement"],
    ["IDFC LAP Sanction Letter - 1.31 CR.pdf", "Sanction letter"],
    ["SOA IDFC LAP 1.31 CR - LUCID CADD.pdf", "Sanction letter"],
    ["Ag-01.pdf", "Property papers"],
    ["Gift Deed 25 Mar 22 - Surjit Kaur.pdf", "Property papers"],
    ["NOC Society 12 Apr 24.pdf", "Property papers"],
    ["Index - II - Self Attested.pdf", "Property papers"],
    ["Share Certificate OLD - Amar Geeta.pdf", "Property papers"],
    ["CIBIL 669 - Davinder Singh Sondh.pdf", "Other"],
    ["Application Form - Profectus.pdf", "Other"],
    ["Concerns in Indusind Bank on 23 Apr 25.jpeg", "Other"],
    ["IMG_20260101.jpg", "Other"],
  ])("%s -> %s", (name, want) => {
    expect(classifyDocument(name)).toBe(want);
  });
  it("uses the caption too", () => {
    expect(classifyDocument("scan001.pdf", "Aadhaar - Saheb (co-applicant)")).toBe("KYC");
  });
});
