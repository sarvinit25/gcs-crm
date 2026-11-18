import { ApplicationStatus, SanctionStatus } from "@prisma/client";
import { markSanctioned } from "./applications.service";

function tx(existing: { financialStatus: SanctionStatus; sanctionDate: Date | null } | null) {
  return {
    sanction: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe("a file marked Sanctioned gets into the Sanctions section", () => {
  it("creates an approved sanction record when there is none", async () => {
    const t = tx(null);
    await markSanctioned(t as never, "A1");
    expect(t.sanction.create).toHaveBeenCalledTimes(1);
    expect(t.sanction.create.mock.calls[0]![0].data).toMatchObject({ applicationId: "A1", financialStatus: SanctionStatus.APPROVED });
    expect(t.sanction.create.mock.calls[0]![0].data.sanctionDate).toBeInstanceOf(Date);
    expect(t.sanction.update).not.toHaveBeenCalled();
  });

  it("leaves an approved record alone, so its amounts and letter number are never overwritten", async () => {
    const t = tx({ financialStatus: SanctionStatus.APPROVED, sanctionDate: new Date("2026-10-01") });
    await markSanctioned(t as never, "A1");
    expect(t.sanction.create).not.toHaveBeenCalled();
    expect(t.sanction.update).not.toHaveBeenCalled();
  });

  it("approves a record still pending, keeping an existing sanction date", async () => {
    const date = new Date("2026-10-01");
    const t = tx({ financialStatus: SanctionStatus.PENDING, sanctionDate: date });
    await markSanctioned(t as never, "A1");
    const data = t.sanction.update.mock.calls[0]![0].data;
    expect(data.financialStatus).toBe(SanctionStatus.APPROVED);
    expect(data).not.toHaveProperty("sanctionDate");
  });

  it("sets a sanction date when approving a record that has none", async () => {
    const t = tx({ financialStatus: SanctionStatus.REJECTED, sanctionDate: null });
    await markSanctioned(t as never, "A1");
    expect(t.sanction.update.mock.calls[0]![0].data.sanctionDate).toBeInstanceOf(Date);
  });
});

describe("updating an application's status", () => {
  it("only touches sanctions when the new status is Sanctioned", async () => {
    const { ApplicationsService } = await import("./applications.service");
    const sanction = { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() };
    const txClient = { application: { update: jest.fn().mockResolvedValue({ id: "A1", seq: 5, createdAt: new Date() }) }, sanction };
    const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(txClient)) };
    const audit = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
    const settings = { applicationNo: () => "GCS-2026-0005" };
    const events = { emit: jest.fn() };
    const svc = new ApplicationsService(prisma as never, audit as never, settings as never, events as never);
    jest.spyOn(svc, "findOne").mockResolvedValue({ status: "UNDER_REVIEW" } as never);
    const user = { id: "u", role: "ADMIN", name: "T" } as never;

    await svc.update("A1", { status: ApplicationStatus.BANK_LOGIN } as never, user);
    expect(sanction.findUnique).not.toHaveBeenCalled();

    await svc.update("A1", { status: ApplicationStatus.SANCTIONED } as never, user);
    expect(sanction.create).toHaveBeenCalledTimes(1);
  });
});
