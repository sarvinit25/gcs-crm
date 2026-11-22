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

describe("a choice answered with just 'Other'", () => {
  const { otherToSpecify } = jest.requireActual("./intake.engine");
  it("is picked up so the assistant can ask what it is", () => {
    expect(otherToSpecify("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer", propertyKind: "Other" })?.key).toBe("propertyKind");
  });
  it("is left alone once the customer has said what it is, or chose something else", () => {
    expect(otherToSpecify("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer", propertyKind: "Other (a godown)" })).toBeNull();
    expect(otherToSpecify("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer", propertyKind: "Commercial" })).toBeNull();
  });
});

describe("the new overdraft questions", () => {
  const { nextQuestions } = jest.requireActual("./intake.engine");
  it("a drop-line overdraft transfer is asked about limit, drawing power, reduction, renewal and overdue", () => {
    const keys = nextQuestions("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer" }, 60).fields.map((f: { key: string }) => f.key);
    for (const k of ["odSanctioned", "odCurrentLimit", "odDrawing", "odRateType", "odRepayment", "odInterestDebit", "odReduction", "odRenewal", "odOverdue"]) expect(keys).toContain(k);
  });
  it("a home loan transfer is not asked about overdraft limits", () => {
    const keys = nextQuestions("balance-transfer", { loanType: "Home Loan Balance Transfer" }, 60).fields.map((f: { key: string }) => f.key);
    expect(keys).not.toContain("odSanctioned");
  });
  it("the amount overdue is only asked when something is overdue", () => {
    const has = (a: Record<string, string>) => nextQuestions("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer", ...a }, 60).fields.some((f: { key: string }) => f.key === "odOverdueAmount");
    expect(has({ odOverdue: "No" })).toBe(false);
    expect(has({ odOverdue: "Yes" })).toBe(true);
  });
});

describe("reading a figure out of a sentence", () => {
  const { checkAnswer } = jest.requireActual("./intake.engine");
  const pct = { key: "r", label: "Rate", kind: "percent" };
  const amt = { key: "a", label: "Amount", kind: "amount" };
  it("takes the one rate in 'about 11 percent floating'", () => {
    expect(checkAnswer(pct, "11 percent floating")).toEqual({ ok: true, value: "11%" });
    expect(checkAnswer(pct, "9.75%")).toEqual({ ok: true, value: "9.75%" });
    expect(checkAnswer(pct, "9 to 10").ok).toBe(false);
  });
  it("takes the one amount in a sentence, and refuses two", () => {
    expect(checkAnswer(amt, "around 1.5 lakh a month")).toEqual({ ok: true, value: "₹1,50,000" });
    expect(checkAnswer(amt, "1.60 CR")).toEqual({ ok: true, value: "₹1,60,00,000" });
    expect(checkAnswer(amt, "between 5 and 10 lakh").ok).toBe(false);
    expect(checkAnswer(amt, "Rent").ok).toBe(false);
  });
});

