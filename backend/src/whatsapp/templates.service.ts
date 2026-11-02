import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { AuditAction, MetaTemplateStatus, NotificationRecipient, NotificationTrigger } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { ProviderError, WHATSAPP_PROVIDER, type WhatsAppProvider } from "./whatsapp.provider";
import { DEFAULT_TEMPLATES, TRIGGERS, examplesFor, metaName, templateProblem, toMetaBody } from "./templates.util";

export type TemplateInput = {
  name: string;
  trigger: NotificationTrigger;
  recipient: NotificationRecipient;
  body: string;
  active?: boolean;
};

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  /** The first start fills in the standard set; after that the table belongs to the admin. */
  async onModuleInit() {
    if ((await this.prisma.notificationTemplate.count()) === 0) await this.resetDefaults(undefined);
  }

  /** What the editor needs: every trigger, who can receive it, and the placeholders it supports. */
  meta() {
    return {
      triggers: Object.entries(TRIGGERS).map(([value, info]) => ({ value, ...info })),
      provider: { kind: this.provider.kind, requiresApproval: this.provider.requiresApproval },
    };
  }

  list() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ trigger: "asc" }, { recipient: "asc" }] });
  }

  /** The next free version of a code: rewording a template Meta has seen makes a new one, name_v2, name_v3, … */
  private async nextVersion(code: string) {
    const base = code.replace(/_v\d+$/, "");
    const current = Number(/_v(\d+)$/.exec(code)?.[1] ?? 1);
    for (let n = current + 1; ; n++) {
      const candidate = `${base}_v${n}`;
      if (!(await this.prisma.notificationTemplate.findUnique({ where: { code: candidate }, select: { id: true } }))) return candidate;
    }
  }

  private async uniqueCode(base: string, ignoreId?: string) {
    let code = base;
    for (let n = 2; await this.prisma.notificationTemplate.findFirst({ where: { code, ...(ignoreId && { NOT: { id: ignoreId } }) } }); n++) {
      code = `${base}_v${n}`;
    }
    return code;
  }

  private check(input: { trigger: NotificationTrigger; recipient: NotificationRecipient; body: string }) {
    if (!TRIGGERS[input.trigger].recipients.includes(input.recipient)) {
      throw new BadRequestException(`"${TRIGGERS[input.trigger].label}" can't be sent to ${input.recipient.toLowerCase()}s`);
    }
    const problem = templateProblem(input.body, input.trigger);
    if (problem) throw new BadRequestException(problem);
  }

  async create(input: TemplateInput, user: AuthUser, ip?: string) {
    this.check(input);
    const taken = await this.prisma.notificationTemplate.findUnique({
      where: { trigger_recipient: { trigger: input.trigger, recipient: input.recipient } },
    });
    if (taken) {
      throw new ConflictException(`There is already a template for "${TRIGGERS[input.trigger].label}" to ${input.recipient.toLowerCase()}s — edit that one`);
    }
    const name = input.name.trim();
    const created = await this.prisma.notificationTemplate.create({
      data: {
        name,
        trigger: input.trigger,
        recipient: input.recipient,
        body: input.body.trim(),
        active: input.active ?? true,
        code: await this.uniqueCode(`${metaName(name) || "template"}_wa`),
        // A sandbox has no review step to wait for.
        metaStatus: this.provider.requiresApproval ? MetaTemplateStatus.NOT_SUBMITTED : MetaTemplateStatus.APPROVED,
      },
    });
    await this.audit.record({ actor: user, action: AuditAction.CREATE, entity: "NotificationTemplate", entityId: created.id, entityLabel: created.name, ip });
    return created;
  }

  async update(id: string, input: Partial<Pick<TemplateInput, "name" | "body" | "active">>, user: AuthUser, ip?: string) {
    const current = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Template not found");

    const body = input.body?.trim() ?? current.body;
    if (input.body !== undefined) this.check({ trigger: current.trigger, recipient: current.recipient, body });
    const reworded = body !== current.body;

    // Meta reviews exact wording, so changed wording is a new template: new name, back to "not submitted".
    const resubmit = reworded && current.metaStatus !== MetaTemplateStatus.NOT_SUBMITTED && this.provider.requiresApproval;
    const code = resubmit ? await this.nextVersion(current.code) : current.code;

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        body,
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.active !== undefined && { active: input.active }),
        ...(resubmit && { code, metaStatus: MetaTemplateStatus.NOT_SUBMITTED, metaReason: null }),
      },
    });
    await this.audit.recordUpdate({
      actor: user,
      entity: "NotificationTemplate",
      entityId: id,
      entityLabel: updated.name,
      changes: {
        ...(reworded && { body: { from: current.body, to: body } }),
        ...(input.active !== undefined && input.active !== current.active && { active: { from: current.active, to: input.active } }),
      },
      ip,
    });
    return updated;
  }

  async remove(id: string, user: AuthUser, ip?: string) {
    const current = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Template not found");
    await this.prisma.notificationTemplate.delete({ where: { id } });
    await this.audit.record({ actor: user, action: AuditAction.DELETE, entity: "NotificationTemplate", entityId: id, entityLabel: current.name, ip });
    return { ok: true };
  }

  /** Sends the wording to Meta for review. */
  async submit(id: string) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("Template not found");
    if (template.metaStatus === MetaTemplateStatus.APPROVED) throw new BadRequestException("Meta has already approved this template");
    try {
      const result = await this.provider.submitTemplate({
        name: template.code,
        language: template.language,
        body: toMetaBody(template.body),
        examples: examplesFor(template.body, template.trigger),
      });
      return this.prisma.notificationTemplate.update({ where: { id }, data: { metaStatus: result.status, metaReason: result.reason ?? null } });
    } catch (err) {
      if (err instanceof ProviderError) throw new BadGatewayException(err.message);
      throw err;
    }
  }

  /** Reads the review result for every template from Meta. */
  async refresh() {
    let remote;
    try {
      remote = await this.provider.listTemplates();
    } catch (err) {
      if (err instanceof ProviderError) throw new BadGatewayException(err.message);
      throw err;
    }
    const local = await this.prisma.notificationTemplate.findMany();
    let updated = 0;
    for (const t of local) {
      const found = remote.find((r) => r.name === t.code);
      if (!found) continue;
      if (found.status !== t.metaStatus || (found.reason ?? null) !== t.metaReason) {
        await this.prisma.notificationTemplate.update({ where: { id: t.id }, data: { metaStatus: found.status, metaReason: found.reason ?? null } });
        updated++;
      }
    }
    return { checked: local.length, updated };
  }

  /** Puts the standard wording back, and adds any standard template that has gone missing. */
  async resetDefaults(user?: AuthUser, ip?: string) {
    let created = 0;
    let restored = 0;
    for (const d of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.notificationTemplate.findUnique({ where: { trigger_recipient: { trigger: d.trigger, recipient: d.recipient } } });
      if (!existing) {
        await this.prisma.notificationTemplate.create({
          data: { ...d, code: await this.uniqueCode(d.code), metaStatus: this.provider.requiresApproval ? MetaTemplateStatus.NOT_SUBMITTED : MetaTemplateStatus.APPROVED },
        });
        created++;
      } else if (existing.body !== d.body) {
        const resubmit = existing.metaStatus !== MetaTemplateStatus.NOT_SUBMITTED && this.provider.requiresApproval;
        await this.prisma.notificationTemplate.update({
          where: { id: existing.id },
          data: {
            body: d.body,
            name: d.name,
            ...(resubmit && { code: await this.nextVersion(existing.code), metaStatus: MetaTemplateStatus.NOT_SUBMITTED, metaReason: null }),
          },
        });
        restored++;
      }
    }
    if (user && (created || restored)) {
      await this.audit.recordUpdate({ actor: user, entity: "NotificationTemplate", entityId: "defaults", entityLabel: "Reset to standard templates", changes: { created: { from: 0, to: created }, restored: { from: 0, to: restored } }, ip });
    }
    return { created, restored };
  }
}
