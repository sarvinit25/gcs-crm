import { LeadsService } from "./leads.service";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const admin = { id: "u1", role: "ADMIN" } as never;

function build(found = true) {
  const prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue(found ? { id: "L1", name: "Asha" } : null) },
    leadFile: {
      create: jest.fn().mockResolvedValue({ id: "F1", fileName: "slip.pdf" }),
      findFirst: jest.fn().mockResolvedValue(found ? { id: "F1", fileName: "slip.pdf", objectKey: "leads/L1/x.pdf", lead: { name: "Asha" } } : null),
      delete: jest.fn(),
    },
  };
  const storage = { put: jest.fn(), remove: jest.fn() };
  const audit = { record: jest.fn() };
  const settings = { get: jest.fn().mockReturnValue(15) };
  const service = new LeadsService(prisma as never, audit as never, settings as never, {} as never, {} as never, {} as never, {} as never, storage as never);
  jest.spyOn(service as never, "scopeFor").mockReturnValue({} as never);
  return { service, prisma, storage, audit };
}

describe("documents uploaded to a lead by the team", () => {
  it("keeps a real PDF privately and lists it", async () => {
    const { service, storage, prisma } = build();
    await service.uploadFile("L1", { originalname: "slip.pdf", size: PDF.length, buffer: PDF }, " Salary slip ", admin);
    expect(storage.put.mock.calls[0][0]).toMatch(/^leads\/L1\/[0-9a-f-]+\.pdf$/);
    expect(prisma.leadFile.create.mock.calls[0][0].data).toMatchObject({ leadId: "L1", source: "staff", caption: "Salary slip", mimeType: "application/pdf" });
  });
  it("refuses a file that is not a PDF or image, whatever its name says", async () => {
    const { service, storage } = build();
    await expect(service.uploadFile("L1", { originalname: "a.pdf", size: 40, buffer: Buffer.from("MZ not a pdf, an exe in disguise....") }, undefined, admin)).rejects.toThrow(/Only PDF/);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("refuses an oversized file and a missing one", async () => {
    const { service } = build();
    await expect(service.uploadFile("L1", { originalname: "big.pdf", size: 16 * 1024 * 1024, buffer: PDF }, undefined, admin)).rejects.toThrow(/larger than 15MB/);
    await expect(service.uploadFile("L1", undefined, undefined, admin)).rejects.toThrow(/Choose a file/);
  });
  it("does not let anyone upload to a lead they cannot see", async () => {
    const { service, storage } = build(false);
    await expect(service.uploadFile("L1", { originalname: "a.pdf", size: PDF.length, buffer: PDF }, undefined, admin)).rejects.toThrow(/not found/i);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("deletes the row first, then the stored file", async () => {
    const { service, prisma, storage } = build();
    await service.removeFile("L1", "F1", admin);
    expect(prisma.leadFile.delete).toHaveBeenCalledWith({ where: { id: "F1" } });
    expect(storage.remove).toHaveBeenCalledWith("leads/L1/x.pdf");
  });
});
