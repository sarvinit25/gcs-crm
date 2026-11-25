import { InboundService } from "./inbound.service";

// The chat is handed to a person: the inbox flag always, and the team's email only the first time.
function build() {
  const update = jest.fn(async () => ({}));
  const emit = jest.fn();
  const svc = new InboundService({ whatsAppConversation: { update } } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { emit } as never);
  const flag = (c: { id: string; leadId: string | null; needsHuman: boolean }, note: string) => (svc as unknown as { flagForPerson: (c: unknown, n: string) => Promise<void> }).flagForPerson(c, note);
  return { flag, update, emit };
}

describe("handing a WhatsApp chat to a person", () => {
  it("flags the chat and tells the team, once, with what the customer wrote", async () => {
    const { flag, update, emit } = build();
    await flag({ id: "c1", leadId: "L1", needsHuman: false }, "I want to talk to\n an agent about my loan");
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { needsHuman: true } });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("FOLLOW_UP_NEEDED", { leadId: "L1", why: "whatsapp-human", note: "On WhatsApp: I want to talk to an agent about my loan" });
  });
  it("does not email again for a chat that was already waiting for a person", async () => {
    const { flag, emit } = build();
    await flag({ id: "c1", leadId: "L1", needsHuman: true }, "hello?");
    expect(emit).not.toHaveBeenCalled();
  });
  it("still flags a chat that has no lead yet, without an email that has nothing to open", async () => {
    const { flag, update, emit } = build();
    await flag({ id: "c2", leadId: null, needsHuman: false }, "help");
    expect(update).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
  it("keeps the note short", async () => {
    const { flag, emit } = build();
    await flag({ id: "c1", leadId: "L1", needsHuman: false }, "x".repeat(2000));
    expect(String((emit.mock.calls[0] as unknown[][])[1] ? ((emit.mock.calls[0] as unknown[])[1] as { note: string }).note : "").length).toBeLessThanOrEqual(320);
  });
});
