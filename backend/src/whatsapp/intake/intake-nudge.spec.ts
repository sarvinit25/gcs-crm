import { WhatsAppDirection } from "@prisma/client";
import { IntakeNudgeService } from "./intake-nudge.service";

// 11:00 am India time is 05:30 UTC; 10 pm India time is 16:30 UTC.
const MORNING = new Date("2026-11-21T05:30:00Z");
const NIGHT = new Date("2026-11-21T16:30:00Z");

function setup(over: { on?: boolean; last?: WhatsAppDirection; marker?: boolean; unfinished?: boolean } = {}) {
  const sent: string[] = [];
  const created: unknown[] = [];
  const prisma = {
    whatsAppConversation: { findMany: async () => [{ id: "c1", phone: "9867797192", leadId: "l1", lastInboundAt: new Date(MORNING.getTime() - 5 * 3600_000) }] },
    whatsAppMessage: { findFirst: async () => ({ direction: over.last ?? WhatsAppDirection.OUT }) },
    leadAnswer: { findUnique: async () => (over.marker ? { id: "m" } : null), create: async (a: unknown) => { created.push(a); return a; } },
  };
  const settings = { get: (k: string) => (k === "whatsapp.aiIntake" ? true : k === "whatsapp.nudgeUnfinished" ? over.on ?? true : false) };
  const conversations = { recordOutbound: jest.fn(async () => ({})) };
  const intake = { isUnfinished: async () => ({ unfinished: over.unfinished ?? true, loan: "Balance Transfer & Top-Up", name: "Mahesh" }) };
  const provider = { sendText: jest.fn(async (_to: string, text: string) => { sent.push(text); return { waMessageId: "w1" }; }) };
  const svc = new IntakeNudgeService(prisma as never, settings as never, conversations as never, intake as never, provider as never);
  return { svc, sent, created, conversations, provider };
}

describe("the reminder to a customer who went quiet", () => {
  it("sends one polite reminder and records it", async () => {
    const { svc, sent, created, conversations } = setup();
    expect(await svc.tick(MORNING)).toBe(1);
    expect(sent[0]).toMatch(/Mahesh/);
    expect(sent[0]).toMatch(/continue/);
    expect(sent[0]).not.toMatch(/rate|approve|guarantee/i);
    expect(conversations.recordOutbound).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });
  it("is silent unless switched on", async () => {
    const { svc, provider } = setup({ on: false });
    expect(await svc.tick(MORNING)).toBe(0);
    expect(provider.sendText).not.toHaveBeenCalled();
  });
  it("never sends at night", async () => {
    const { svc, provider } = setup();
    expect(await svc.tick(NIGHT)).toBe(0);
    expect(provider.sendText).not.toHaveBeenCalled();
  });
  it("never sends twice to the same customer", async () => {
    const { svc, provider } = setup({ marker: true });
    expect(await svc.tick(MORNING)).toBe(0);
    expect(provider.sendText).not.toHaveBeenCalled();
  });
  it("does not chase someone who wrote last, or who has finished", async () => {
    expect(await setup({ last: WhatsAppDirection.IN }).svc.tick(MORNING)).toBe(0);
    expect(await setup({ unfinished: false }).svc.tick(MORNING)).toBe(0);
  });
});
