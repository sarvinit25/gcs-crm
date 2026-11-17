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

  it("keeps a video and a Word file, which it used to refuse", async () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(64)]);
    expect(await build(mp4).service.save({ leadId: "L1", mediaId: "m1" })).toMatchObject({ saved: true });
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from("word/document.xml"), Buffer.alloc(64)]);
    expect(await build(docx).service.save({ leadId: "L1", mediaId: "m2", fileName: "rent-agreement.docx" })).toMatchObject({ saved: true, fileName: "rent-agreement.docx" });
  });
  it("refuses files over 16 MB", async () => {
    const { service } = build(Buffer.concat([PDF, Buffer.alloc(16 * 1024 * 1024)]));
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
