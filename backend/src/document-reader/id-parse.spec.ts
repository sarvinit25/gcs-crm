import { parseId, verhoeffOk, whoseCard } from "./id-parse";

// A made-up number with a correct check digit.
const withCheck = (eleven: string) => [..."0123456789"].map((d) => eleven + d).find(verhoeffOk)!;
const aadhaar = withCheck("23412341234");
const spaced = aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ");

describe("reading identity cards", () => {
  it("takes a person's PAN and birth date", () => {
    expect(parseId("INCOME TAX DEPARTMENT\nTEST PERSON\n25/11/1969\nPermanent Account Number\nABCPE1234F")).toEqual({ pan: "ABCPE1234F", dob: "1969-11-25" });
  });
  it("ignores a firm's PAN", () => {
    expect(parseId("Permanent Account Number AAAFT1234K").pan).toBeUndefined();
  });
  it("keeps only the last four digits of an Aadhaar, with the address and pincode", () => {
    const r = parseId(`Government of India\nDOB: 25/11/1969\n${spaced}\nAddress: Flat 1, Some Society,\nSome Road, Thane,\nMaharashtra - 400610`);
    expect(r).toMatchObject({ aadhaarLast4: aadhaar.slice(-4), dob: "1969-11-25", pincode: "400610" });
    expect(r.address).toContain("Some Society");
    expect(JSON.stringify(r)).not.toContain(aadhaar);
  });
  it("rejects twelve digits that fail the check, and the virtual ID", () => {
    const wrong = aadhaar.slice(0, 11) + ((Number(aadhaar[11]) + 1) % 10);
    expect(parseId(`Aadhaar ${wrong}`).aadhaarLast4).toBeUndefined();
    expect(parseId(`Aadhaar VID : ${spaced} 5678`).aadhaarLast4).toBeUndefined();
  });
  it("takes nothing from a paper that is not an identity card", () => {
    expect(parseId("Electricity bill dated 01/08/2026 amount 123412341234")).toEqual({});
  });
  it("finds whose card it is, not the relative named on it", () => {
    const people = [{ name: "Sachin J Gole ( testing )" }, { name: "Swati Sachin Gole" }];
    expect(whoseCard(people, "", "PAN CARD - SWATI GOLE.pdf")).toBe(people[1]);
    expect(whoseCard(people, "Swati Gole\nW/O Sachin Gole,", "scan.pdf")).toBe(people[1]);
    expect(whoseCard(people, "", "Aadhaar.pdf")).toBeNull();
  });
});
