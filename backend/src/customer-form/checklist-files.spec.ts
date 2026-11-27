import { placeDocuments, withCibilLine } from "./checklist-files";

const lines = ["PAN card", "Aadhaar card", "Address proof (passport / electricity bill / voter ID)", "Passport-size photograph"].map((label) => ({ label, category: "KYC" }));
const f = (id: string, fileName: string, checklistItem?: string) => ({ id, category: "KYC", fileName, checklistItem });

describe("placing files under checklist lines", () => {
  it("keeps the line the customer chose, whatever the file is called", () => {
    expect(placeDocuments(lines, [f("1", "IMG_01.jpg", "Aadhaar card")]).get("1")).toBe("Aadhaar card");
  });
  it("places an unmarked file by its name", () => {
    const r = placeDocuments(lines, [f("1", "PAN CARD - SWATI GOLE.pdf"), f("2", "AADHAR CARD - SACHIN GOLE.pdf"), f("3", "E Bill Aug 26.pdf"), f("4", "Photo - Sachin.pdf")]);
    expect([...r.values()]).toEqual(lines.map((l) => l.label));
  });
  it("leaves a file it cannot place unplaced", () => {
    expect(placeDocuments(lines, [f("1", "scan.pdf")]).get("1")).toBeNull();
  });
  it("uses the only line of a kind, and ignores a line chosen in another kind", () => {
    const one = [{ label: "Bank statement", category: "Bank statement" }];
    expect(placeDocuments(one, [{ id: "1", category: "Bank statement", fileName: "x.pdf", checklistItem: "PAN card" }]).get("1")).toBe("Bank statement");
  });
});

describe("the customer's own credit report", () => {
  it("is offered once, as the last line", () => {
    const items = [{ name: "PAN card", category: "KYC" }];
    const lines = withCibilLine(items);
    expect(lines.map((l) => l.category)).toEqual(["KYC", "CIBIL report"]);
    expect(withCibilLine(lines)).toHaveLength(2);
  });
});
