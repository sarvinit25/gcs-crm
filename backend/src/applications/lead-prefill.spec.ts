import { ApplicationsService } from "./applications.service";

const lead = { name: "Asha Rao", phone: "9000000001", email: null, city: "Thane", address: "1 Road", pincode: "400610", pan: "ABCDE1234F", dateOfBirth: new Date("1969-11-25T00:00:00Z"), employmentType: "SELF_EMPLOYED", employerName: "Acme LLP", monthlyIncome: { toNumber: () => 174_744 }, assignedOfficerId: null, application: null };

function build() {
  const create = jest.fn().mockResolvedValue({ id: "A1", seq: 1, createdAt: new Date() });
  const prisma = { lead: { findUnique: jest.fn().mockResolvedValue(lead) }, $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ application: { create }, lead: { update: jest.fn() } })) };
  const svc = new ApplicationsService(prisma as never, { record: jest.fn() } as never, { get: jest.fn().mockReturnValue(false), applicationNo: jest.fn().mockReturnValue("GCS-1") } as never, { emit: jest.fn() } as never);
  jest.spyOn(svc as never, "decorate").mockImplementation(((a: unknown) => a) as never);
  const primary = () => create.mock.calls[0][0].data.applicants.create[0];
  return { svc, primary };
}
const user = { id: "u1", role: "ADMIN" } as never;

describe("raising an application from a lead", () => {
  it("fills the applicant from the lead when only a name and contact are sent", async () => {
    const { svc, primary } = build();
    await svc.create({ leadId: "L1", loanProductId: "P", requestedAmount: 1, applicants: [{ isPrimary: true, name: "Asha Rao", phone: "9000000001", email: "staff@example.com" }] }, user);
    expect(primary()).toMatchObject({ pan: "ABCDE1234F", pincode: "400610", address: "1 Road", employerName: "Acme LLP", email: "staff@example.com", city: "Thane" });
    expect(new Date(primary().dateOfBirth)).toEqual(new Date("1969-11-25T00:00:00Z"));
  });
  it("never replaces what was typed on the application", async () => {
    const { svc, primary } = build();
    await svc.create({ leadId: "L1", loanProductId: "P", requestedAmount: 1, applicants: [{ isPrimary: true, name: "A. Rao", city: "Pune" }] }, user);
    expect(primary()).toMatchObject({ name: "A. Rao", city: "Pune" });
  });
});
