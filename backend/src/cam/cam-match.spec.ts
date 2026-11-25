import { Role } from "@prisma/client";
import { CamService } from "./cam.service";

const user = { id: "u1", name: "Staff", role: Role.ADMIN } as never;

function service(lead: Record<string, unknown> | null, stored: Record<string, unknown>, previewMatch = jest.fn()) {
  const prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue(lead) },
    camCase: { findUnique: jest.fn().mockResolvedValue({ data: stored, updatedAt: new Date() }) },
  };
  const svc = new CamService(prisma as never, {} as never, {} as never, { previewMatch } as never);
  return { svc, previewMatch };
}

const base = { id: "l1", leadNo: 1, name: "Asha", phone: "9999999999", email: null, city: "Pune", amount: 3000000, loanProductId: "p1", loanProduct: { id: "p1", slug: "home-loan", name: "Home Loan" } };
const result = (lenderName: string, status: string, score: number | null) => ({ policyId: lenderName, lenderId: lenderName, lenderName, status, score, reasons: [{ code: "x", ok: true, text: "ok" }], checks: [], policyNeedsReview: false });

describe("CAM lender match for the screen", () => {
  it("explains when the lead has no loan type, without matching", async () => {
    const { svc, previewMatch } = service({ ...base, loanProductId: null, loanProduct: null }, {});
    const r = await svc.matchForScreen("l1", user);
    expect(r.results).toEqual([]);
    expect(r.note).toMatch(/loan type/i);
    expect(previewMatch).not.toHaveBeenCalled();
  });

  it("explains when the amount is unknown", async () => {
    const { svc } = service({ ...base, amount: null }, {});
    expect((await svc.matchForScreen("l1", user)).note).toMatch(/amount/i);
  });

  it("sends the CAM's figures to the matcher and lists best fit first", async () => {
    const preview = jest.fn().mockResolvedValue([result("B", "POSSIBLE", 60), result("C", "EXCLUDED", null), result("A", "STRONG", 90)]);
    const { svc } = service(base, { income: { profile: "Salaried", netMonthly: 80000 } }, preview);
    const r = await svc.matchForScreen("l1", user);
    expect(r.results.map((x) => x.lender)).toEqual(["A", "B", "C"]);
    expect(preview).toHaveBeenCalledWith("p1", expect.objectContaining({ amount: 3000000, employmentType: "SALARIED", monthlyIncome: 80000, city: "Pune" }));
    expect(r.productName).toBe("Home Loan");
  });

  it("says so when no rules are recorded for the loan type", async () => {
    const { svc } = service(base, {}, jest.fn().mockResolvedValue([]));
    expect((await svc.matchForScreen("l1", user)).note).toMatch(/No lender rules/);
  });

  it("refuses a lead the caller cannot see", async () => {
    const { svc } = service(null, {});
    await expect(svc.matchForScreen("nope", user)).rejects.toThrow("Lead not found");
  });
});
