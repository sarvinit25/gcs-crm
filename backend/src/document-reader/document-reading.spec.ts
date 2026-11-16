import { maskLongNumbers, normaliseReading } from "./document-reading";

describe("normaliseReading", () => {
  it("keeps a salary slip's figures for the CAM, cleaned", () => {
    const r = normaliseReading({
      docType: "salary_slip",
      summary: "Salary slip of Asha for March 2026",
      fields: [{ label: "Employer", value: "Acme Pvt Ltd" }, { label: "Net pay", value: "72,500" }, { label: "", value: "dropped" }],
      salary: { employer: "Acme Pvt Ltd", designation: "Manager", grossMonthly: "₹90,000", netMonthly: 72500 },
    });
    expect(r.docType).toBe("SALARY_SLIP");
    expect(r.fields).toEqual([{ label: "Employer", value: "Acme Pvt Ltd" }, { label: "Net pay", value: "72,500" }]);
    expect(r.cam).toEqual({ income: { employer: "Acme Pvt Ltd", designation: "Manager", grossMonthly: 90000, netMonthly: 72500 } });
  });

  it("never offers a CAM patch for anything but a salary slip", () => {
    expect(normaliseReading({ docType: "BANK_STATEMENT", fields: [{ label: "Bank", value: "HDFC" }], salary: { netMonthly: 5 } }).cam).toBeNull();
  });

  it("treats an identity document as unread, with nothing copied", () => {
    const r = normaliseReading({ docType: "IDENTITY_DOCUMENT", fields: [{ label: "Aadhaar", value: "1234 5678 9012" }] });
    expect(r.docType).toBe("IDENTITY_DOCUMENT");
    expect(r.fields).toEqual([]);
    expect(r.cam).toBeNull();
  });

  it("falls back to Other for an unknown type and survives junk", () => {
    expect(normaliseReading({ docType: "mystery" }).docType).toBe("OTHER");
    expect(normaliseReading(null)).toMatchObject({ docType: "OTHER", fields: [], cam: null });
    expect(normaliseReading({ fields: "nope", salary: 5 }).fields).toEqual([]);
  });

  it("cuts any long number to its last four digits", () => {
    expect(maskLongNumbers("A/c 123456789012")).toBe("A/c XXXX9012");
    expect(maskLongNumbers("1234 5678 9012")).toBe("XXXX9012");
    expect(maskLongNumbers("EMI 12500 on 5th")).toBe("EMI 12500 on 5th");
  });
});
