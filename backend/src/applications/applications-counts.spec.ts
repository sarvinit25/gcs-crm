import { Role } from "@prisma/client";
import { ApplicationsService } from "./applications.service";
import type { AuthUser } from "../auth/auth.decorators";

const user = (role: Role): AuthUser => ({ id: "u1", role }) as AuthUser;

function service(groups: { loanProductId: string; _count: { _all: number } }[]) {
  const groupBy = jest.fn().mockResolvedValue(groups);
  const prisma = {
    application: { groupBy },
    loanProduct: { findMany: jest.fn().mockResolvedValue([{ id: "a", name: "Home Loan" }, { id: "b", name: "Personal Loan" }]) },
  };
  return { svc: new ApplicationsService(prisma as never, {} as never, {} as never, {} as never), groupBy };
}

describe("files per loan type", () => {
  it("lists the biggest loan type first and totals them", async () => {
    const { svc } = service([
      { loanProductId: "a", _count: { _all: 12 } },
      { loanProductId: "b", _count: { _all: 38 } },
    ]);
    expect(await svc.countsByProduct({}, user(Role.ADMIN))).toEqual({
      total: 50,
      items: [
        { id: "b", name: "Personal Loan", count: 38 },
        { id: "a", name: "Home Loan", count: 12 },
      ],
    });
  });

  it("ignores the loan-type filter itself but keeps every other filter", async () => {
    const { svc, groupBy } = service([]);
    await svc.countsByProduct({ loanProductId: "a", status: "SANCTIONED", loggedIn: "true", archived: "false" } as never, user(Role.ADMIN));
    const where = groupBy.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("loanProductId");
    expect(where).toMatchObject({ status: "SANCTIONED", bankLoginAt: { not: null }, archivedAt: null });
  });

  it("only counts an advisor's own files", async () => {
    const { svc, groupBy } = service([]);
    await svc.countsByProduct({}, user(Role.ADVISOR));
    expect(groupBy.mock.calls[0][0].where).toMatchObject({ ownerId: "u1" });
  });
});