describe("what the answers say about the lead", () => {
  const { leadFacts, reviewReasons, checklistUrl } = jest.requireActual("./intake.engine");
  it("sets salaried or self-employed and the salary, the way the website's form does", () => {
    expect(leadFacts("personal-loan", { netSalary: "₹85,000" }, "Salaried")).toEqual({ employmentType: "SALARIED", monthlyIncome: 85000 });
    expect(leadFacts("business-loan", {}, "Proprietor")).toEqual({ employmentType: "SELF_EMPLOYED", monthlyIncome: null });
    expect(leadFacts("home-loan", {}, "NRI")).toEqual({ employmentType: null, monthlyIncome: null });
  });
  it("flags what an expert must look at, and never says to turn the customer away", () => {
    const r = reviewReasons("balance-transfer", { loanType: "Drop-Line Overdraft Balance Transfer", track: "A few delays or bounces", ownership: "A parent or family member", odOverdue: "Yes" });
    expect(r).toEqual(expect.arrayContaining(["Delays or bounces on the present loan", "The property is not in the applicant's own name", "An amount is overdue on the present facility"]));
    expect(r.join(" ")).not.toMatch(/reject|decline the customer/i);
    expect(reviewReasons("balance-transfer", { track: "Every EMI on time", ownership: "My own name" })).toEqual([]);
    expect(reviewReasons("private-funding", {})).toEqual(["Private funding always needs an expert's review"]);
  });
  it("does not count a skipped answer as a problem", () => {
    expect(reviewReasons("balance-transfer", { track: "Not sure (the expert will confirm)" })).toEqual([]);
  });
  it("links the website's document checklist for the loan", () => {
    expect(checklistUrl("https://growthcapitalservices.in/", "balance-transfer", "Proprietor")).toBe("https://growthcapitalservices.in/checklists/balance-transfer-checklist.pdf");
    expect(checklistUrl("https://x.in", "home-loan", "Salaried")).toBe("https://x.in/checklists/home-loan-salaried-checklist.pdf");
    expect(checklistUrl("https://x.in", "home-loan", "Proprietor")).toBe("https://x.in/checklists/home-loan-self-employed-checklist.pdf");
    expect(checklistUrl("https://x.in", "home-loan", "NRI")).toBe("https://x.in/checklists/home-loan-nri-checklist.pdf");
    expect(checklistUrl("https://x.in", "nonsense", null)).toBeNull();
  });
});

describe("what carries over to a second loan", () => {
  const { sharedAnswers } = jest.requireActual("./intake.engine");
  it("carries answers about the person, not about the first product", () => {
    const got = sharedAnswers("personal-loan", "new-car-loan", { employerType: "Listed or MNC company", netSalary: "₹90,000", hasLoans: "No", purpose: "Wedding" });
    const labels = got.map((a: { label: string }) => a.label);
    expect(labels).toEqual(expect.arrayContaining(["Where do you work?", "Monthly take-home salary", "Do you have any running loans or credit cards?"]));
    expect(labels).not.toContain("Type of loan");
  });
  it("skips answers that were not given and loans that have no form", () => {
    expect(sharedAnswers("personal-loan", "new-car-loan", { employerType: "Not sure (the expert will confirm)" })).toEqual([]);
    expect(sharedAnswers("personal-loan", "nonsense", { employerType: "x" })).toEqual([]);
  });
});

describe("an amount that cannot be rupees", () => {
  const { checkAnswer } = jest.requireActual("./intake.engine");
  const amt = { key: "v", label: "Value", kind: "amount" };
  it("asks for lakh or crore instead of taking a bare small number", () => {
    for (const t of ["1", "50", "999"]) {
      const r = checkAnswer(amt, t);
      expect(r.ok).toBe(false);
      expect(r.hint).toMatch(/lakh or crore/);
    }
    expect(checkAnswer(amt, "1 crore")).toEqual({ ok: true, value: "₹1,00,00,000" });
    expect(checkAnswer(amt, "1000")).toEqual({ ok: true, value: "₹1,000" });
    expect(checkAnswer({ ...amt, allowZero: true }, "0")).toEqual({ ok: true, value: "₹0" });
  });
});

describe("backing an answer with the customer's own words", () => {
  const { supportedBy, sharesWordWith } = jest.requireActual("./intake.engine");
  it("finds quoted words in the message, ignoring case and punctuation", () => {
    expect(supportedBy("My CIBIL is 650, and I paid late twice!", "my cibil is 650")).toBe(true);
    expect(supportedBy("Correction: My property is worth ₹2.5 crore, not ₹2 crore.", "Not sure")).toBe(false);
    expect(supportedBy("anything", "")).toBe(false);
    expect(supportedBy("anything", undefined)).toBe(false);
  });
  it("links a volunteered fact to a question only when a key word is shared", () => {
    expect(sharesWordWith("Roughly what is your CIBIL score?", "my cibil is 650")).toBe(true);
    expect(sharesWordWith("Approximate market value of the property", "the property is worth 5 crore")).toBe(true);
    expect(sharesWordWith("Roughly what is your CIBIL score?", "I earn 80000 every month")).toBe(false);
  });
});
