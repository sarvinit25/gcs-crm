import {
  COL,
  applicationCandidate,
  batchCodes,
  classifyOutcome,
  classifyRemark,
  cityFromAmountColumn,
  cleanRow,
  extractMobiles,
  futureFollowUp,
  mapProduct,
  mergePeople,
  normalizeCaller,
  parseAmount,
  parseDate,
  tidyName,
  type Cell,
  type CleanContext,
} from "./clean";

const NOW = new Date("2026-11-19T00:00:00Z");

describe("phone numbers", () => {
  it("picks every mobile out of a cell that holds several, in order", () => {
    expect(extractMobiles("9820793681 / 9987218284")).toEqual(["9820793681", "9987218284"]);
    expect(extractMobiles("9820793681,8879068654, 9320099000")).toEqual(["9820793681", "8879068654", "9320099000"]);
  });

  it("accepts the usual ways of writing one number", () => {
    expect(extractMobiles("+91 98207 93681")).toEqual(["9820793681"]);
    expect(extractMobiles("098207-93681")).toEqual(["9820793681"]);
    expect(extractMobiles(9820793681)).toEqual(["9820793681"]);
  });

  it("ignores landlines, short numbers, dummy numbers and blanks", () => {
    expect(extractMobiles("25862200", "022 2743 1048", "", null, undefined)).toEqual([]);
    expect(extractMobiles("9999999999", "9876543210", "1234567890")).toEqual([]);
    expect(extractMobiles("5820793681")).toEqual([]); // does not start 6-9
  });

  it("reads all the phone cells, drops repeats, and keeps the first cell's numbers first", () => {
    expect(extractMobiles("9820793681", "25862200", "9987218284 / 9820793681")).toEqual(["9820793681", "9987218284"]);
  });
});

describe("amounts", () => {
  it("reads numbers and the usual written forms", () => {
    expect(parseAmount(1000000)).toEqual({ value: 1000000 });
    expect(parseAmount("1,00,000")).toEqual({ value: 100000 });
    expect(parseAmount("10 L")).toEqual({ value: 1000000 });
    expect(parseAmount("50 lakh")).toEqual({ value: 5000000 });
    expect(parseAmount("1.5 Cr")).toEqual({ value: 15000000 });
    expect(parseAmount("₹ 75,000")).toEqual({ value: 75000 });
  });

  it("does not believe tiny figures, and holds huge ones for review", () => {
    expect(parseAmount(0.2)).toEqual({ flag: "tiny" });
    expect(parseAmount(500)).toEqual({ flag: "tiny" });
    expect(parseAmount(7700921095)).toEqual({ flag: "huge" });
  });

  it("says unreadable for text with digits it cannot read, and nothing for words or a blank", () => {
    expect(parseAmount("approx 10-15 L")).toEqual({ flag: "unreadable" });
    expect(parseAmount("see remarks")).toEqual({});
    expect(parseAmount("MUMBAI")).toEqual({});
    expect(parseAmount("")).toEqual({});
    expect(parseAmount(null)).toEqual({});
  });
});

describe("the city that sits in the Loan Amount column", () => {
  it("takes a known place as the city and ignores other words", () => {
    expect(cityFromAmountColumn("MUMBAI")).toBe("Mumbai");
    expect(cityFromAmountColumn("NAVIMUMBAI")).toBe("Navi Mumbai");
    expect(cityFromAmountColumn("Thane West")).toBe("Thane West");
    expect(cityFromAmountColumn("DOMBIVLI")).toBe("Dombivli");
    expect(cityFromAmountColumn("FARHAN")).toBeUndefined();
    expect(cityFromAmountColumn("EMI")).toBeUndefined();
    expect(cityFromAmountColumn(1500000)).toBeUndefined();
    expect(cityFromAmountColumn("")).toBeUndefined();
  });
});

