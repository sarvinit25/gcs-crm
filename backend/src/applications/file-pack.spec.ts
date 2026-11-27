import { inflateRawSync } from "node:zlib";
import { reportBlocks, timeline, type ReportData } from "./file-report";
import { packPath } from "./file-pack.service";
import { pdf, wrap, textWidth } from "./simple-pdf";
import { crc32, zip } from "./zip";

const at = (s: string) => new Date(`${s}T06:00:00.000Z`);
const data: ReportData = {
  company: { name: "Growth Capital Services" },
  applicationNo: "GCS-2026-0001",
  generatedBy: "Staff",
  generatedAt: at("2026-11-27"),
  app: {
    status: "DISBURSED", requestedAmount: 100, tenureMonths: 12, purpose: null, createdAt: at("2026-11-02"), bankLoginAt: at("2026-11-03"), bankReferenceNo: "R1",
    bankerName: null, bankerMobile: null, loginFees: null, dsaChannel: null, loanProduct: { name: "Home Loan" }, lender: null, owner: null,
    lead: { leadNo: 1, createdAt: at("2026-11-01"), source: "Website", notes: null },
    applicants: [{ name: "ZZ TEST", isPrimary: true, creditChecks: [] }],
    references: [], existingLoans: [], creditEvaluation: null, sanction: { sanctionDate: at("2026-11-04"), sanctionedAmount: 100 },
    disbursements: [{ amount: 100, netAmount: 90, disbursedAt: at("2026-11-05"), loanAccountNo: null, utrNo: null, processingFee: 10, note: null }], invites: [],
  },
  history: [{ createdAt: at("2026-11-02"), actorName: "Staff", changes: { status: { from: "DRAFT", to: "SUBMITTED" } } }],
  match: null,
  documents: [],
  missing: [],
};

describe("loan file report and pack", () => {
  it("lists what happened in order", () => {
    expect(timeline(data).map((s) => s.what.split(" ")[0])).toEqual(["Lead", "Application", "Moved", "Logged", "Sanctioned", "Disbursed"]);
  });
  it("makes a PDF, spreading long reports over pages", () => {
    const many = { ...data, documents: Array.from({ length: 90 }, (_, i) => ({ category: "KYC", path: `file ${i} \u20b9.pdf`, createdAt: at("2026-11-01") })) };
    const out = pdf(reportBlocks(many)).toString("latin1");
    expect(out.startsWith("%PDF-")).toBe(true);
    expect(Number(/\/Count (\d+)/.exec(out)![1])).toBeGreaterThan(1);
  });
  it("wraps long words inside their space", () => {
    for (const line of wrap("A".repeat(200), 9, 100)) expect(textWidth(line, 9)).toBeLessThanOrEqual(100);
  });
  it("writes a ZIP that can be read back", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const body = Buffer.from("hello ".repeat(100));
    const out = zip([{ name: "a.txt", data: body }]);
    expect(out.readUInt32LE(0)).toBe(0x04034b50);
    const packed = out.subarray(30 + 5, 30 + 5 + out.readUInt32LE(18));
    expect(inflateRawSync(packed)).toEqual(body);
    expect(out.readUInt16LE(out.length - 12)).toBe(1);
  });
  it("gives every document its own safe path", () => {
    const used = new Set<string>();
    expect(packPath("KYC", "PAN: a/b.pdf", "application/pdf", used)).toBe("Documents/KYC/PAN a b.pdf");
    expect(packPath("KYC", "PAN: a/b.pdf", "application/pdf", used)).toBe("Documents/KYC/PAN a b (2).pdf");
    expect(packPath("KYC", "../x.png", "image/jpeg", used)).toBe("Documents/KYC/x.jpg");
  });
});
