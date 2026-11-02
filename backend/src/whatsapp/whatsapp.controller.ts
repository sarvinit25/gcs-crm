import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Ip, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, Length, Min, IsInt } from "class-validator";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request, Response } from "express";
import { NotificationRecipient, NotificationStatus, NotificationTrigger, Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { ConversationsService } from "./conversations.service";
import { InboundService } from "./inbound.service";
import { TemplatesService } from "./templates.service";
import { BriefsService } from "./briefs.service";
import { ProviderError, WHATSAPP_PROVIDER, type WhatsAppProvider } from "./whatsapp.provider";
import { Inject } from "@nestjs/common";
import { TRIGGERS, examplesFor, orderedValues } from "./templates.util";
import { toWaId, contactKey } from "./phone";

// ── Meta's webhook (public; every call is signature-checked) ─────────────────

@Controller("public/whatsapp")
export class WhatsAppWebhookController {
  constructor(private inbound: InboundService) {}

  @Public()
  @SkipThrottle()
  @Get("webhook")
  verify(@Query("hub.mode") mode: string, @Query("hub.verify_token") token: string, @Query("hub.challenge") challenge: string, @Res() res: Response) {
    const answer = this.inbound.handshake(mode, token, challenge);
    if (answer === null) return res.status(403).send("Forbidden");
    return res.status(200).type("text/plain").send(answer);
  }

  @Public()
  @SkipThrottle()
  @Post("webhook")
  @HttpCode(200)
  @Header("Content-Type", "text/plain")
  receive(@Req() req: RawBodyRequest<Request>) {
    if (!this.inbound.validSignature(req.rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
      throw new ForbiddenException("Bad signature");
    }
    // Read from the signed bytes rather than a bound body: Meta's payloads nest deeper than the
    // blanket input ceiling allows for ordinary forms, and the signature already vouches for them.
    let payload: unknown;
    try {
      payload = JSON.parse(req.rawBody!.toString("utf8"));
    } catch {
      throw new BadRequestException("Not JSON");
    }
    this.inbound.accept(payload);
    return "ok";
  }
}

// ── Inbox ────────────────────────────────────────────────────────────────────

class ListQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["true", "false"]) needsHuman?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

class ReplyDto {
  @IsOptional() @IsString() @Length(1, 4000) text?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsObject() variables?: Record<string, string>;
}

class StartChatDto {
  @IsString() @Length(6, 20) phone: string;
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsString() templateId: string;
  @IsOptional() @IsObject() variables?: Record<string, string>;
}

class NeedsHumanDto {
  @IsBoolean() needsHuman: boolean;
}

@Controller("whatsapp/conversations")
export class ConversationsController {
  constructor(private conversations: ConversationsService) {}

  @Get()
  list(@Query() q: ListQuery, @CurrentUser() user: AuthUser) {
    return this.conversations.list({ search: q.search, needsHuman: q.needsHuman === "true", page: q.page }, user);
  }

  @Get("templates")
  templates() {
    return this.conversations.customerTemplates();
  }

  @Get("unread")
  unread(@CurrentUser() user: AuthUser) {
    return this.conversations.unreadTotal(user);
  }

  @Post()
  start(@Body() dto: StartChatDto, @CurrentUser() user: AuthUser) {
    return this.conversations.startChat(dto, user);
  }

  @Get(":id")
  open(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.open(id, user);
  }

  @Post(":id/messages")
  reply(@Param("id") id: string, @Body() dto: ReplyDto, @CurrentUser() user: AuthUser) {
    if (dto.text && dto.templateId) throw new BadRequestException("Send either a message or a template, not both");
    return this.conversations.reply(id, dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: NeedsHumanDto, @CurrentUser() user: AuthUser) {
    return this.conversations.setNeedsHuman(id, dto.needsHuman, user);
  }
}

// ── Templates (admin) ────────────────────────────────────────────────────────

class CreateTemplateDto {
  @IsString() @Length(2, 80) name: string;
  @IsEnum(NotificationTrigger) trigger: NotificationTrigger;
  @IsEnum(NotificationRecipient) recipient: NotificationRecipient;
  @IsString() @Length(1, 1100) body: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @Length(1, 1100) body?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller("notifications/templates")
@Roles(Role.ADMIN)
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @Get() list() {
    return this.templates.list();
  }
  @Get("meta") meta() {
    return this.templates.meta();
  }
  @Post("refresh") refresh() {
    return this.templates.refresh();
  }
  @Post("reset-defaults") reset(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.templates.resetDefaults(user, ip);
  }
  @Post() create(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.templates.create(dto, user, ip);
  }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.templates.update(id, dto, user, ip);
  }
  @Post(":id/submit") submit(@Param("id") id: string) {
    return this.templates.submit(id);
  }
  @Delete(":id") remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.templates.remove(id, user, ip);
  }
}