describe("names, products, callers", () => {
  it("turns ALL CAPS into Title Case and leaves mixed case alone", () => {
    expect(tidyName("PRAVIN SAGALE")).toBe("Pravin Sagale");
    expect(tidyName("  Dhaval Chheda / GIRISH KESHA ")).toBe("Dhaval Chheda / GIRISH KESHA");
    expect(tidyName("TRANS IMPEX SHIPPING INC.")).toBe("Trans Impex Shipping Inc");
    expect(tidyName(null)).toBe("");
  });

  it("maps only the product codes it knows", () => {
    expect(["BL", "UBL", "hl", "LAP", "PL", "WCL"].map(mapProduct)).toEqual(["business-loan", "business-loan", "home-loan", "loan-against-property", "personal-loan", "working-capital-term-loan"]);
    expect(mapProduct("POW HL V BRE")).toBeUndefined();
    expect(mapProduct("")).toBeUndefined();
  });

  it("fixes the callers' names and treats 0 as nobody", () => {
    expect(normalizeCaller("Sourish")).toBe("Sourish");
    expect(normalizeCaller("Soursih")).toBe("Sourish");
    expect(normalizeCaller(" mahesh ")).toBe("Mahesh");
    expect(normalizeCaller("Sneha")).toBe("Sneha");
    expect(normalizeCaller("0")).toBeUndefined();
    expect(normalizeCaller("")).toBeUndefined();
    expect(normalizeCaller("RAVI KUMAR")).toBe("Ravi Kumar");
  });
});

describe("dates", () => {
  it("reads dates, Excel serial numbers and written dates, and refuses nonsense", () => {
    expect(parseDate(new Date("2014-05-02T00:00:00Z"))?.toISOString().slice(0, 10)).toBe("2014-05-02");
    expect(parseDate(41761)?.toISOString().slice(0, 10)).toBe("2014-05-02");
    expect(parseDate("23/02/2018")?.toISOString().slice(0, 10)).toBe("2018-02-23");
    expect(parseDate("2018-02-23")?.toISOString().slice(0, 10)).toBe("2018-02-23");
    expect(parseDate("soon")).toBeUndefined();
    expect(parseDate(new Date("1900-01-01"))).toBeUndefined();
    expect(parseDate(null)).toBeUndefined();
  });

  it("keeps a follow-up only when it is ahead of today and not absurdly far", () => {
    expect(futureFollowUp(new Date("2026-12-01T00:00:00Z"), NOW)).toBeDefined();
    expect(futureFollowUp(new Date("2019-05-01T00:00:00Z"), NOW)).toBeUndefined();
    expect(futureFollowUp(new Date("2026-11-19T00:00:00Z"), NOW)).toBeUndefined();
    expect(futureFollowUp(new Date("2035-01-01T00:00:00Z"), NOW)).toBeUndefined();
  });
});

describe("remarks", () => {
  it.each([
    ["DND Client", "DND"],
    ["do not disturb", "DND"],
    ["Wrong No", "WRONG_NUMBER"],
    ["dial code does not exist", "WRONG_NUMBER"],
    ["Not in service", "WRONG_NUMBER"],
    ["Not interested", "NOT_INTERESTED"],
    ["Lead by VD not interested", "NOT_INTERESTED"],
    ["Call & share our details on Aug. Ringing not int", "NOT_INTERESTED"],
    ["currently there is no req", "NOT_INTERESTED"],
    ["Contact no req", "NOT_INTERESTED"],
    ["we don't want any loans", "NOT_INTERESTED"],
    ["call back tomorrow", "CALL_BACK"],
    ["Always ringing", "RINGING"],
    ["Interested, share details", "INTERESTED"],
    ["PD done pendency shared", "OTHER"],
    ["Call & share our details on Aug", "OTHER"],
    ["", "NONE"],
    [null, "NONE"],
  ] as [Cell, string][])("reads %j as %s", (remark, kind) => {
    expect(classifyRemark(remark)).toBe(kind);
  });

  it("puts a do-not-disturb above everything else in the same remark", () => {
    expect(classifyRemark("Wrong no, DND, not interested")).toBe("DND");
  });
});

