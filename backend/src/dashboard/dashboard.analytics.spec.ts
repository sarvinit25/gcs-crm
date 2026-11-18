import { Role } from "@prisma/client";
import { DashboardService } from "./dashboard.service";
import type { AuthUser } from "../auth/auth.decorators";

const user = (role: Role): AuthUser => ({ id: "u1", role, name: "Test" }) as AuthUser;

/** A stand-in database: every query the analytics makes, answering with small fixed data and remembering what was asked. */
function fakePrisma() {
  const asked: Record<string, unknown[]> = {};
  const ask = (name: string, result: unknown) =>
    jest.fn((args: unknown) => {
      (asked[name] ??= []).push(args);
      return Promise.resolve(result);
    });
  const prisma = {
    lead: {
      groupBy: jest.fn((args: { by: string[]; where?: { status?: string } }) => {
        (asked["lead.groupBy:" + args.by[0]] ??= []).push(args);
        if (args.by[0] === "source") return Promise.resolve([{ source: "website", _count: { _all: 6 } }, { source: "whatsapp", _count: { _all: 2 } }]);
        if (args.by[0] === "segment") return Promise.resolve([{ segment: "HOT", _count: { _all: 3 } }, { segment: null, _count: { _all: 1 } }]);
        if (args.where?.status === "CONVERTED") return Promise.resolve([{ assignedOfficerId: "a", _count: { _all: 1 } }]);
        return Promise.resolve([{ assignedOfficerId: "a", _count: { _all: 4 } }, { assignedOfficerId: "b", _count: { _all: 2 } }]);
      }),
      count: ask("lead.count", 5),
      findMany: ask("lead.findMany", [{ createdAt: new Date(), status: "NEW" }]),
    },
    user: { findMany: ask("user.findMany", [{ id: "a", name: "Asha", role: "ADVISOR" }, { id: "b", name: "Bala", role: "ADVISOR" }]) },
    application: { groupBy: ask("application.groupBy", [{ ownerId: "a", _count: { _all: 2 } }]) },
    followUp: { groupBy: ask("followUp.groupBy", [{ userId: "b", _count: { _all: 7 } }]) },
    disbursement: { findMany: ask("disbursement.findMany", [{ amount: "250000", application: { ownerId: "a" } }, { amount: 50000, application: { ownerId: "a" } }]) },
    websiteSubmission: {
      groupBy: ask("websiteSubmission.groupBy", [{ form: "contact-form", _count: { _all: 5 } }, { form: "ca-legal-enquiry", _count: { _all: 3 } }]),
      count: ask("websiteSubmission.count", 6),
    },
    whatsAppConversation: { count: ask("wa.count", 2), aggregate: ask("wa.aggregate", { _sum: { unreadCount: 9 } }) },
    whatsAppMessage: { count: jest.fn((a: { where: { direction: string } }) => Promise.resolve(a.where.direction === "IN" ? 40 : 25)) },
    voiceCall: {
      count: jest.fn((a: { where: { outcome?: string } }) => Promise.resolve(a.where.outcome ? 8 : 12)),
      aggregate: ask("voice.aggregate", { _avg: { durationSec: 93.6 } }),
    },
  };
  return { svc: new DashboardService(prisma as never), asked };
}

describe("dashboard analytics", () => {
  it("gives an advisor only their own leads, and no team or channel figures", async () => {
    const { svc, asked } = fakePrisma();
    const out = await svc.analytics(user(Role.ADVISOR));
    expect(out.team).toBeNull();
    expect(out.channels).toBeNull();
    for (const call of asked["lead.groupBy:source"]!) expect((call as { where: object }).where).toMatchObject({ assignedOfficerId: "u1" });
    for (const call of asked["lead.groupBy:segment"]!) expect((call as { where: object }).where).toMatchObject({ assignedOfficerId: "u1" });
    expect(asked["user.findMany"]).toBeUndefined();
    expect(asked["websiteSubmission.groupBy"]).toBeUndefined();
    expect(out.leads.unassigned).toBe(0); // advisors are not told how many leads nobody owns
  });

  it("shapes the lead figures: sources, priority mix, six months of trend", async () => {
    const { svc } = fakePrisma();
    const { leads } = await svc.analytics(user(Role.ADVISOR));
    expect(leads.sources.map((s) => [s.label, s.count])).toEqual([["Website", 6], ["WhatsApp", 2]]);
    expect(leads.priority).toEqual({ HOT: 3, WARM: 0, FOLLOW_UP: 0, COLD: 0, NONE: 1 });
    expect(leads.trend).toHaveLength(6);
    expect(leads.trend.at(-1)!.leads).toBe(1);
    expect(leads.overdueFollowUps).toBe(5);
  });

  it("gives a manager the team table and the channel figures", async () => {
    const { svc } = fakePrisma();
    const out = await svc.analytics(user(Role.MANAGER));
    expect(out.team!.map((t) => t.name)).toEqual(["Asha", "Bala"]);
    expect(out.team![0]).toMatchObject({ leads: 4, converted: 1, conversionPct: 25, applications: 2, disbursed: 300000 });
    expect(out.team![1]).toMatchObject({ followUps: 7 });
    expect(out.leads.unassigned).toBe(5);
    expect(out.channels).toEqual({
      website: { received: 8, newLeads: 6, caLegal: 3, byForm: [{ form: "contact-form", count: 5 }, { form: "ca-legal-enquiry", count: 3 }] },
      whatsapp: { needsHuman: 2, unread: 9, received: 40, sent: 25 },
      voice: { calls: 12, leadsCreated: 8, avgSeconds: 94 },
    });
  });
});
