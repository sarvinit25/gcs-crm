import { NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import type { AuthUser } from "../auth/auth.decorators";
import { ChecklistService, statusFor } from "./checklist.service";

const items = [
  { id: "pan", name: "PAN card", category: "KYC", description: null, sortOrder: 1 },
  { id: "aadhaar", name: "Aadhaar card", category: "KYC", description: null, sortOrder: 2 },
  { id: "cas", name: "Mutual fund statement", category: "BANK_STATEMENT", description: "CAS", sortOrder: 3 },
];

function build(opts: { application?: object | null; marks?: { documentTypeId: string; given: boolean }[]; uploaded?: string[] } = {}) {
  const application = opts.application === undefined
    ? { loanProductId: "lp1", applicants: [], documents: (opts.uploaded ?? []).map((category) => ({ category })), checklistMarks: opts.marks ?? [] }
    : opts.application;
  const prisma = {
    application: { findFirst: jest.fn().mockResolvedValue(application) },
    documentType: { findMany: jest.fn().mockResolvedValue(items) },
    applicationChecklistMark: { upsert: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new ChecklistService(prisma as never) };
}
const admin = { id: "u1", role: Role.ADMIN } as AuthUser;
const adviser = { id: "u2", role: Role.ADVISOR } as AuthUser;

describe("statusFor", () => {
  it("lets a tick count even with nothing uploaded", () => {
    expect(statusFor({ id: "pan", category: "KYC" }, new Map([["pan", true]]), new Set())).toBe("GIVEN");
  });
  it("lets an un-tick beat an uploaded file in the same category", () => {
    expect(statusFor({ id: "pan", category: "KYC" }, new Map([["pan", false]]), new Set(["KYC"]))).toBe("PENDING");
  });
  it("keeps the old guess for a line nobody has touched", () => {
    expect(statusFor({ id: "pan", category: "KYC" }, new Map(), new Set(["KYC"]))).toBe("GIVEN");
    expect(statusFor({ id: "pan", category: "KYC" }, new Map(), new Set(["OTHER"]))).toBe("PENDING");
  });
  it("treats each line on its own, not the whole category", () => {
    const marks = new Map([["pan", true]]);
    expect(statusFor({ id: "aadhaar", category: "KYC" }, marks, new Set())).toBe("PENDING");
  });
});

describe("the required-documents list", () => {
  it("counts ticked lines as received", async () => {
    const { service } = build({ marks: [{ documentTypeId: "pan", given: true }], uploaded: ["BANK_STATEMENT"] });
    const out = await service.forApplication("a1", admin);
    expect(out.items.map((i) => [i.id, i.status])).toEqual([["pan", "GIVEN"], ["aadhaar", "PENDING"], ["cas", "GIVEN"]]);
    expect(out.given).toBe(2);
    expect(out.total).toBe(3);
  });

  it("ticks a line and returns the list as it now stands", async () => {
    const { service, prisma } = build({ marks: [{ documentTypeId: "aadhaar", given: true }] });
    const out = await service.setGiven("a1", "aadhaar", true, admin);
    expect(prisma.applicationChecklistMark.upsert).toHaveBeenCalledWith({
      where: { applicationId_documentTypeId: { applicationId: "a1", documentTypeId: "aadhaar" } },
      create: { applicationId: "a1", documentTypeId: "aadhaar", given: true, markedById: "u1" },
      update: { given: true, markedById: "u1" },
    });
    expect(out.items.find((i) => i.id === "aadhaar")!.status).toBe("GIVEN");
  });

  it("refuses a line that is not on this application's list", async () => {
    const { service, prisma } = build();
    await expect(service.setGiven("a1", "not-on-the-list", true, admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.applicationChecklistMark.upsert).not.toHaveBeenCalled();
  });

  it("refuses an application that is not found, and limits an adviser to their own", async () => {
    const missing = build({ application: null });
    await expect(missing.service.setGiven("a1", "pan", true, admin)).rejects.toBeInstanceOf(NotFoundException);
    const own = build();
    await own.service.setGiven("a1", "pan", false, adviser);
    expect(own.prisma.application.findFirst.mock.calls[0][0].where).toMatchObject({ id: "a1", ownerId: "u2" });
    expect(missing.prisma.applicationChecklistMark.upsert).not.toHaveBeenCalled();
  });
});
