import { MediaService } from "./media.service";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function build(data: Buffer | Error) {
  const prisma = { leadFile: { create: jest.fn().mockResolvedValue({}) } };
  const storage = { put: jest.fn().mockResolvedValue(undefined) };
  const provider = { downloadMedia: jest.fn(async () => { if (data instanceof Error) throw data; return { data, mimeType: "application/pdf" }; }) };
  return { prisma, storage, provider, service: new MediaService(prisma as never, storage as never, provider as never) };
}

describe("MediaService", () => {
  it("keeps a real PDF in storage and lists it on the lead", async () => {
    const { service, storage, prisma } = build(PDF);
    const out = await service.save({ leadId: "L1", mediaId: "m1", fileName: "salary slip.pdf", caption: "March" });
    expect(out).toEqual({ saved: true, fileName: "salary slip.pdf" });
    const [key, , type] = storage.put.mock.calls[0];
    expect(key).toMatch(/^whatsapp\/L1\/[0-9a-f-]+\.pdf$/);
    expect(type).toBe("application/pdf");
    expect(prisma.leadFile.create.mock.calls[0][0].data).toMatchObject({ leadId: "L1", fileName: "salary slip.pdf", mimeType: "application/pdf", caption: "March" });
  });

  it("judges by contents, so a renamed program is refused", async () => {
    const { service, storage } = build(Buffer.from("MZ this is not a pdf at all, just an exe"));
    expect(await service.save({ leadId: "L1", mediaId: "m1", fileName: "loan.pdf" })).toEqual({ saved: false, reason: "unsupported" });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("refuses files over 15 MB", async () => {
    const { service } = build(Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]));
    expect(await service.save({ leadId: "L1", mediaId: "m1" })).toEqual({ saved: false, reason: "too_large" });
  });

  it("reports a failure instead of throwing when WhatsApp or storage is down", async () => {
    expect(await build(new Error("boom")).service.save({ leadId: "L1", mediaId: "m1" })).toEqual({ saved: false, reason: "failed" });
    const b = build(PDF);
    b.storage.put.mockRejectedValue(new Error("bucket down"));
    expect(await b.service.save({ leadId: "L1", mediaId: "m1" })).toEqual({ saved: false, reason: "failed" });
    expect(b.prisma.leadFile.create).not.toHaveBeenCalled();
  });

  it("gives a nameless file a dated name with the right extension", async () => {
    const out = await build(PDF).service.save({ leadId: "L1", mediaId: "m1" });
    expect(out.saved && out.fileName).toMatch(/^whatsapp-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
