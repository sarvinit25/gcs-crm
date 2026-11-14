import { callNote, VoiceService } from "./voice.service";
import { readCall } from "./voice-payload";

const campaignStyle = {
  interaction_id: "int_123",
  status: "completed",
  duration: 94,
  from: "+91 98205 92765",
  transcript: [
    { role: "agent", text: "Namaste, Growth Capital Services." },
    { role: "user", text: "Mujhe loan chahiye." },
  ],
  final_agent_variables: { customer_name: "Ravi Kumar", city: "Pune", loan_amount: "20 lakh", loan_type: "Loan against property" },
  summary: "Wants a loan against property in Pune.",
};

describe("readCall", () => {
  it("reads the details out of a campaign-style message", () => {
    expect(readCall(campaignStyle)).toMatchObject({
      callId: "int_123",
      phone: "9820592765",
      name: "Ravi Kumar",
      city: "Pune",
      amount: 2_000_000,
      loanType: "Loan against property",
      durationSec: 94,
      connected: true,
    });
    expect(readCall(campaignStyle).transcript).toContain("user: Mujhe loan chahiye.");
  });

  it("understands lakh, crore and plain amounts", () => {
    const amount = (v: unknown) => readCall({ loan_amount: v }).amount;
    expect([amount("5 lakh"), amount("1.5 crore"), amount("7,50,000"), amount(300000)]).toEqual([500_000, 15_000_000, 750_000, 300_000]);
  });

  it("does not treat a landline or a short number as a mobile", () => {
    expect(readCall({ from: "022 6987 0988" }).phone).toBeNull();
    expect(readCall({ from: "12345" }).phone).toBeNull();
  });

  it("marks a call that never connected", () => {
    expect(readCall({ status: "no-answer", from: "9820592765", duration: 0 }).connected).toBe(false);
    expect(readCall({ status: "completed", from: "9820592765" }).connected).toBe(false);
  });

  it("prefers the top-level field over a nested one, and survives junk", () => {
    expect(readCall({ name: "Top", data: { name: "Nested" } }).name).toBe("Top");
    expect(() => readCall(null)).not.toThrow();
    expect(() => readCall("text")).not.toThrow();
  });
});

describe("callNote", () => {
  it("leads with the summary", () => {
    const note = callNote(readCall(campaignStyle), new Date("2026-11-13T10:05:00Z"));
    expect(note).toContain("2026-11-13 10:05 UTC, 94s");
    expect(note).toContain("Wants a loan against property in Pune.");
  });
});

describe("VoiceService", () => {
  function build(over: { existing?: boolean; intake?: unknown } = {}) {
    const prisma = {
      voiceCall: {
        findUnique: jest.fn().mockResolvedValue(over.existing ? { id: "x" } : null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const leads = { intake: jest.fn().mockResolvedValue(over.intake ?? { id: "L1", leadNo: 1, isNew: true }) };
    return { prisma, leads, service: new VoiceService(prisma as never, leads as never) };
  }

  it("turns a connected call into a lead tagged ai-telecaller and keeps the raw message", async () => {
    const { service, leads, prisma } = build();
    expect(await service.accept(campaignStyle)).toEqual({ outcome: "LEAD_CREATED", leadId: "L1" });
    expect(leads.intake.mock.calls[0][0]).toMatchObject({ name: "Ravi Kumar", phone: "9820592765", city: "Pune", source: "ai-telecaller", amount: 2_000_000 });
    expect(prisma.voiceCall.create.mock.calls[0][0].data).toMatchObject({ callId: "int_123", outcome: "LEAD_CREATED", leadId: "L1", payload: campaignStyle });
  });

  it("calls an existing lead updated, not created", async () => {
    const { service } = build({ intake: { id: "L9", leadNo: 9 } });
    expect((await service.accept(campaignStyle)).outcome).toBe("LEAD_UPDATED");
  });

  it("names an unnamed caller 'Phone enquiry'", async () => {
    const { service, leads } = build();
    await service.accept({ interaction_id: "a", from: "9820592765", duration: 30, summary: "Asked about rates" });
    expect(leads.intake.mock.calls[0][0].name).toBe("Phone enquiry");
  });

  it("keeps the call but makes no lead when it never connected or has no mobile number", async () => {
    const a = build();
    expect((await a.service.accept({ interaction_id: "b", status: "no-answer", from: "9820592765" })).outcome).toBe("NO_LEAD");
    const b = build();
    expect((await b.service.accept({ interaction_id: "c", duration: 40, from: "02269870988" })).outcome).toBe("NO_LEAD");
    expect(a.leads.intake).not.toHaveBeenCalled();
    expect(b.leads.intake).not.toHaveBeenCalled();
    expect(b.prisma.voiceCall.create).toHaveBeenCalled();
  });

  it("ignores a call it has already seen", async () => {
    const { service, leads, prisma } = build({ existing: true });
    expect((await service.accept(campaignStyle)).outcome).toBe("DUPLICATE");
    expect(leads.intake).not.toHaveBeenCalled();
    expect(prisma.voiceCall.create).not.toHaveBeenCalled();
  });

  it("records an error instead of losing the call when the lead cannot be made", async () => {
    const { service, leads, prisma } = build();
    leads.intake.mockRejectedValue(new Error("db down"));
    expect((await service.accept(campaignStyle)).outcome).toBe("ERROR");
    expect(prisma.voiceCall.create.mock.calls[0][0].data).toMatchObject({ outcome: "ERROR", error: "db down" });
  });
});
