import { ConversationsService } from "./conversations.service";

describe("a staff reply from the inbox", () => {
  it("sends the message and switches the chatbot off for that chat", async () => {
    const conversation = { id: "c1", phone: "9876543210", lastInboundAt: new Date(), name: "A", leadId: null };
    const prisma = {
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue(conversation), update: jest.fn().mockResolvedValue({}) },
    };
    const provider = { sendText: jest.fn().mockResolvedValue({ waMessageId: "w1" }) };
    const service = new ConversationsService(prisma as never, {} as never, provider as never);
    jest.spyOn(service, "recordOutbound").mockResolvedValue({ id: "m1" } as never);
    jest.spyOn(service as never, "getScoped").mockResolvedValue(conversation as never);

    await service.reply("c1", { text: "Hello, this is Sheetal" }, { id: "u1", role: "ADMIN" } as never);

    expect(provider.sendText).toHaveBeenCalledWith("919876543210", "Hello, this is Sheetal");
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { needsHuman: true } });
  });

  it("does not switch the chatbot off when the send fails", async () => {
    const conversation = { id: "c1", phone: "9876543210", lastInboundAt: new Date(Date.now() - 48 * 3600_000), name: null, leadId: null };
    const prisma = { whatsAppConversation: { update: jest.fn() } };
    const service = new ConversationsService(prisma as never, {} as never, {} as never);
    jest.spyOn(service as never, "getScoped").mockResolvedValue(conversation as never);
    await expect(service.reply("c1", { text: "late" }, { id: "u1", role: "ADMIN" } as never)).rejects.toThrow(/24 hours/);
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });
});
