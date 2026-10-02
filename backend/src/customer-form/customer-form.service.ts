import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, AuditAction, AuditActorType, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { DocumentsService } from "../documents/documents.service";
import { StorageService } from "../documents/storage.service";
import { ChecklistService, resolveChecklistBucket } from "../checklist/checklist.service";
import { decryptSecret, encryptSecret } from "../security/secret-box";
import type { AuthUser } from "../auth/auth.decorators";
import { istToday } from "../common/date.util";
import { generateFormToken, hashFormToken, looksLikeFormToken } from "./form-token";
import { completeReferences, formProblems, mergeForm, type FormData } from "./form-rules";
import type { SaveFormDto } from "./dto/customer-form.dto";

const PHONE = /^[6-9]\d{9}$/;
const DAY_MS = 86_400_000;

type InviteState = "open" | "submitted" | "expired" | "closed";

const APPLICATION_FOR_FORM = {
  id: true,
  seq: true,
  createdAt: true,
  status: true,
  archivedAt: true,
  loanProductId: true,
  requestedAmount: true,
  tenureMonths: true,
  purpose: true,
  loanProduct: { select: { name: true, slug: true } },
  applicants: { where: { isPrimary: true }, take: 1 },
  references: true,
} satisfies Prisma.ApplicationSelect;

type FormApplication = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_FOR_FORM }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** What the records already hold, in the shape of the form — so the customer never retypes what staff entered. */
function formFromRecords(app: FormApplication): FormData {
  const a = app.applicants[0];
  return {
    name: a?.name ?? null,
    email: a?.email ?? null,
    dateOfBirth: day(a?.dateOfBirth ?? null),
    pan: a?.pan ?? null,
    aadhaarLast4: a?.aadhaarLast4 ?? null,
    address: a?.address ?? null,
    city: a?.city ?? null,
    pincode: a?.pincode ?? null,
    employmentType: a?.employmentType ?? null,
    constitution: a?.constitution ?? null,
    isNRI: a?.isNRI ?? false,
    employerName: a?.employerName ?? null,
    monthlyIncome: a?.monthlyIncome ? Number(a.monthlyIncome) : null,
    requestedAmount: Number(app.requestedAmount),
    tenureMonths: app.tenureMonths,
    purpose: app.purpose,
    references: app.references.map((r) => ({ name: r.name, phone: r.phone, relation: r.relation, address: r.address })),
  };
}