describe("case outcomes and batches", () => {
  it("knows the three outcomes the Scheme column can hold, and ignores other scheme names", () => {
    expect(classifyOutcome("DISBURSED")).toBe("DISBURSED");
    expect(classifyOutcome("Policy Declined")).toBe("POLICY_DECLINED");
    expect(classifyOutcome("POLICY DECLINE")).toBe("POLICY_DECLINED");
    expect(classifyOutcome("underwriter  review")).toBe("UNDERWRITER_REVIEW");
    expect(classifyOutcome("UBL SALES")).toBeUndefined();
    expect(classifyOutcome("")).toBeUndefined();
  });

  it("treats a code used by many rows as a batch and the rest as per-case references", () => {
    const rows: Cell[][] = [
      ...Array.from({ length: 40 }, () => ["Kotak"]),
      ...Array.from({ length: 39 }, () => ["Aurum"]),
      ["FI-1234"],
    ];
    expect(batchCodes(rows)).toEqual(new Set(["KOTAK"]));
  });
});

// ── a whole row, and the merge ────────────────────────────────────────────────────────────

const ctx: CleanContext = { batches: new Set(["KOTAK", "SHRIRAM", "99 DATABANK"]), now: NOW };
const row = (o: Partial<Record<keyof typeof COL, Cell>>): Cell[] => {
  const r: Cell[] = Array.from({ length: 38 }, () => null);
  for (const [k, v] of Object.entries(o)) r[COL[k as keyof typeof COL]] = v as Cell;
  return r;
};

