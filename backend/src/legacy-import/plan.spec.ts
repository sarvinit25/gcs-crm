import type { StagedPerson } from "./clean";
import { legacyRefOf, planPerson, summarise } from "./plan";

const now = new Date("2026-11-19T00:00:00Z");
const base: StagedPerson = {
  key: "9876543210", category: "LIVE", doNotCall: false, name: "A Person", company: "Acme", designation: "Director", mobiles: ["9876543210", "9123456789"],
  amountFlags: [], batches: ["SHRIRAM"], refs: [], history: [], resiAddr: "", officeAddr: "", credit: {}, lines: [7],
};

describe("planPerson", () => {
  it("makes an untouched live person a NEW lead with a second number kept", () => {
    const { lead, followUps, application } = planPerson(base, "b1", now);
    expect(lead).toMatchObject({ status: "NEW", phone: "9876543210", secondaryPhone: "9123456789", importBatch: "b1", legacyRef: "row:7" });
    expect(followUps).toEqual([]);
    expect(application).toBeUndefined();
  });

  it("archives dead leads as LOST with their reason", () => {
    const { lead } = planPerson({ ...base, category: "DEAD", deadReason: "Not interested" }, "b1", now);
    expect(lead).toMatchObject({ status: "LOST", lostReason: "Not interested" });
    expect(lead.archivedAt).toBeInstanceOf(Date);
  });

  it("keeps people with no number, with an empty phone", () => {
    expect(planPerson({ ...base, key: undefined, mobiles: [], category: "NEEDS_PHONE" }, "b1", now).lead.phone).toBe("");
  });

  it("carries only a future follow-up date, so Reminders is not flooded", () => {
    expect(planPerson({ ...base, followUpAt: new Date("2026-01-01") }, "b1", now).lead.nextFollowUpAt).toBeUndefined();
    expect(planPerson({ ...base, followUpAt: new Date("2026-12-01") }, "b1", now).lead.nextFollowUpAt).toEqual(new Date("2026-12-01"));
  });

  it("turns history into follow-ups and marks the lead CONTACTED", () => {
    const p = { ...base, history: [{ at: new Date("2026-05-01"), caller: "Mahesh", remark: "Call back", kind: "CALL_BACK" as const, batch: "SHRIRAM", line: 7 }] };
    const { lead, followUps } = planPerson(p, "b1", now);
    expect(lead.status).toBe("CONTACTED");
    expect(followUps[0].note).toBe("[Mahesh] Call back");
  });

  it("creates an application only for complete Shriram outcomes", () => {
    const done = { ...base, outcome: "DISBURSED" as const, product: "business-loan", amount: 500000, createdAt: new Date("2026-02-01") };
    expect(planPerson(done, "b1", now).application).toMatchObject({ status: "DISBURSED", lenderName: "Shriram Finance" });
    const incomplete = planPerson({ ...done, amount: undefined }, "b1", now);
    expect(incomplete.application).toBeUndefined();
    expect(incomplete.applicationSkipped).toEqual(["amount"]);
    expect(planPerson({ ...done, outcome: "POLICY_DECLINED" }, "b1", now).application?.status).toBe("REJECTED");
  });

  it("uses the sheet's reference when there is one and counts a summary", () => {
    expect(legacyRefOf({ ...base, refs: ["X1"] })).toBe("ref:X1");
    expect(summarise([planPerson(base, "b", now)], ["LIVE"])).toMatchObject({ people: 1, byCategory: { LIVE: 1 }, applications: 0 });
  });
});
