import { formProblems, mergeForm, completeReferences, yearsBefore, type FormData } from "./form-rules";

const today = "2026-10-02";
const ref = (n: string) => ({ name: `Ref ${n}`, phone: "9876543210" });
const complete: FormData = {
  name: "Asha Patil",
  dateOfBirth: "1990-05-17",
  pan: "ABCDE1234F",
  address: "12 MG Road",
  city: "Mumbai",
  pincode: "400001",
  employmentType: "SALARIED",
  employerName: "Acme Ltd",
  monthlyIncome: 85000,
  requestedAmount: 2500000,
  references: [ref("A"), ref("B")],
};
const check = (form: FormData, referencesRequired = 2) => formProblems(form, { referencesRequired, today });

describe("mergeForm", () => {
  it("keeps untouched fields, overrides the ones given, and lets null clear one", () => {
    const merged = mergeForm({ name: "A", city: "Pune", pan: "ABCDE1234F" }, { city: "Mumbai", pan: null });
    expect(merged).toEqual({ name: "A", city: "Mumbai", pan: null });
  });

  it("ignores undefined, unknown keys, and replaces references as a whole", () => {
    const merged = mergeForm({ name: "A", references: [ref("A"), ref("B")] }, { name: undefined, references: [ref("C")], bogus: 1 } as FormData);
    expect(merged.name).toBe("A");
    expect(merged.references).toEqual([ref("C")]);
    expect(merged).not.toHaveProperty("bogus");
  });
});

describe("formProblems", () => {
  it("is empty for a complete form", () => {
    expect(check(complete)).toEqual({});
  });

  it("names every missing required field", () => {
    const problems = check({});
    for (const f of ["name", "dateOfBirth", "pan", "address", "city", "pincode", "employmentType", "monthlyIncome", "requestedAmount", "references"]) {
      expect(problems).toHaveProperty(f);
    }
  });

  it("treats blank text as missing", () => {
    expect(check({ ...complete, address: "   " })).toHaveProperty("address");
  });

  it("checks age: at least 18, not in the future, not absurd", () => {
    expect(check({ ...complete, dateOfBirth: "2030-01-01" }).dateOfBirth).toMatch(/future/);
    expect(check({ ...complete, dateOfBirth: yearsBefore(today, 18) })).toEqual({}); // turns 18 today
    expect(check({ ...complete, dateOfBirth: "2008-10-03" }).dateOfBirth).toMatch(/18/); // turns 18 tomorrow
    expect(check({ ...complete, dateOfBirth: "1900-01-01" }).dateOfBirth).toMatch(/check/);
  });

  it("asks for an employer, and for how a business is set up unless the person is an NRI", () => {
    expect(check({ ...complete, employerName: "" })).toHaveProperty("employerName");
    expect(check({ ...complete, employmentType: "OTHER", employerName: "" })).toEqual({});
    const biz: FormData = { ...complete, employmentType: "BUSINESS", employerName: "Patil Traders" };
    expect(check(biz)).toHaveProperty("constitution");
    expect(check({ ...biz, constitution: "PARTNERSHIP" })).toEqual({});
    expect(check({ ...biz, isNRI: true })).toEqual({});
  });

  it("counts only references with both a name and a phone, and honours the configured number", () => {
    const half = { ...complete, references: [ref("A"), { name: "No phone", phone: "" }] };
    expect(check(half).references).toMatch(/2 references/);
    expect(check(half, 1)).toEqual({});
    expect(check({ ...complete, references: [] }, 0)).toEqual({});
    expect(check({ ...complete, references: [] }, 1).references).toMatch(/one reference/);
    expect(completeReferences(half.references)).toHaveLength(1);
  });
});

describe("yearsBefore", () => {
  it("steps back whole years and keeps the month and day", () => {
    expect(yearsBefore("2026-10-02", 18)).toBe("2008-10-02");
  });
});