// ── Logs ─────────────────────────────────────────────────────────────────────

class LogsQuery {
  @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @IsOptional() @IsEnum(NotificationTrigger) trigger?: NotificationTrigger;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

@Controller("notifications/logs")
@Roles(Role.ADMIN, Role.MANAGER)
export class NotificationLogsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: LogsQuery) {
    const page = q.page ?? 1;
    const pageSize = 50;
    const digits = q.search?.replace(/\D/g, "");
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.trigger && { trigger: q.trigger }),
      ...(q.search && {
        OR: [
          ...(digits && digits.length >= 3 ? [{ toPhone: { contains: digits } }] : []),
          { toName: { contains: q.search, mode: "insensitive" as const } },
        ],
      }),
    };
    const [items, total, grouped] = await Promise.all([
      this.prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.groupBy({ by: ["status"], where, orderBy: { status: "asc" }, _count: { _all: true } }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      counts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
    };
  }
}

// ── Setup (admin) ────────────────────────────────────────────────────────────

class TestDto {
  @IsString() @Length(6, 20) to: string;
  @IsString() templateId: string;
}

class BriefDto {
  @IsIn(["morning", "evening"]) kind: "morning" | "evening";
}

@Controller("whatsapp/setup")
@Roles(Role.ADMIN)
export class WhatsAppSetupController {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private briefs: BriefsService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  @Get("status")
  async status() {
    const [connection, templates] = await Promise.all([
      this.provider.connection(),
      this.prisma.notificationTemplate.groupBy({ by: ["metaStatus"], orderBy: { metaStatus: "asc" }, _count: { _all: true } }),
    ]);
    const has = (key: string) => Boolean(process.env[key]?.trim());
    return {
      connection,
      // What is set on the server, never the values themselves.
      credentials: {
        accessToken: has("WHATSAPP_ACCESS_TOKEN"),
        phoneNumberId: has("WHATSAPP_PHONE_NUMBER_ID"),
        wabaId: has("WHATSAPP_WABA_ID"),
        appSecret: has("WHATSAPP_APP_SECRET"),
        verifyToken: has("WHATSAPP_VERIFY_TOKEN"),
      },
      webhookPath: "/crm/api/public/whatsapp/webhook",
      templates: Object.fromEntries(templates.map((t) => [t.metaStatus, t._count._all])),
      requiresApproval: this.provider.requiresApproval,
    };
  }

  /** Sends one template to a number, to prove the connection works end to end. */
  @Post("test")
  async test(@Body() dto: TestDto) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template) throw new BadRequestException("Choose a template");
    if (this.provider.requiresApproval && template.metaStatus !== "APPROVED") {
      throw new BadRequestException("That template hasn't been approved by Meta yet, so WhatsApp won't deliver it");
    }
    const info = TRIGGERS[template.trigger];
    const values = Object.fromEntries(info.variables.map((v) => [v.key, v.example]));
    values.company = this.settings.get<string>("org.name") || values.company;
    try {
      await this.provider.sendTemplate(toWaId(contactKey(dto.to)), template.code, template.language, orderedValues(template.body, values));
    } catch (err) {
      if (err instanceof ProviderError) throw new BadRequestException(err.message);
      throw err;
    }
    return { sent: true, examples: examplesFor(template.body, template.trigger) };
  }

  @Post("briefs")
  sendBrief(@Body() dto: BriefDto) {
    return this.briefs.sendNow(dto.kind);
  }
}