@Injectable()
export class CustomerFormService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private documents: DocumentsService,
    private storage: StorageService,
    private checklist: ChecklistService,
  ) {}

  private appNo(a: { seq: number; createdAt: Date }) {
    return this.settings.applicationNo(a.seq, a.createdAt);
  }

  private company() {
    return {
      name: this.settings.get<string>("org.name"),
      phone: this.settings.get<string>("org.phone"),
      email: this.settings.get<string>("org.email"),
    };
  }

  // ── staff side ────────────────────────────────────────────

  private async applicationFor(applicationId: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, ...(user.role === Role.ADVISOR ? { ownerId: user.id } : {}) },
      select: APPLICATION_FOR_FORM,
    });
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  private stateOf(invite: { expiresAt: Date; revokedAt: Date | null; submittedAt: Date | null }, app: { status: ApplicationStatus; archivedAt: Date | null }, now = new Date()): InviteState | "revoked" {
    if (invite.revokedAt) return "revoked";
    if (invite.submittedAt) return "submitted";
    if (app.status !== ApplicationStatus.DRAFT || app.archivedAt) return "closed";
    if (invite.expiresAt <= now) return "expired";
    return "open";
  }

  /** The latest link for this application, with its token while it can still be used. */
  async status(applicationId: string, user: AuthUser) {
    const app = await this.applicationFor(applicationId, user);
    const invite = await this.prisma.applicationInvite.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } }, _count: { select: { documents: true } } },
    });
    if (!invite) return { sent: false as const, canSend: app.status === ApplicationStatus.DRAFT && !app.archivedAt };

    const state = this.stateOf(invite, app);
    return {
      sent: true as const,
      canSend: app.status === ApplicationStatus.DRAFT && !app.archivedAt,
      state,
      token: state === "open" || state === "submitted" ? decryptSecret(invite.tokenEnc) : null,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      createdBy: invite.createdBy?.name ?? null,
      openedAt: invite.openedAt,
      lastSavedAt: invite.lastSavedAt,
      submittedAt: invite.submittedAt,
      documentsReceived: invite._count.documents,
    };
  }

  async create(applicationId: string, user: AuthUser, ip?: string) {
    const app = await this.applicationFor(applicationId, user);
    if (app.status !== ApplicationStatus.DRAFT || app.archivedAt) {
      throw new BadRequestException("The form can only be sent while the application is still a draft");
    }
    const phone = app.applicants[0]?.phone;
    if (!phone || !PHONE.test(phone)) {
      throw new BadRequestException("Add the applicant's mobile number first — the link is meant for that person");
    }

    const token = generateFormToken();
    const days = this.settings.get<number>("forms.linkValidDays");
    const now = new Date();
    await this.prisma.$transaction([
      // One live link at a time: sending a fresh one retires the old.
      this.prisma.applicationInvite.updateMany({ where: { applicationId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.applicationInvite.create({
        data: {
          applicationId,
          tokenHash: hashFormToken(token),
          tokenEnc: encryptSecret(token),
          createdById: user.id,
          expiresAt: new Date(now.getTime() + days * DAY_MS),
        },
      }),
    ]);

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Application",
      entityId: applicationId,
      entityLabel: `${this.appNo(app)} · customer form link`,
      ip,
    });
    return this.status(applicationId, user);
  }

  async revoke(applicationId: string, user: AuthUser, ip?: string) {
    const app = await this.applicationFor(applicationId, user);
    const { count } = await this.prisma.applicationInvite.updateMany({
      where: { applicationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count) {
      await this.audit.record({
        actor: user,
        action: AuditAction.DELETE,
        entity: "Application",
        entityId: applicationId,
        entityLabel: `${this.appNo(app)} · customer form link withdrawn`,
        ip,
      });
    }
    return this.status(applicationId, user);
  }

  // ── customer side (no login; the link is the credential) ──

  private async load(token: string) {
    if (!looksLikeFormToken(token)) throw new NotFoundException("This link is not valid.");
    const invite = await this.prisma.applicationInvite.findUnique({
      where: { tokenHash: hashFormToken(token) },
      include: {
        application: { select: APPLICATION_FOR_FORM },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!invite) throw new NotFoundException("This link is not valid.");
    return invite;
  }

  private async openInvite(token: string) {
    const invite = await this.load(token);
    const state = this.stateOf(invite, invite.application);
    if (state === "submitted") throw new ConflictException("This form has already been sent in. Thank you!");
    if (state !== "open") throw new ConflictException("This link is no longer active. Please ask us for a new one.");
    return invite;
  }

  private currentForm(invite: { draft: Prisma.JsonValue | null; application: FormApplication }): FormData {
    return mergeForm(formFromRecords(invite.application), (invite.draft ?? {}) as FormData);
  }

  async view(token: string) {
    const invite = await this.load(token);
    const app = invite.application;
    const state = this.stateOf(invite, app);
    const base = { company: this.company(), applicationNo: this.appNo(app) };

    if (state !== "open") {
      return { ...base, state: state === "revoked" ? ("closed" as const) : state, submittedAt: invite.submittedAt };
    }

    if (!invite.openedAt) {
      await this.prisma.applicationInvite.update({ where: { id: invite.id }, data: { openedAt: new Date() } });
    }

    const form = this.currentForm(invite);
    // The document list depends on what the customer says they do for work, so it follows their answers as they type.
    const bucket = resolveChecklistBucket({
      isNRI: Boolean(form.isNRI),
      employmentType: form.employmentType ?? null,
      constitution: form.constitution ?? null,
    });
    const [items, allDocs, categories] = await Promise.all([
      this.checklist.itemsFor(app.loanProductId, bucket),
      this.prisma.document.findMany({ where: { applicationId: app.id }, select: { category: true } }),
      Promise.resolve(this.settings.get<string[]>("documents.categories")),
    ]);
    const have = new Set(allDocs.map((d) => d.category));

    return {
      ...base,
      state: "open" as const,
      expiresAt: invite.expiresAt,
      product: app.loanProduct.name,
      phone: app.applicants[0]?.phone ?? null,
      form,
      checklist: items.map((i) => ({ label: i.label, category: i.category, received: have.has(i.category) })),
      categories,
      documents: invite.documents.map((d) => ({ id: d.id, category: d.category, fileName: d.fileName, sizeBytes: d.sizeBytes })),
      limits: {
        maxFileMb: this.settings.get<number>("documents.maxUploadMb"),
        maxFiles: this.settings.get<number>("forms.maxFilesPerLink"),
        referencesRequired: this.settings.get<number>("forms.referencesRequired"),
      },
    };
  }

  async save(token: string, dto: SaveFormDto) {
    const invite = await this.openInvite(token);
    const patch: FormData = { ...dto };
    const merged = mergeForm((invite.draft ?? {}) as FormData, patch);
    await this.prisma.applicationInvite.update({
      where: { id: invite.id },
      data: { draft: merged as Prisma.InputJsonValue, lastSavedAt: new Date() },
    });
    return { saved: true };
  }

  async upload(token: string, file: { originalname: string; size: number; buffer: Buffer } | undefined, category: string | undefined) {
    const invite = await this.openInvite(token);
    if (!file) throw new BadRequestException("Choose a file to upload");

    const maxFiles = this.settings.get<number>("forms.maxFilesPerLink");
    if (invite.documents.length >= maxFiles) {
      throw new BadRequestException(`You can upload up to ${maxFiles} files through this link`);
    }

    // Only a category we recognise; anything else is filed under "Other".
    const form = this.currentForm(invite);
    const bucket = resolveChecklistBucket({
      isNRI: Boolean(form.isNRI),
      employmentType: form.employmentType ?? null,
      constitution: form.constitution ?? null,
    });
    const known = new Set([
      ...this.settings.get<string[]>("documents.categories"),
      ...(await this.checklist.itemsFor(invite.application.loanProductId, bucket)).map((i) => i.category),
    ]);
    const filed = category && known.has(category) ? category : "Other";

    const doc = await this.documents.storeFile(invite.application.id, file, filed, { inviteId: invite.id });
    await this.prisma.applicationInvite.update({ where: { id: invite.id }, data: { lastSavedAt: new Date() } });
    await this.audit.record({
      actor: { id: invite.application.id, name: this.appNo(invite.application) },
      actorType: AuditActorType.CLIENT,
      action: AuditAction.CREATE,
      entity: "Document",
      entityId: doc.id,
      entityLabel: doc.fileName,
      changes: { category: { from: null, to: filed } },
    });
    return { id: doc.id, category: doc.category, fileName: doc.fileName, sizeBytes: doc.sizeBytes };
  }

  async removeDocument(token: string, documentId: string) {
    const invite = await this.openInvite(token);
    // Only what this customer uploaded through this link — never anything staff filed.
    const doc = invite.documents.find((d) => d.id === documentId);
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.document.delete({ where: { id: doc.id } });
    await this.storage.remove(doc.objectKey);
    await this.audit.record({
      actor: { id: invite.application.id, name: this.appNo(invite.application) },
      actorType: AuditActorType.CLIENT,
      action: AuditAction.DELETE,
      entity: "Document",
      entityId: doc.id,
      entityLabel: doc.fileName,
    });
    return { ok: true };
  }

  async submit(token: string) {
    const invite = await this.openInvite(token);
    const app = invite.application;
    const form = this.currentForm(invite);

    const problems = formProblems(form, {
      referencesRequired: this.settings.get<number>("forms.referencesRequired"),
      today: istToday(),
    });
    if (Object.keys(problems).length) {
      throw new BadRequestException({ message: "Some details are missing or need another look", fields: problems });
    }

    const before = formFromRecords(app);
    const primary = app.applicants[0];
    await this.prisma.$transaction(async (tx) => {
      if (primary) {
        await tx.applicant.update({
          where: { id: primary.id },
          data: {
            name: form.name!.trim(),
            email: form.email || null,
            dateOfBirth: new Date(`${form.dateOfBirth}T00:00:00.000Z`),
            pan: form.pan,
            aadhaarLast4: form.aadhaarLast4 || null,
            address: form.address,
            city: form.city,
            pincode: form.pincode,
            employmentType: form.employmentType,
            constitution: form.constitution ?? null,
            isNRI: Boolean(form.isNRI),
            employerName: form.employerName || null,
            monthlyIncome: form.monthlyIncome,
          },
        });
      }
      await tx.application.update({
        where: { id: app.id },
        data: { requestedAmount: form.requestedAmount!, tenureMonths: form.tenureMonths ?? null, purpose: form.purpose || null },
      });
      await tx.reference.deleteMany({ where: { applicationId: app.id } });
      await tx.reference.createMany({
        data: completeReferences(form.references).map((r) => ({
          applicationId: app.id,
          name: r.name.trim(),
          phone: r.phone,
          relation: r.relation || null,
          address: r.address || null,
        })),
      });
      await tx.applicationInvite.update({
        where: { id: invite.id },
        data: { submittedAt: new Date(), draft: Prisma.DbNull },
      });
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(form)) {
      if (key === "references") continue;
      const was = (before as Record<string, unknown>)[key] ?? null;
      if (JSON.stringify(was) !== JSON.stringify(value ?? null)) changes[key] = { from: was, to: value ?? null };
    }
    await this.audit.record({
      actor: { id: app.id, name: this.appNo(app) },
      actorType: AuditActorType.CLIENT,
      action: AuditAction.UPDATE,
      entity: "Application",
      entityId: app.id,
      entityLabel: `${this.appNo(app)} · application form submitted by the customer`,
      changes,
    });
    return { submitted: true, applicationNo: this.appNo(app) };
  }
}
