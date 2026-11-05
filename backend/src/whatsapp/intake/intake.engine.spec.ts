import { INTAKE_GUIDE } from "./intake-guide";
import { answerKey, answersByKey, checkAnswer, loanFor, nextQuestions, parseMoney, rupees, withSeeds } from "./intake.engine";

const field = (loan: string, key: string) => {
  const f = INTAKE_GUIDE[loan]!.fields.find((x) => x.key === key);
  if (!f) throw new Error(`no ${key} in ${loan}`);
  return f;
};

describe("parseMoney", () => {
  it("reads rupee figures the way people write them", () => {
    expect(parseMoney("4000000")).toBe(4_000_000);
    expect(parseMoney("40,00,000")).toBe(4_000_000);
    expect(parseMoney("₹ 40 lakh")).toBe(4_000_000);
    expect(parseMoney("1.5 cr")).toBe(15_000_000);
    expect(parseMoney("75k")).toBe(75_000);
    expect(parseMoney("about a lot")).toBeNull();
  });
  it("writes amounts with Indian grouping, as the website does", () => {
    expect(rupees(4_000_000)).toBe("₹40,00,000");
  });
});

describe("the guide", () => {
  it("covers every loan page that has a second form, and the new Education Infrastructure Loan", () => {
    expect(Object.keys(INTAKE_GUIDE).length).toBeGreaterThanOrEqual(28);
    expect(loanFor("education-infrastructure-loan")?.title).toBe("Education Infrastructure Loan");
  });
  it("keeps every question's wording within the CRM's 80-character limit for answer rows", () => {
    for (const [slug, loan] of Object.entries(INTAKE_GUIDE)) {
      for (const f of loan.fields) expect({ slug, key: f.key, length: f.label.length <= 80 }).toEqual({ slug, key: f.key, length: true });
    }
  });
});

describe("nextQuestions", () => {
  const slug = "education-infrastructure-loan";

  it("starts with the kind of loan, then the location", () => {
    const first = nextQuestions(slug, {}, 2).fields.map((f) => f.key);
    expect(first).toEqual(["loanKind", "location"]);
  });

  it("does not ask what is already answered, and a chosen kind of loan answers some questions itself", () => {
    const answers = { loanKind: "Secured Funding for Schools", location: "Dadar East" };
    const seeded = withSeeds(loanFor(slug)!, answers);
    expect(seeded["securityOffered"]).toBe("Yes, property");
    expect(seeded["institutionType"]).toBe("School");
    const keys = nextQuestions(slug, answers, 50).fields.map((f) => f.key);
    expect(keys).not.toContain("loanKind");
    expect(keys).not.toContain("securityOffered");
    expect(keys[0]).toBe("constitution");
  });

  it("shows a question only when an earlier answer says so", () => {
    const school = { loanKind: "Secured Funding for Schools", location: "Dadar" };
    const schoolKeys = nextQuestions(slug, school, 50).fields.map((f) => f.key);
    expect(schoolKeys).toContain("boardAffiliation"); // asked of schools
    expect(schoolKeys).not.toContain("courses"); // asked only of higher education
    const college = { loanKind: "Funding for Higher Education Institutions", location: "Dadar" };
    const collegeKeys = nextQuestions(slug, college, 50).fields.map((f) => f.key);
    expect(collegeKeys).toContain("courses");
    expect(collegeKeys).not.toContain("boardAffiliation");
    // property questions appear only when property is offered
    const noProperty = { ...school, securityOffered: "No, I want it without security" };
    expect(nextQuestions(slug, noProperty, 80).fields.map((f) => f.key)).not.toContain("propertyKind");
  });

  it("counts what is left, and reaches zero when everything showing is answered", () => {
    let answers: Record<string, string> = {};
    for (let i = 0; i < 400; i++) {
      const { fields } = nextQuestions(slug, answers, 1);
      const f = fields[0];
      if (!f) break;
      const value = f.kind === "amount" ? "5,00,000" : f.kind === "percent" ? "9" : f.options ? f.options[0]! : "test";
      answers = { ...answers, [f.key]: value };
    }
    expect(nextQuestions(slug, answers, 5).remaining).toBe(0);
  });
});

describe("checkAnswer", () => {
  const slug = "education-infrastructure-loan";

  it("accepts a choice in any case and by its start", () => {
    const f = field(slug, "yearsRunning");
    expect(checkAnswer(f, "more than 5 years")).toEqual({ ok: true, value: "More than 5 years" });
    expect(checkAnswer(f, "Less than 3")).toEqual({ ok: true, value: "Less than 3 years" });
  });
  it("refuses a choice that is not on the list, saying what is allowed", () => {
    const r = checkAnswer(field(slug, "yearsRunning"), "yesterday");
    expect(r.ok).toBe(false);
  });
  it("keeps free wording as 'Other (...)' where the question has an Other", () => {
    const f = field(slug, "constitution");
    expect(checkAnswer(f, "Mutual benefit trust")).toEqual({ ok: true, value: "Other (Mutual benefit trust)" });
  });
  it("writes amounts the website's way and refuses nonsense", () => {
    const f = field(slug, "annualTurnover");
    expect(checkAnswer(f, "6 crore")).toEqual({ ok: true, value: "₹6,00,00,000" });
    expect(checkAnswer(f, "lots").ok).toBe(false);
    expect(checkAnswer(f, "0").ok).toBe(false);
  });
});

describe("answersByKey", () => {
  it("finds the saved rows by each question's wording", () => {
    const f = field("education-infrastructure-loan", "yearsRunning");
    const rows = [{ key: answerKey(f.label), value: "More than 5 years" }];
    expect(answersByKey("education-infrastructure-loan", rows)).toEqual({ yearsRunning: "More than 5 years" });
    expect(answersByKey(null, rows)).toEqual({});
  });
});
