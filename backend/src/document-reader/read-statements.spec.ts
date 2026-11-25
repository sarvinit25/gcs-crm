import { DocumentReaderService } from "./document-reader.service";

function build(camData: unknown) {
  const docs = [
    { id: "d1", fileName: "Federal.pdf", objectKey: "k1" },
    { id: "d2", fileName: "IDFC 12 months.pdf", objectKey: "k2" },
    { id: "d3", fileName: "ICICI unreadable.pdf", objectKey: "k3" },
  ];
  const prisma = {
    application: { findUnique: jest.fn().mockResolvedValue({ leadId: "L1" }) },
    document: { findMany: jest.fn().mockResolvedValue(docs) },
    documentReading: { upsert: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
    camCase: { findUnique: jest.fn().mockResolvedValue({ data: camData }) },
  };
  const storage = { get: jest.fn().mockResolvedValue(Buffer.from("x")) };
  const cam = { save: jest.fn().mockResolvedValue({}) };
  const svc = new DocumentReaderService(prisma as never, {} as never, storage as never, cam as never, {} as never);
  jest.spyOn(svc as never, "tryStatement").mockImplementation((async (_b: Buffer, name: string) => {
    const analysis = (monthsFound: number) => ({ monthsFound, from: "a", to: "b", transactions: 5, openingBalance: null, closingBalance: null, months: [], salary: { times: 0 }, emis: [], returns: { inward: 0, outward: 0 }, warnings: [] });
    if (name.startsWith("Federal")) return { analysis: analysis(2), fill: { banking: { months: [{ month: "Oct 2026" }] } } };
    if (name.startsWith("IDFC")) return { analysis: analysis(12), fill: { banking: { months: [{ month: "Jun 2026" }] } } };
    return null; // a layout the reader does not know
  }) as never);
  return { svc, prisma, cam };
}

describe("reading bank statements on our own server", () => {
  it("saves a reading for each one it can read and puts the longest into an empty CAM", async () => {
    const { svc, prisma, cam } = build({});
    const r = await svc.readStatementsOnServer("A1", { id: "u1" } as never);
    expect(r).toEqual({ read: 2, appliedToCam: true });
    expect(prisma.documentReading.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.document.findMany.mock.calls[0][0].where).toMatchObject({ category: "Bank statement", reading: null });
    expect(cam.save).toHaveBeenCalledWith("L1", { data: { banking: { months: [{ month: "Jun 2026" }] } } }, { id: "u1" });
    expect(prisma.documentReading.update.mock.calls[0][0].where).toEqual({ documentId: "d2" });
  });
  it("never overwrites bank months a person already entered", async () => {
    const { svc, cam } = build({ banking: { months: [{ month: "Oct 2026", credits: 1 }] } });
    const r = await svc.readStatementsOnServer("A1", { id: "u1" } as never);
    expect(r).toEqual({ read: 2, appliedToCam: false });
    expect(cam.save).not.toHaveBeenCalled();
  });
  it("never throws, whatever goes wrong", async () => {
    const { svc, prisma } = build({});
    prisma.document.findMany.mockRejectedValue(new Error("db down"));
    await expect(svc.readStatementsOnServer("A1", { id: "u1" } as never)).resolves.toEqual({ read: 0, appliedToCam: false });
  });
});
