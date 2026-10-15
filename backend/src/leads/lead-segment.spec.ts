import { DocumentsStatus, LeadSegment, LeadStatus } from "@prisma/client";
import { classifyLead, missingForMeeting, PARK_DAYS, type SegmentInput } from "./lead-segment";

const NOW = new Date("2026-10-11T06:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const complete: SegmentInput = {
  status: LeadStatus.QUALIFIED,
  loanProductId: "p1",
  amount: "5000000",
  city: "Mumbai",
  employmentType: "SALARIED",
  monthlyIncome: "120000",
  documentsStatus: DocumentsStatus.COMPLETE,
  nextFollowUpAt: null,
};
const bare: SegmentInput = {
  status: LeadStatus.NEW,
  loanProductId: null,
  amount: null,
  city: null,
  employmentType: null,
  monthlyIncome: null,
  documentsStatus: DocumentsStatus.NONE,
  nextFollowUpAt: null,
};
const seg = (l: Partial<SegmentInput>) => classifyLead({ ...complete, ...l }, NOW).segment;

describe("lead segments", () => {
  it("is HOT when every detail and the documents are in", () => {
    const r = classifyLead(complete, NOW);
    expect(r.segment).toBe(LeadSegment.HOT);
    expect(r.missing).toEqual([]);
  });

  it("is HOT even if the lead has not been marked qualified yet", () => {
    expect(seg({ status: LeadStatus.NEW })).toBe(LeadSegment.HOT);
  });

  it.each([
    ["loanProductId", null, "loan type"],
    ["amount", null, "loan amount"],
    ["city", "  ", "city"],
    ["employmentType", null, "employment type"],
    ["monthlyIncome", null, "monthly income"],
    ["documentsStatus", DocumentsStatus.NONE, "documents"],
    ["documentsStatus", DocumentsStatus.PARTIAL, "remaining documents"],
  ] as const)("is WARM, naming what is missing, when %s is incomplete", (field, value, label) => {
    const r = classifyLead({ ...complete, [field]: value } as SegmentInput, NOW);
    expect(r.segment).toBe(LeadSegment.WARM);
    expect(r.missing).toEqual([label]);
    expect(r.note).toContain(label);
  });

  it("treats a lead with only a loan type or only an amount as WARM", () => {
    expect(classifyLead({ ...bare, loanProductId: "p1" }, NOW).segment).toBe(LeadSegment.WARM);
    expect(classifyLead({ ...bare, amount: "2500000" }, NOW).segment).toBe(LeadSegment.WARM);
  });

  it("treats a lead the team has qualified as WARM even before details are typed in", () => {
    expect(classifyLead({ ...bare, status: LeadStatus.QUALIFIED }, NOW).segment).toBe(LeadSegment.WARM);
    expect(classifyLead({ ...bare, status: LeadStatus.DOCS_PENDING }, NOW).segment).toBe(LeadSegment.WARM);
  });

  it("is COLD when there is a name and number and nothing else", () => {
    expect(classifyLead(bare, NOW).segment).toBe(LeadSegment.COLD);
    expect(classifyLead({ ...bare, status: LeadStatus.CONTACTED }, NOW).segment).toBe(LeadSegment.COLD);
  });

  it("counts a zero amount or income as not given", () => {
    expect(missingForMeeting({ ...complete, amount: "0", monthlyIncome: 0 })).toEqual(["loan amount", "monthly income"]);
  });

  describe("deciding later", () => {
    it("parks a lead whose follow-up is more than the park window away, even a complete one", () => {
      const r = classifyLead({ ...complete, nextFollowUpAt: inDays(PARK_DAYS + 3) }, NOW);
      expect(r.segment).toBe(LeadSegment.FOLLOW_UP);
      expect(r.note).toMatch(/Follow up on/);
    });

    it("keeps a lead with a near follow-up date in its working segment", () => {
      expect(seg({ nextFollowUpAt: inDays(1) })).toBe(LeadSegment.HOT);
      expect(seg({ nextFollowUpAt: inDays(PARK_DAYS) })).toBe(LeadSegment.HOT);
    });

    it("keeps a lead whose follow-up date has passed in its working segment", () => {
      expect(seg({ nextFollowUpAt: inDays(-4) })).toBe(LeadSegment.HOT);
    });
  });

  it("gives closed leads no segment", () => {
    expect(seg({ status: LeadStatus.CONVERTED })).toBeNull();
    expect(seg({ status: LeadStatus.LOST })).toBeNull();
  });

  it("sorts in priority order as Postgres orders the enum", () => {
    expect(Object.values(LeadSegment)).toEqual(["HOT", "WARM", "FOLLOW_UP", "COLD"]);
  });
});
