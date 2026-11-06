import { LeadsService } from "./leads.service";

function build(productSlug: string | null, answers: { key: string; value: string }[] = []) {
  const tx = { leadAnswer: { upsert: jest.fn(), deleteMany: jest.fn() } };
  const prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue({ id: "L1", name: "A", loanProduct: productSlug ? { slug: productSlug } : null, answers }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new LeadsService(prisma as never, audit as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  jest.spyOn(service as never, "scopeFor").mockReturnValue({} as never);
  return { service, tx, audit };
}
const admin = { id: "u1", role: "ADMIN" } as never;

describe("a lead's second form, filled in over time", () => {
  it("lists the loan's questions and what is answered already", async () => {
    const { service } = build("home-loan", [{ key: "location", value: "Bandra" }]);
    const q = await service.formQuestions("L1", admin);
    expect(q.title).toBe("Home Loan");
    expect(q.fields.length).toBeGreaterThan(5);
    expect((q.values as Record<string, string>).location).toBe("Bandra");
  });

  it("has nothing to show until a loan type is chosen", async () => {
    const { service } = build(null);
    expect((await service.formQuestions("L1", admin)).fields).toEqual([]);
    await expect(service.saveFormAnswers("L1", { location: "x" }, admin)).rejects.toThrow(/loan type/i);
  });

  it("saves some answers now, checks them, and clears a blank one", async () => {
    const { service, tx, audit } = build("home-loan", [{ key: "location", value: "Bandra" }]);
    await service.saveFormAnswers("L1", { location: "Andheri", purpose: "" }, admin);
    expect(tx.leadAnswer.upsert.mock.calls[0][0].create).toMatchObject({ leadId: "L1", label: "Location", value: "Andheri", stage: "staff" });
    expect(tx.leadAnswer.deleteMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it("refuses an amount that is not a number and saves nothing", async () => {
    const { service, tx } = build("home-loan");
    const q = await service.formQuestions("L1", admin);
    const amount = q.fields.find((f) => f.kind === "amount")!;
    await expect(service.saveFormAnswers("L1", { [amount.key]: "lots" }, admin)).rejects.toThrow();
    expect(tx.leadAnswer.upsert).not.toHaveBeenCalled();
  });
});
