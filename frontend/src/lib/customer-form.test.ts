import { describe, expect, it } from "vitest";
import {
  digits, fieldErrors, firstStepWithProblem, formLink, formatBytes, fromServer, tenureInWords, toPayload, whatsappLink,
  type FormValues,
} from "./customer-form";

const today = "2026-10-02";
const ref = (n: string) => ({ name: `Ref ${n}`, phone: "9876543210", relation: "", address: "" });
const complete: FormValues = {
  name: "Asha Patil", email: "asha@example.com", dateOfBirth: "1990-05-17", pan: "ABCDE1234F", aadhaarLast4: "",
  address: "12 MG Road", city: "Mumbai", pincode: "400001", isNRI: false, employmentType: "SALARIED", constitution: "",
  employerName: "Acme", monthlyIncome: "85000", requestedAmount: "2500000", tenureMonths: "120", purpose: "",
  references: [ref("A"), ref("B")],
};
const errors = (v: FormValues, referencesRequired = 2) => fieldErrors(v, { referencesRequired, today });

describe("fieldErrors", () => {
  it("is empty for a complete form", () => expect(errors(complete)).toEqual({}));

  it("flags what is missing, step by step", () => {
    const e = errors({ ...complete, name: "", pan: "", city: "", monthlyIncome: "", references: [] });
    expect(Object.keys(e).sort()).toEqual(["city", "monthlyIncome", "name", "pan", "references"]);
    expect(firstStepWithProblem(e)).toBe(0);
    expect(firstStepWithProblem({ monthlyIncome: "x", references: "y" })).toBe(1);
    expect(firstStepWithProblem({})).toBeNull();
  });

  it("checks formats and age", () => {
    expect(errors({ ...complete, pan: "abc" }).pan).toMatch(/ABCDE1234F/);
    expect(errors({ ...complete, pincode: "4000" }).pincode).toMatch(/6 digits/);
    expect(errors({ ...complete, email: "nope" }).email).toBeDefined();
    expect(errors({ ...complete, email: "" })).toEqual({});
    expect(errors({ ...complete, dateOfBirth: "2012-01-01" }).dateOfBirth).toMatch(/18/);
    expect(errors({ ...complete, dateOfBirth: "2008-10-02" })).toEqual({}); // turns 18 today
    expect(errors({ ...complete, aadhaarLast4: "12" }).aadhaarLast4).toBeDefined();
  });

  it("asks for an employer and, for a business, how it is set up (unless NRI)", () => {
    expect(errors({ ...complete, employerName: "" }).employerName).toMatch(/Employer/);
    const biz = { ...complete, employmentType: "BUSINESS" as const };
    expect(errors({ ...biz, employerName: "" }).employerName).toMatch(/Business/);
    expect(errors({ ...biz, employerName: "Patil Traders" }).constitution).toBeDefined();
    expect(errors({ ...biz, employerName: "Patil Traders", isNRI: true })).toEqual({});
    expect(errors({ ...complete, employmentType: "OTHER", employerName: "" })).toEqual({});
  });

  it("counts only references with a name and a valid mobile number", () => {
    const half = { ...complete, references: [ref("A"), { ...ref("B"), phone: "12345" }] };
    expect(errors(half).references).toMatch(/2 references/);
    expect(errors(half, 1)).toEqual({});
    expect(errors({ ...complete, references: [] }, 0)).toEqual({});
  });
});

describe("toPayload", () => {
  it("saves valid answers, clears emptied ones, and holds back anything half-typed", () => {
    const p = toPayload({ ...complete, pan: "ABCD", pincode: "", email: "asha@example.com", tenureMonths: "12.5" });
    expect(p).not.toHaveProperty("pan"); // still being typed
    expect(p.pincode).toBeNull(); // cleared
    expect(p.email).toBe("asha@example.com");
    expect(p).not.toHaveProperty("tenureMonths"); // not a whole number
    expect(p.monthlyIncome).toBe(85000);
    expect(p.employmentType).toBe("SALARIED");
    expect(p.constitution).toBeNull();
  });

  it("sends only complete references, without empty optional bits", () => {
    const p = toPayload({ ...complete, references: [{ name: "Ravi", phone: "9876543210", relation: " Friend ", address: "" }, { name: "R", phone: "1" }, { name: "", phone: "" }] as never });
    expect(p.references).toEqual([{ name: "Ravi", phone: "9876543210", relation: "Friend" }]);
  });
});

describe("fromServer", () => {
  it("turns nulls into empty inputs and numbers into text", () => {
    const v = fromServer({ name: "Asha", monthlyIncome: 50000, requestedAmount: null, employmentType: null, references: [{ name: "R", phone: "9876543210", relation: null }] });
    expect(v).toMatchObject({ name: "Asha", monthlyIncome: "50000", requestedAmount: "", employmentType: "", isNRI: false });
    expect(v.references).toEqual([{ name: "R", phone: "9876543210", relation: "", address: "" }]);
  });
});

describe("sharing helpers", () => {
  it("builds the link under /crm and a WhatsApp message link with an Indian country code", () => {
    expect(formLink("https://growthcapitalservices.in", "abc")).toBe("https://growthcapitalservices.in/crm/apply/abc");
    const w = whatsappLink("98765 43210", "Hi there & welcome");
    expect(w).toBe("https://wa.me/919876543210?text=Hi%20there%20%26%20welcome");
    expect(whatsappLink("+91 98765 43210", "x")).toContain("wa.me/919876543210");
  });

  it("formats sizes and tenures", () => {
    expect(digits("98-76 abc")).toBe("9876");
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(tenureInWords(120)).toBe("10 years");
    expect(tenureInWords(18)).toBe("1 year 6 months");
    expect(tenureInWords(1)).toBe("1 month");
    expect(tenureInWords(0)).toBe("");
  });
});
