import { SanctionsService } from "./sanctions.service";

function build(policyPercent: number | null, role = "ADMIN") {
  const upsert = jest.fn(async (a: { create: Record<string, unknown> }) => ({ id: "S1", ...a.create }));
  const prisma = {
    application: { findFirst: jest.fn().mockResolvedValue({ id: "A1", seq: 1, createdAt: new Date(), requestedAmount: 5_000_000, status: "UNDER_REVIEW", lenderId: "LN1", loanProductId: "P1" }) },
    sanction: { findUnique: jest.fn().mockResolvedValue(null), upsert, findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "S1", financialStatus: "PENDING", application: {} }) },
    lenderPolicy: { findFirst: jest.fn().mockResolvedValue(policyPercent === null ? null : { commissionPercent: policyPercent }) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ sanction: { upsert, findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "S1", financialStatus: "PENDING", application: {} }) }, application: { update: jest.fn() } })),
  };
  const svc = new SanctionsService(prisma as never, { record: jest.fn() } as never, { get: jest.fn().mockReturnValue(10), applicationNo: jest.fn().mockReturnValue("GCS-1") } as never, { emit: jest.fn() } as never);
  jest.spyOn(svc as never, "drawnFor").mockResolvedValue(new Map() as never);
  jest.spyOn(svc as never, "decorate").mockImplementation(((s: unknown) => s) as never);
  return { svc, upsert, prisma, user: { id: "u1", role } as never };
}

describe("commission on a sanction", () => {
  it("takes the lender's recorded payout when none is typed", async () => {
    const { svc, upsert, user } = build(1.25);
    await svc.upsert("A1", { sanctionedAmount: 4_000_000 }, user);
    expect(upsert.mock.calls[0]![0].create).toMatchObject({ commissionPercent: 1.25 });
  });
  it("keeps what a person typed", async () => {
    const { svc, upsert, prisma, user } = build(1.25);
    await svc.upsert("A1", { sanctionedAmount: 4_000_000, commissionPercent: 0.9 }, user);
    expect(upsert.mock.calls[0]![0].create).toMatchObject({ commissionPercent: 0.9 });
    expect(prisma.lenderPolicy.findFirst).not.toHaveBeenCalled();
  });
  it("leaves it blank when the lender has no recorded payout", async () => {
    const { svc, upsert, user } = build(null);
    await svc.upsert("A1", { sanctionedAmount: 4_000_000 }, user);
    expect(upsert.mock.calls[0]![0].create).not.toHaveProperty("commissionPercent");
  });
  it("never sets it for an advisor, who may not see commission", async () => {
    const { svc, upsert, user } = build(1.25, "ADVISOR");
    await svc.upsert("A1", { sanctionedAmount: 4_000_000 }, user);
    expect(upsert.mock.calls[0]![0].create).not.toHaveProperty("commissionPercent");
  });
});
