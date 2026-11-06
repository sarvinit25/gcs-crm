import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  NotificationRecipient,
  Prisma,
  Role,
  WhatsAppContactKind,
  WhatsAppDirection,
  WhatsAppMessageStatus,
  WhatsAppSender,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { ProviderError, WHATSAPP_PROVIDER, type WhatsAppProvider } from "./whatsapp.provider";
import { contactKey, toWaId, windowOpen } from "./phone";
import { extractVariables, orderedValues, renderTemplate } from "./templates.util";

const PAGE = 30;
const THREAD_LIMIT = 300;

// A receipt only ever moves a message forward: a late "delivered" must not undo "read".
const RANK: Record<WhatsAppMessageStatus, number> = {
  FAILED: 0,
  RECEIVED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};

const LIST_INCLUDE = {
  lead: { select: { id: true, leadNo: true, name: true } },
  application: { select: { id: true, seq: true, createdAt: true } },
} satisfies Prisma.WhatsAppConversationInclude;

export type ReplyInput = { text?: string; templateId?: string; variables?: Record<string, string> };

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  /** Staff see the threads of their own leads and files; Admin and Manager see all. */
  scopeFor(user: AuthUser): Prisma.WhatsAppConversationWhereInput {
    return user.role === Role.ADVISOR
      ? { OR: [{ lead: { assignedOfficerId: user.id } }, { application: { ownerId: user.id } }] }
      : {};
  }

  /** The lead and file this number belongs to, if any. */
  private async linkFor(phone: string) {
    const [lead, applicant] = await Promise.all([
      this.prisma.lead.findFirst({ where: { phone, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
      this.prisma.applicant.findFirst({
        where: { phone, application: { archivedAt: null } },
        orderBy: { application: { createdAt: "desc" } },
        select: { name: true, applicationId: true },
      }),
    ]);
    return { lead, applicant };
  }

  async findOrCreate(phone: string, profileName?: string | null) {
    const existing = await this.prisma.whatsAppConversation.findUnique({ where: { phone } });
    const { lead, applicant } = await this.linkFor(phone);
    const linked = Boolean(lead || applicant);
    const name = existing?.name ?? lead?.name ?? applicant?.name ?? profileName ?? null;

    if (existing) {
      const data: Prisma.WhatsAppConversationUncheckedUpdateInput = {
        ...(!existing.leadId && lead && { leadId: lead.id }),
        ...(!existing.applicationId && applicant && { applicationId: applicant.applicationId }),
        ...(linked && existing.kind !== WhatsAppContactKind.CUSTOMER && { kind: WhatsAppContactKind.CUSTOMER }),
        ...(!existing.name && name && { name }),
      };
      return Object.keys(data).length
        ? this.prisma.whatsAppConversation.update({ where: { id: existing.id }, data })
        : existing;
    }
    return this.prisma.whatsAppConversation.create({
      data: {
        phone,
        name,
        kind: linked ? WhatsAppContactKind.CUSTOMER : WhatsAppContactKind.UNKNOWN,
        leadId: lead?.id,
        applicationId: applicant?.applicationId,
      },
    });
  }

  /** Records a message from the customer. Returns null when Meta delivers one we already have. */
  async recordInbound(input: {
    phone: string;
    name?: string | null;
    waMessageId: string;
    type: string;
    body: string | null;
    at: Date;
  }) {
    const known = await this.prisma.whatsAppMessage.findUnique({ where: { waMessageId: input.waMessageId }, select: { id: true } });
    if (known) return null;

    const conversation = await this.findOrCreate(input.phone, input.name);
    const preview = (input.body ?? `[${input.type}]`).slice(0, 120);
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: WhatsAppDirection.IN,
        sender: WhatsAppSender.CUSTOMER,
        type: input.type,
        body: input.body,
        waMessageId: input.waMessageId,
        status: WhatsAppMessageStatus.RECEIVED,
        createdAt: input.at,
      },
    });
    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        unreadCount: { increment: 1 },
        lastInboundAt: input.at,
        lastMessageAt: input.at,
        lastPreview: preview,
      },
    });
    return { conversation: updated, message };
  }

  async recordOutbound(input: {
    conversationId: string;
    sender: WhatsAppSender;
    sentById?: string;
    type: "text" | "template";
    body: string;
    templateName?: string;
    waMessageId?: string;
  }) {
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        conversationId: input.conversationId,
        direction: WhatsAppDirection.OUT,
        sender: input.sender,
        sentById: input.sentById,
        type: input.type,
        body: input.body,
        templateName: input.templateName,
        waMessageId: input.waMessageId || undefined,
        status: WhatsAppMessageStatus.SENT,
      },
    });
    await this.prisma.whatsAppConversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt, lastPreview: input.body.slice(0, 120) },
    });
    return message;
  }

  /** Delivery receipts from Meta. */
  async recordStatus(waMessageId: string, status: WhatsAppMessageStatus, error?: string) {
    const message = await this.prisma.whatsAppMessage.findUnique({ where: { waMessageId } });
    if (!message) return;
    const advances = RANK[status] > RANK[message.status];
    // A failure can still arrive after "sent"; once it has been delivered, it can't have failed.
    const failedAfterSend = status === WhatsAppMessageStatus.FAILED && message.status === WhatsAppMessageStatus.SENT;
    if (!advances && !failedAfterSend) return;
    await this.prisma.whatsAppMessage.update({ where: { waMessageId }, data: { status, error: error ?? null } });
  }

  /** The text of a template with this conversation's values in, plus what Meta needs to send it. */
  private async templateFor(templateId: string, conversation: { name: string | null; leadId: string | null }, given: Record<string, string> = {}) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.recipient !== NotificationRecipient.CUSTOMER) {
      throw new BadRequestException("Choose one of the customer templates");
    }
    if (!template.active) throw new BadRequestException("That template is switched off");
    if (this.provider.requiresApproval && template.metaStatus !== "APPROVED") {
      throw new BadRequestException("That template hasn't been approved by Meta yet, so WhatsApp won't deliver it");
    }

    const values: Record<string, string> = {
      company: this.settings.get<string>("org.name") || "Growth Capital Services",
      name: conversation.name ?? "",
      ...given,
    };
    const missing = extractVariables(template.body).filter((k) => !values[k]?.trim());
    if (missing.length) throw new BadRequestException(`Fill in: ${missing.join(", ")}`);
    return { template, values };
  }

  /** The inbox's own send: free text inside the 24-hour window, an approved template outside it. */
  async reply(conversationId: string, input: ReplyInput, user: AuthUser) {
    const message = await this.send(conversationId, input, user);
    // A person has stepped in, so the chatbot stays quiet from here until someone hands the chat back.
    await this.prisma.whatsAppConversation.update({ where: { id: conversationId }, data: { needsHuman: true } });
    return message;
  }

  private async send(conversationId: string, input: ReplyInput, user: AuthUser) {
    const conversation = await this.getScoped(conversationId, user);
    const to = toWaId(conversation.phone);

    try {
      if (input.templateId) {
        const { template, values } = await this.templateFor(input.templateId, conversation, input.variables);
        const sent = await this.provider.sendTemplate(to, template.code, template.language, orderedValues(template.body, values));
        return this.recordOutbound({
          conversationId,
          sender: WhatsAppSender.STAFF,
          sentById: user.id,
          type: "template",
          body: renderTemplate(template.body, values),
          templateName: template.code,
          waMessageId: sent.waMessageId,
        });
      }

      const text = input.text?.trim();
      if (!text) throw new BadRequestException("Type a message first");
      if (!windowOpen(conversation.lastInboundAt)) {
        throw new BadRequestException(
          "WhatsApp only allows free-form replies within 24 hours of the customer's last message. Send an approved template instead.",
        );
      }
      const sent = await this.provider.sendText(to, text);
      return this.recordOutbound({
        conversationId,
        sender: WhatsAppSender.STAFF,
        sentById: user.id,
        type: "text",
        body: text,
        waMessageId: sent.waMessageId,
      });
    } catch (err) {
      if (err instanceof ProviderError) throw new BadGatewayException(err.message);
      throw err;
    }
  }

  /** Start a thread with a number: only a template can open one the customer hasn't written to. */
  async startChat(input: { phone: string; name?: string; templateId: string; variables?: Record<string, string> }, user: AuthUser) {
    const phone = contactKey(input.phone);
    if (phone.length < 10) throw new BadRequestException("Enter a full mobile number");
    const conversation = await this.findOrCreate(phone, input.name);
    // A thread opened by someone with no claim on it would be one they can't see — refuse rather than create a ghost.
    if (user.role === Role.ADVISOR) {
      const inScope = await this.prisma.whatsAppConversation.findFirst({ where: { id: conversation.id, ...this.scopeFor(user) }, select: { id: true } });
      if (!inScope) throw new ForbiddenException("You can only message customers on your own leads and files");
    }
    const message = await this.reply(conversation.id, { templateId: input.templateId, variables: input.variables }, user);
    return { conversationId: conversation.id, message };
  }

  private async getScoped(id: string, user: AuthUser) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({ where: { id, ...this.scopeFor(user) } });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  async list(query: { search?: string; needsHuman?: boolean; page?: number }, user: AuthUser) {
    const page = query.page ?? 1;
    const search = query.search?.trim();
    const digits = search?.replace(/\D/g, "");
    const where: Prisma.WhatsAppConversationWhereInput = {
      AND: [
        this.scopeFor(user),
        ...(query.needsHuman ? [{ needsHuman: true }] : []),
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
                  { lead: { name: { contains: search, mode: "insensitive" as const } } },
                ],
              },
            ]
          : []),
      ],
    };
    const [items, total, needsHuman] = await this.prisma.$transaction([
      this.prisma.whatsAppConversation.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * PAGE,
        take: PAGE,
      }),
      this.prisma.whatsAppConversation.count({ where }),
      this.prisma.whatsAppConversation.count({ where: { AND: [this.scopeFor(user), { needsHuman: true }] } }),
    ]);
    return {
      items: items.map((c) => ({
        ...c,
        windowOpen: windowOpen(c.lastInboundAt),
        application: c.application && {
          id: c.application.id,
          applicationNo: this.settings.applicationNo(c.application.seq, c.application.createdAt),
        },
      })),
      total,
      page,
      pageSize: PAGE,
      needsHuman,
    };
  }

  /** Opening a thread marks it read. */
  async open(id: string, user: AuthUser) {
    await this.getScoped(id, user);
    const [conversation, messages] = await this.prisma.$transaction([
      this.prisma.whatsAppConversation.update({ where: { id }, data: { unreadCount: 0 }, include: LIST_INCLUDE }),
      this.prisma.whatsAppMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: THREAD_LIMIT }),
    ]);
    return {
      conversation: {
        ...conversation,
        windowOpen: windowOpen(conversation.lastInboundAt),
        application: conversation.application && {
          id: conversation.application.id,
          applicationNo: this.settings.applicationNo(conversation.application.seq, conversation.application.createdAt),
        },
      },
      messages,
    };
  }

  async setNeedsHuman(id: string, needsHuman: boolean, user: AuthUser) {
    await this.getScoped(id, user);
    return this.prisma.whatsAppConversation.update({ where: { id }, data: { needsHuman } });
  }

  /** Templates anyone replying from the inbox may use: active, and meant for customers. */
  customerTemplates() {
    return this.prisma.notificationTemplate.findMany({
      where: { recipient: NotificationRecipient.CUSTOMER, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, body: true, metaStatus: true, recipient: true, active: true },
    });
  }

  async unreadTotal(user: AuthUser) {
    const sum = await this.prisma.whatsAppConversation.aggregate({ where: this.scopeFor(user), _sum: { unreadCount: true } });
    return { unread: sum._sum.unreadCount ?? 0 };
  }
}
