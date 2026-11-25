import { answerKey, loanFor } from "./intake.engine";
import { earlierLocation, isLocationField, isReference, resolveReply } from "./intake.refs";

const SLUG = "home-loan";
const field = (key: string) => loanFor(SLUG)!.fields.find((f) => f.key === key)!;
const row = (key: string, value: string) => ({ key: answerKey(loanFor(SLUG)!.fields.find((f) => f.key === key)!.label), value });

describe("isReference", () => {
  it("hears a pointer back at an earlier answer", () => {
    for (const t of ["same", "Same.", "same as above", "Same as before!", "same city", "same place", "the same", "yes same", "same only", "as above", "as before", "ditto", "wahi", "wahi hai", "yahi", "same as mentioned", "वही", "तोच", "same ji"]) expect(isReference(t)).toBe(true);
  });
  it("does not take a real answer for one", () => {
    for (const t of ["Andheri", "Mumbai", "same bank as my salary account", "the same builder, Lodha", "Navi Mumbai near the station", "40 lakh", "", "as per policy documents provided earlier by my CA"]) expect(isReference(t)).toBe(false);
    expect(isReference(null)).toBe(false);
  });
});

describe("which questions ask for a place", () => {
  it("knows the location questions of the forms", () => {
    expect(isLocationField(field("location"))).toBe(true);
    expect(isLocationField(field("propertyArea"))).toBe(true);
    expect(isLocationField(field("netSalary"))).toBe(false);
    expect(isLocationField(field("homeLoanType"))).toBe(false);
  });
});

describe("earlierLocation", () => {
  it("takes the latest place already given for another question", () => {
    const rows = [row("location", "Andheri West"), row("propertyArea", "Thane")];
    expect(earlierLocation(SLUG, rows, "otherPropertyLocation", "Mumbai")).toBe("Thane");
    expect(earlierLocation(SLUG, rows, "propertyArea", "Mumbai")).toBe("Andheri West");
  });
  it("falls back to the lead's city, and says nothing if there is none", () => {
    expect(earlierLocation(SLUG, [], "propertyArea", "Pune")).toBe("Pune");
    expect(earlierLocation(SLUG, [], "propertyArea", null)).toBeNull();
  });
  it("skips places that were skipped or were themselves only a pointer", () => {
    const rows = [row("location", "Borivali"), row("propertyArea", "Not sure (the expert will confirm)")];
    expect(earlierLocation(SLUG, rows, "otherPropertyLocation", null)).toBe("Borivali");
    expect(earlierLocation(SLUG, [row("location", "same")], "propertyArea", "Pune")).toBe("Pune");
  });
});

describe("resolveReply", () => {
  const rows = [row("location", "Andheri West")];
  it("turns 'same' on a place question into the earlier place", () => {
    expect(resolveReply(field("propertyArea"), "same", rows, SLUG, "Mumbai")).toEqual({ value: "Andheri West" });
    expect(resolveReply(field("propertyArea"), "Same as above.", rows, SLUG, null)).toEqual({ value: "Andheri West" });
  });
  it("leaves an ordinary answer alone", () => {
    expect(resolveReply(field("propertyArea"), "Powai", rows, SLUG, "Mumbai")).toEqual({ value: "Powai" });
  });
  it("never lets 'same' through when there is nothing to point at, or the question is not about a place", () => {
    expect(resolveReply(field("propertyArea"), "same", [], SLUG, null)).toEqual({ value: null, pointedBack: true });
    const notAPlace = loanFor(SLUG)!.fields.find((f) => f.kind === "text" && !isLocationField(f));
    if (notAPlace) expect(resolveReply(notAPlace, "same", rows, SLUG, "Mumbai")).toEqual({ value: null, pointedBack: true });
  });
});
