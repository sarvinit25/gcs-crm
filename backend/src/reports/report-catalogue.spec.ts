import { Role } from "@prisma/client";
import {
  RECORD_TYPES,
  catalogueFor,
  columnsFor,
  disallowedKeys,
  resolveColumns,
  standardKeys,
} from "./report-catalogue";

describe("report column catalogue", () => {
  it("has unique keys per register, each in a declared section", () => {
    const cat = catalogueFor(Role.ADMIN);
    for (const type of RECORD_TYPES) {
      const keys = cat[type].columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      const sections = new Set(cat[type].sections.map((s) => s.id));
      for (const c of cat[type].columns) expect(sections.has(c.section)).toBe(true);
    }
  });

  it("covers the sections the file export promises", () => {
    const labels = catalogueFor(Role.ADMIN).applications.sections.map((s) => s.label);
    expect(labels).toEqual([
      "File",
      "Applicant",
      "Business",
      "Co-applicants and guarantors",
      "Loan details",
      "Bank login",
      "Sanction",
      "Disbursal",
      "Commission",
    ]);
  });

  it("keeps the money-trail fields of sanctions and disbursals in the picker", () => {
    const cat = catalogueFor(Role.ADMIN);
    const sanction = cat.sanctions.columns.map((c) => c.key);
    expect(sanction).toEqual(expect.arrayContaining(["sanctionNo", "emi", "processingFee", "bankRm", "disbursalStatus"]));
    const disbursal = cat.disbursements.columns.map((c) => c.key);
    expect(disbursal).toEqual(expect.arrayContaining(["mode", "bankName", "accountNo", "ifsc", "netAmount"]));
    expect(cat.commissions.columns.map((c) => c.key)).toEqual(expect.arrayContaining(["claimedAt", "receivedAmount", "extras", "splits"]));
  });

  it("hides every commission column, and the whole section, from Staff", () => {
    const staff = catalogueFor(Role.ADVISOR);
    expect(staff.applications.columns.some((c) => c.commission)).toBe(false);
    expect(staff.applications.columns.map((c) => c.key)).not.toContain("commissionAmount");
    expect(staff.applications.sections.map((s) => s.id)).not.toContain("commission");
    // Admin and Manager see the same, full catalogue.
    expect(catalogueFor(Role.MANAGER).applications.columns).toEqual(catalogueFor(Role.ADMIN).applications.columns);
    expect(columnsFor("applications", Role.ADMIN).some((c) => c.commission)).toBe(true);
  });

  it("marks every column of the commission register as commission-only", () => {
    expect(columnsFor("commissions", Role.ADMIN).every((c) => c.commission)).toBe(true);
    expect(columnsFor("commissions", Role.ADVISOR)).toHaveLength(0);
  });

  it("resolves the standard set when nothing is asked for", () => {
    const keys = resolveColumns("applications", Role.ADMIN, undefined).map((c) => c.key);
    expect(keys).toEqual(standardKeys("applications", Role.ADMIN));
    expect(keys).toContain("applicationNo");
    expect(keys).not.toContain("pan");
  });

  it("keeps the order asked for, and drops unknown, repeated and forbidden keys", () => {
    const asked = ["lender", "applicationNo", "lender", "nope", "commissionAmount"];
    expect(resolveColumns("applications", Role.ADVISOR, asked).map((c) => c.key)).toEqual(["lender", "applicationNo"]);
    expect(resolveColumns("applications", Role.ADMIN, asked).map((c) => c.key)).toEqual(["lender", "applicationNo", "commissionAmount"]);
    expect(resolveColumns("applications", Role.ADMIN, ["nope"])).toEqual([]);
  });

  it("tells unknown keys from ones this role may not use", () => {
    expect(disallowedKeys("applications", Role.ADVISOR, ["lender", "commissionAmount", "zzz"])).toEqual({
      unknown: ["zzz"],
      forbidden: ["commissionAmount"],
    });
  });
});
