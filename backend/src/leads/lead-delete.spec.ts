import { BadRequestException } from "@nestjs/common";
import { LeadsService } from "./leads.service";

function setup(withApplication: boolean) {
  const calls: string[] = [];
  const removed: string[] = [];
  const audit: { entityLabel?: string }[] = [];
  const lead = {
    id: "l1", leadNo: 28, name: "Test Customer",
    answers: [{}, {}], followUps: [],
    application: withApplication ? { id: "a1", status: "SANCTIONED", applicationNo: "GCS-2026-0009", seq: 9, createdAt: new Date() } : null,
  };
  const svc = Object.create(LeadsService.prototype) as LeadsService & Record<string, unknown>;
  Object.assign(svc, {
    findOne: async () => lead,
    prisma: {
      leadFile: { findMany: async () => [{ objectKey: "lead-file-1" }], count: async () => 1 },
      document: { findMany: async () => [{ objectKey: "doc-1" }, { objectKey: "doc-2" }], count: async () => 2 },
      disbursement: { count: async () => 1 },
      commission: { count: async () => 1 },
      applicant: { count: async () => 1 },
      sanction: { count: async () => 1 },
      voiceCall: { updateMany: (a: unknown) => { calls.push("voiceCall.updateMany"); return a; } },
      application: { delete: (a: unknown) => { calls.push("application.delete"); return a; } },
      lead: { delete: (a: unknown) => { calls.push("lead.delete"); return a; } },
      $transaction: async (ops: unknown[]) => ops,
    },
    storage: { remove: async (k: string) => { removed.push(k); } },
    audit: { record: async (a: { entityLabel?: string }) => { audit.push(a); } },
    settings: { applicationNo: () => "GCS-2026-0009" },
  });
  return { svc, calls, removed, audit };
}
const admin = { id: "u", role: "ADMIN" } as never;

describe("deleting a lead", () => {
  it("deletes a lead that has no loan file, and its uploaded files", async () => {
    const { svc, calls, removed } = setup(false);
    await svc.remove("l1", admin, "1.1.1.1");
    expect(calls).toEqual(["voiceCall.updateMany", "lead.delete"]);
    expect(removed).toEqual(["lead-file-1"]);
  });

  it("refuses a lead with a loan file until the person confirms the file goes too, and deletes nothing", async () => {
    const { svc, calls } = setup(true);
    await expect(svc.remove("l1", admin)).rejects.toThrow(BadRequestException);
    await expect(svc.remove("l1", admin)).rejects.toThrow(/GCS-2026-0009/);
    expect(calls).toEqual([]);
  });

  it("with the confirmation, deletes the loan file first, then the lead, and clears every stored file", async () => {
    const { svc, calls, removed, audit } = setup(true);
    await svc.remove("l1", admin, "1.1.1.1", true);
    expect(calls).toEqual(["voiceCall.updateMany", "application.delete", "lead.delete"]);
    expect(removed.sort()).toEqual(["doc-1", "doc-2", "lead-file-1"]);
    expect(audit[0]!.entityLabel).toMatch(/loan file GCS-2026-0009 \(2 documents, 1 disbursements, 1 commissions\)/);
  });

  it("tells the person what a delete would take with it", async () => {
    const { svc } = setup(true);
    const p = await svc.deletePreview("l1", admin);
    expect(p.application).toMatchObject({ applicationNo: "GCS-2026-0009", documents: 2, disbursements: 1, commissions: 1, sanction: true });
    expect(setup(false).svc.deletePreview("l1", admin)).resolves.toMatchObject({ application: null });
  });
});
