import { Role } from "@prisma/client";
import { LeadsService } from "./leads.service";
import type { AuthUser } from "../auth/auth.decorators";

const user = (role: Role): AuthUser => ({ id: "u1", role, name: "Test" }) as AuthUser;
const dec = (n: number) => ({ toNumber: () => n });
const day = (n: number) => new Date(Date.UTC(2026, 10, n));

function setup() {
  const findMany = jest.fn();
  const lead = (id: string, over: Record<string, unknown> = {}) => ({
    id, leadNo: Number(id.slice(1)), name: `Lead ${id}`, phone: "9800000000", status: "CONVERTED", amount: dec(500000), lostReason: null,
    createdAt: day(1), archivedAt: day(11), followUps: [{ createdAt: day(9) }], _count: { followUps: 3 }, application: null, ...over,
  });
  const page = [lead("L1", { application: { id: "A1", seq: 9, createdAt: day(2) } }), lead("L2", { status: "LOST", lostReason: "Not interested", amount: dec(200000), archivedAt: day(21) })];
  const all = [
    { status: "CONVERTED", amount: dec(500000), createdAt: day(1), archivedAt: day(11), lostReason: null },
    { status: "LOST", amount: dec(200000), createdAt: day(1), archivedAt: day(21), lostReason: "Not interested" },
    { status: "LOST", amount: null, createdAt: day(1), archivedAt: day(1), lostReason: null },
  ];
  findMany.mockImplementation((args: { select?: unknown }) => Promise.resolve(args.select ? all : page));
  const prisma = {
    lead: { findMany, count: jest.fn().mockResolvedValue(2) },
    auditLog: { findMany: jest.fn().mockResolvedValue([{ entityId: "L1", actorName: "Asha", createdAt: day(11) }]) },
  };
  const settings = { applicationNo: (seq: number) => `GCS-2026-${String(seq).padStart(4, "0")}` };
  const svc = new LeadsService(prisma as never, {} as never, settings as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, prisma, findMany };
}

describe("archived leads section", () => {
  it("shows each archived lead with its dates, days, who archived it and the application it became", async () => {
    const { svc } = setup();
    const out = await svc.archiveView({}, user(Role.ADMIN));
    expect(out.total).toBe(2);
    expect(out.items[0]).toMatchObject({ leadNo: 1, daysInPipeline: 10, archivedByName: "Asha", contactCount: 3, application: { id: "A1", applicationNo: "GCS-2026-0009" } });
    expect(out.items[1]).toMatchObject({ leadNo: 2, daysInPipeline: 20, archivedByName: null, application: null, lostReason: "Not interested" });
  });

  it("summarises every archived lead, not just the page shown", async () => {
    const { svc } = setup();
    const { summary } = await svc.archiveView({ pageSize: 1 }, user(Role.MANAGER));
    expect(summary).toMatchObject({ total: 3, converted: 1, lost: 2, convertedAmount: 500000, lostAmount: 200000, averageDays: 10 });
    expect(summary.lostReasons).toEqual([{ reason: "No reason recorded", count: 1 }, { reason: "Not interested", count: 1 }]);
  });

  it("only looks at archived leads, newest archive first, and gives an advisor only their own", async () => {
    const { svc, findMany } = setup();
    await svc.archiveView({ status: "LOST", search: "asha" }, user(Role.ADVISOR));
    const pageCall = findMany.mock.calls.find((c) => !c[0].select)![0];
    expect(pageCall.where).toMatchObject({ archivedAt: { not: null }, assignedOfficerId: "u1", status: "LOST" });
    expect(pageCall.orderBy[0]).toEqual({ archivedAt: "desc" });
    const summaryCall = findMany.mock.calls.find((c) => c[0].select)![0];
    expect(summaryCall.where).toEqual({ assignedOfficerId: "u1", archivedAt: { not: null } });
  });

  it("looks up who archived only for the leads on the page", async () => {
    const { svc, prisma } = setup();
    await svc.archiveView({}, user(Role.ADMIN));
    expect(prisma.auditLog.findMany.mock.calls[0]![0].where).toMatchObject({ entity: "Lead", entityId: { in: ["L1", "L2"] } });
  });
});
