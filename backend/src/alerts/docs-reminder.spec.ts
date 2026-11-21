import { DocsReminderService } from "./docs-reminder.service";

// 11 am India time is 05:30 UTC; 9 pm India time is 15:30 UTC.
const MORNING = new Date("2026-11-21T05:30:00Z");
const NIGHT = new Date("2026-11-21T15:30:00Z");
const days = (n: number) => new Date(MORNING.getTime() - n * 86_400_000);

function setup(over: { marker?: Date } = {}) {
  const emitted: unknown[] = [];
  const upserts: unknown[] = [];
  const prisma = {
    lead: { findMany: async () => [{ id: "l1", updatedAt: days(5) }] },
    leadAnswer: { findUnique: async () => (over.marker ? { value: over.marker.toISOString() } : null), upsert: async (a: unknown) => { upserts.push(a); return a; } },
  };
  const events = { emit: (n: string, p: unknown) => emitted.push({ n, p }) };
  return { svc: new DocsReminderService(prisma as never, events as never), emitted, upserts };
}

describe("the reminder about a lead stuck waiting for documents", () => {
  it("raises a follow-up for a stalled lead and notes it", async () => {
    const { svc, emitted, upserts } = setup();
    expect(await svc.tick(MORNING)).toBe(1);
    expect(emitted).toEqual([{ n: "FOLLOW_UP_NEEDED", p: expect.objectContaining({ leadId: "l1", why: "documents-pending" }) }]);
    expect(upserts).toHaveLength(1);
  });
  it("stays quiet at night", async () => {
    const { svc, emitted } = setup();
    expect(await svc.tick(NIGHT)).toBe(0);
    expect(emitted).toHaveLength(0);
  });
  it("does not remind again within three days, but does after", async () => {
    expect(await setup({ marker: days(1) }).svc.tick(MORNING)).toBe(0);
    expect(await setup({ marker: days(4) }).svc.tick(MORNING)).toBe(1);
  });
});
