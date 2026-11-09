import { LenderOffersService } from "./lender-offers.service";
import type { Extraction } from "./offer-extraction";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const actor = { id: "u1", name: "Mahesh", email: "m@x.in", role: "ADMIN" } as never;

const manba: Extraction = {
  kind: "LENDER_OFFER", summary: "Manba", lenderName: "Manba Finance", lenderType: "NBFC", website: null, address: null, city: null, contacts: [], validTill: null,
  offers: [{ scheme: "Micro LAP", productSlug: "micro-lap", minAmount: 1_000_000, maxAmount: 2_000_000, minRate: 19, maxRate: 20, minTenureMonths: 12, maxTenureMonths: 120, rateType: null, processingFee: null, employmentTypes: [], gstRequired: false, minCreditScore: null, allIndia: null, cities: [], ltv: null, documents: [], charges: null, turnaround: null, notes: null }],
};

function build(opts: { repeat?: string | null; autoAdd?: boolean; lenders?: { id: string; name: string }[] } = {}) {
  const prisma = {
    loanProduct: { findMany: jest.fn().mockResolvedValue([{ id: "P1", slug: "micro-lap", name: "Micro Loan Against Property" }]) },
    lenderOffer: {
      findFirst: jest.fn().mockResolvedValue(opts.repeat ? { id: opts.repeat } : null),
      create: jest.fn().mockResolvedValue({ id: "NEW" }),
      findUnique: jest.fn().mockResolvedValue({ extracted: manba }),
    },
    lender: { findMany: jest.fn().mockResolvedValue(opts.lenders ?? []) },
  };
  const reader = { read: jest.fn().mockResolvedValue(manba) };
  const storage = { put: jest.fn() };
  const audit = { record: jest.fn() };
  const settings = { get: jest.fn().mockReturnValue(opts.autoAdd ?? true) };
  const service = new LenderOffersService(prisma as never, reader as never, storage as never, {} as never, audit as never, settings as never);
  jest.spyOn(service, "get").mockImplementation(async (id: string) => ({ id }) as never);
  const apply = jest.spyOn(service, "apply").mockResolvedValue({} as never);
  return { service, prisma, reader, apply };
}

describe("the same thing put in twice", () => {
  it("is recognised: not read again, not saved again, and the earlier reading is returned", async () => {
    const { service, reader, prisma } = build({ repeat: "OLD" });
    const out = await service.create([{ originalname: "manba.pdf", size: PDF.length, buffer: PDF }], undefined, actor);
    expect(out).toEqual([{ id: "OLD", duplicate: true }]);
    expect(reader.read).not.toHaveBeenCalled();
    expect(prisma.lenderOffer.create).not.toHaveBeenCalled();
  });

  it("is recognised for pasted text too, whatever the spacing", async () => {
    const { service, reader, prisma } = build({ repeat: "OLD" });
    const out = await service.create([], "  Manba   Finance  micro LAP ", actor);
    expect(out[0]).toMatchObject({ id: "OLD", duplicate: true });
    expect(reader.read).not.toHaveBeenCalled();
    expect(prisma.lenderOffer.create).not.toHaveBeenCalled();
  });

  it("is read and saved when it is new, with its fingerprint kept", async () => {
    const { service, reader, prisma } = build();
    const out = await service.create([], "A brand new message about Manba", actor);
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(prisma.lenderOffer.create.mock.calls[0]![0].data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out[0]).toMatchObject({ id: "NEW", duplicate: false });
  });
});

describe("adding a reading to the lender automatically", () => {
  it("does it when the lender is already in the CRM", async () => {
    const { service, apply } = build({ lenders: [{ id: "L1", name: "Manba Finance" }] });
    await service.create([], "Manba micro LAP flyer text", actor);
    expect(apply).toHaveBeenCalledWith("NEW", { lenderId: "L1" }, actor);
  });

  it("leaves a lender the CRM does not know for a person to review", async () => {
    const { service, apply } = build({ lenders: [{ id: "L2", name: "HDFC Bank" }] });
    await service.create([], "Manba micro LAP flyer text", actor);
    expect(apply).not.toHaveBeenCalled();
  });

  it("waits for review when the switch in Settings is off", async () => {
    const { service, apply } = build({ autoAdd: false, lenders: [{ id: "L1", name: "Manba Finance" }] });
    await service.create([], "Manba micro LAP flyer text", actor);
    expect(apply).not.toHaveBeenCalled();
  });

  it("never fails the upload if the automatic add goes wrong", async () => {
    const { service, apply } = build({ lenders: [{ id: "L1", name: "Manba Finance" }] });
    apply.mockRejectedValue(new Error("boom"));
    await expect(service.create([], "Manba micro LAP flyer text", actor)).resolves.toHaveLength(1);
  });
});