describe("one row", () => {
  it("cleans every field it can read", () => {
    const s = cleanRow(
      row({ code: "KOTAK", date: new Date("2014-05-02T00:00:00Z"), company: "SHANTANU TEXTIES", customer: "PRAVIN SAGALE", designation: "DIRECTOR ", product: "BL", mobile: "8879068654", resiPhone: "25862200", amount: "10 L", callDate: new Date("2018-02-23T00:00:00Z"), callPerson: "Soursih", remarks: "Call & share our details", followUp: new Date("2026-12-10T00:00:00Z"), panOrTenure: "aakca5192n", cibil: -1, risk: 62 }),
      2,
      ctx,
    );
    expect(s).toMatchObject({ line: 2, batch: "KOTAK", name: "Pravin Sagale", company: "Shantanu Texties", designation: "Director", product: "business-loan", amount: 1000000, mobiles: ["8879068654"], caller: "Sourish", remarkKind: "OTHER", pan: "AAKCA5192N" });
    expect(s.ref).toBeUndefined();
    expect(s.followUpAt?.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(s.credit).toEqual({ "Risk score": "62" }); // a CIBIL of -1 means no score and is dropped
  });

  it("keeps a per-case code as a reference and puts the row in 'Other cases'", () => {
    const s = cleanRow(row({ code: "FI-77/2014", customer: "A B", mobile: "9820793681" }), 5, ctx);
    expect(s.batch).toBe("OTHER CASES");
    expect(s.ref).toBe("FI-77/2014");
  });

  it("reads the city from the Loan Amount column and does not call it an unreadable amount", () => {
    const s = cleanRow(row({ code: "99 DATABANK", customer: "A B", mobile: "9820793681", amount: "THANE" }), 7, ctx);
    expect(s.city).toBe("Thane");
    expect(s.amount).toBeUndefined();
    expect(s.amountFlag).toBeUndefined();
  });

  it("flags an amount it will not trust instead of using it", () => {
    const s = cleanRow(row({ code: "KOTAK", customer: "A B", mobile: "9820793681", amount: 7700921095 }), 6, ctx);
    expect(s.amount).toBeUndefined();
    expect(s.amountFlag).toBe("huge");
  });
});

describe("people", () => {
  const r = (line: number, o: Partial<Record<keyof typeof COL, Cell>>) => cleanRow(row({ code: "KOTAK", customer: "Asha Rao", mobile: "9820793681", ...o }), line, ctx);

  it("merges rows on the primary mobile, keeps the history in date order and the newest facts", () => {
    const [p] = mergePeople([
      r(2, { callDate: new Date("2023-03-01T00:00:00Z"), remarks: "ringing", amount: 500000, product: "PL" }),
      r(3, { callDate: new Date("2024-06-01T00:00:00Z"), remarks: "Interested, share details", amount: 800000, product: "BL", code: "99 DATABANK" }),
    ]);
    expect(p).toMatchObject({ key: "9820793681", category: "LIVE", product: "business-loan", amount: 800000, batches: ["KOTAK", "99 DATABANK"], lines: [2, 3] });
    expect(p!.history.map((h) => h.kind)).toEqual(["RINGING", "INTERESTED"]);
  });

  it("calls a person dead when their newest remark says so, with the reason", () => {
    const [p] = mergePeople([r(2, { callDate: new Date("2023-03-01T00:00:00Z"), remarks: "interested" }), r(3, { callDate: new Date("2024-06-01T00:00:00Z"), remarks: "Not interested" })]);
    expect(p).toMatchObject({ category: "DEAD", deadReason: "Not interested", doNotCall: false });
  });

  it("keeps a person live when an older 'not interested' was followed by a newer interested call", () => {
    const [p] = mergePeople([r(2, { callDate: new Date("2023-03-01T00:00:00Z"), remarks: "not interested" }), r(3, { callDate: new Date("2024-06-01T00:00:00Z"), remarks: "interested now" })]);
    expect(p!.category).toBe("LIVE");
  });

  it("makes a do-not-disturb permanent, whatever was said later", () => {
    const [p] = mergePeople([r(2, { callDate: new Date("2023-03-01T00:00:00Z"), remarks: "DND client" }), r(3, { callDate: new Date("2024-06-01T00:00:00Z"), remarks: "interested" })]);
    expect(p).toMatchObject({ category: "DEAD", doNotCall: true, deadReason: "Asked not to be called (do not disturb)" });
  });

  it("puts a row with no mobile in its own 'Needs phone' group, never merged with another", () => {
    const people = mergePeople([r(2, { mobile: null }), r(3, { mobile: null, customer: "Other Person" })]);
    expect(people).toHaveLength(2);
    expect(people.every((p) => p.category === "NEEDS_PHONE" && p.key === undefined)).toBe(true);
  });

  it("keeps the city when merging", () => {
    const [p] = mergePeople([r(2, { amount: "MUMBAI" }), r(3, { amount: 900000 })]);
    expect(p).toMatchObject({ city: "Mumbai", amount: 900000 });
  });

  it("uses the company name when there is no customer name", () => {
    const [p] = mergePeople([r(2, { customer: null, company: "SATYAM SALES & SERVICES" })]);
    expect(p!.name).toBe("Satyam Sales & Services");
  });
});

describe("applications for old Shriram cases", () => {
  const person = (o: Partial<Record<keyof typeof COL, Cell>>) => mergePeople([cleanRow(row({ code: "SHRIRAM", customer: "Asha Rao", mobile: "9820793681", date: new Date("2013-01-02T00:00:00Z"), product: "BL", amount: 1500000, ...o }), 2, ctx)])[0]!;

  it("makes a complete disbursed application with no money records implied", () => {
    expect(applicationCandidate(person({ scheme: "DISBURSED" }))).toEqual({ status: "DISBURSED", lender: "Shriram", product: "business-loan", amount: 1500000, complete: true, missing: [] });
  });

  it("makes a rejected application from a policy decline", () => {
    expect(applicationCandidate(person({ scheme: "POLICY DECLINED" }))).toMatchObject({ status: "REJECTED", complete: true });
  });

  it("says what is missing instead of guessing", () => {
    expect(applicationCandidate(person({ scheme: "DISBURSED", product: null, amount: null }))).toMatchObject({ complete: false, missing: ["product", "amount"] });
  });

  it("makes nothing for under-review cases, other lenders, or rows with no outcome", () => {
    expect(applicationCandidate(person({ scheme: "UNDERWRITER REVIEW" }))).toBeUndefined();
    expect(applicationCandidate(person({ scheme: "DISBURSED", code: "KOTAK" }))).toBeUndefined();
    expect(applicationCandidate(person({ scheme: "NORMAL" }))).toBeUndefined();
  });
});
