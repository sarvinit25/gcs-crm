import { ServiceUnavailableException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AssistantService } from "./assistant.service";
import { redact } from "./redact";

describe("redact", () => {
  it("drops identity numbers and bank details at any depth, keeps the rest", () => {
    const out = redact({ name: "Asha", pan: "ABCDE1234F", applicants: [{ name: "Ravi", aadhaarNumber: "1", accountNumber: "123", city: "Pune" }], ifsc: "X" }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/ABCDE|aadhaar|123|ifsc/i);
    expect(out["name"]).toBe("Asha");
    expect((out["applicants"] as { city: string }[])[0]!.city).toBe("Pune");
  });

  it("shortens long lists and long text", () => {
    const out = redact({ rows: Array.from({ length: 50 }, (_, i) => i), note: "x".repeat(1000) }) as { rows: number[]; note: string };
    expect(out.rows).toHaveLength(12);
    expect(out.note.length).toBeLessThan(500);
  });

  it("turns decimals and dates into plain values", () => {
    const out = redact({ amount: { toNumber: () => 2500000 }, at: new Date("2026-11-02T00:00:00Z") }) as Record<string, unknown>;
    expect(out["amount"]).toBe(2500000);
    expect(out["at"]).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("AssistantService", () => {
  const user = { id: "u1", email: "a@b.in", role: Role.ADVISOR, name: "Asha" };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const settings = { get: () => "Growth Capital Services" };

  const make = (key: string | undefined, prisma: unknown = {}) =>
    new AssistantService(
      { get: (k: string) => (k === "OPENAI_API_KEY" ? key : undefined) } as never,
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      settings as never,
    );

  afterEach(() => jest.restoreAllMocks());

  it("says it is not set up when there is no key", async () => {
    await expect(make(undefined).ask([{ role: "user", content: "hi" }], user)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("answers after looking something up, scoped to an advisor's own files", async () => {
    const groupBy = jest.fn().mockResolvedValue([{ status: "NEW", _count: 3 }]);
    const count = jest.fn().mockResolvedValue(2);
    const prisma = { lead: { groupBy, count }, application: { groupBy: jest.fn().mockResolvedValue([]) } };
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "overview", arguments: "{}" } }] } }] },
      { choices: [{ message: { content: "You have 3 new leads and 2 follow-ups due." } }] },
    ];
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async () => ({ ok: true, status: 200, json: async () => replies.shift() }) as Response);

    const out = await make("sk-test", prisma).ask([{ role: "user", content: "How is my pipeline?" }], user);

    expect(out.reply).toContain("3 new leads");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0]![0].where).toMatchObject({ assignedOfficerId: "u1" });
    expect(audit.record).toHaveBeenCalled();
  });

  it("does not let a failed lookup leak anything", async () => {
    const prisma = { lead: { findFirst: jest.fn().mockResolvedValue(null) } };
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_lead", arguments: JSON.stringify({ lead_no: 9 }) } }] } }] },
      { choices: [{ message: { content: "I could not find that lead." } }] },
    ];
    const seen: string[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (_u, init) => {
      seen.push(String((init as RequestInit).body));
      return { ok: true, status: 200, json: async () => replies.shift() } as Response;
    });
    const out = await make("sk-test", prisma).ask([{ role: "user", content: "Show lead 9" }], user);
    expect(out.reply).toContain("could not find");
    expect(seen[1]).toContain("Not found.");
  });
});
