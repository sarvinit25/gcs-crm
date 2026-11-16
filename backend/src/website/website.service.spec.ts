import { NotFoundException, BadRequestException } from "@nestjs/common";
import { WebsiteService } from "./website.service";
import type { AuthUser } from "../auth/auth.decorators";

const admin = { id: "u1", role: "ADMIN", name: "Admin" } as AuthUser;

function setup(entry: { id: string; name: string; form: string; leadId: string | null } | null) {
  const prisma = {
    websiteSubmission: { findUnique: jest.fn().mockResolvedValue(entry), delete: jest.fn().mockResolvedValue({}) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const leads = { remove: jest.fn().mockResolvedValue({ ok: true }) };
  return { svc: new WebsiteService(prisma as never, audit as never, leads as never), prisma, audit, leads };
}

describe("deleting a website entry", () => {
  it("removes just the entry by default and leaves its lead alone", async () => {
    const { svc, prisma, leads, audit } = setup({ id: "s1", name: "Test", form: "contact", leadId: "L1" });
    await svc.remove("s1", false, admin);
    expect(leads.remove).not.toHaveBeenCalled();
    expect(prisma.websiteSubmission.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entity: "WebsiteSubmission", entityId: "s1" }));
  });

  it("deletes the lead first when asked, then the entry", async () => {
    const { svc, prisma, leads } = setup({ id: "s1", name: "Test", form: "contact", leadId: "L1" });
    await svc.remove("s1", true, admin, "1.2.3.4");
    expect(leads.remove).toHaveBeenCalledWith("L1", admin, "1.2.3.4");
    expect(leads.remove.mock.invocationCallOrder[0]).toBeLessThan(prisma.websiteSubmission.delete.mock.invocationCallOrder[0]);
  });

  it("deletes nothing when the lead has a loan file", async () => {
    const { svc, prisma, leads } = setup({ id: "s1", name: "Test", form: "contact", leadId: "L1" });
    leads.remove.mockRejectedValue(new BadRequestException("This lead has a loan file"));
    await expect(svc.remove("s1", true, admin)).rejects.toThrow("loan file");
    expect(prisma.websiteSubmission.delete).not.toHaveBeenCalled();
  });

  it("just removes the entry when asked for the lead but there is none", async () => {
    const { svc, prisma, leads } = setup({ id: "s1", name: "Test", form: "contact", leadId: null });
    await svc.remove("s1", true, admin);
    expect(leads.remove).not.toHaveBeenCalled();
    expect(prisma.websiteSubmission.delete).toHaveBeenCalled();
  });

  it("says so when the entry does not exist", async () => {
    const { svc } = setup(null);
    await expect(svc.remove("nope", false, admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
