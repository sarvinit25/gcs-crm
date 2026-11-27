import { timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertsService } from "../alerts/alerts.service";
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
import { PROFILE_STAGE, answerKey, fieldsFor, parseAnswer, type Answers, type Field } from "../loan-profile/profile-schema";
import { LoanProfileService } from "../loan-profile/loan-profile.service";
import { DocumentReaderService } from "../document-reader/document-reader.service";
import { placeDocuments } from "./checklist-files";
import { checkFormSession, generateFormCode, generateFormToken, hashFormCode, hashFormToken, looksLikeFormToken, maskEmail, signFormSession } from "./form-token";
import { completeReferences, formProblems, mergeForm, type FormData } from "./form-rules";
import type { SaveFormDto } from "./dto/customer-form.dto";

const PHONE = /^[6-9]\d{9}$/;
const DAY_MS = 86_400_000;
const CODE_VALID_MINUTES = 10;
const CODE_MAX_TRIES = 5;
const CODE_RESEND_SECONDS = 60;
const SESSION_HOURS = 3;

type InviteState = "open" | "submitted" | "expired" | "closed";

const APPLICATION_FOR_FORM = {
  id: true,
  seq: true,
  createdAt: true,
  status: true,
  archivedAt: true,
  leadId: true,
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
    private config: ConfigService,
    private alerts: AlertsService,
    private profile: LoanProfileService,
    private reader: DocumentReaderService,
  ) {}

  private get secret() {
    return this.config.getOrThrow<string>("JWT_SECRET");
  }

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
      // With an email on file the customer must enter an emailed code before the form opens.
      codeRequired: Boolean(app.applicants[0]?.email),
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

  /** Emails the live link to the applicant's address on file. The link is checked against the current one, so only that can be sent. */
  async emailLink(applicationId: string, url: string, user: AuthUser, ip?: string) {
    const app = await this.applicationFor(applicationId, user);
    const invite = await this.prisma.applicationInvite.findFirst({ where: { applicationId, revokedAt: null, submittedAt: null }, orderBy: { createdAt: "desc" } });
    if (!invite || this.stateOf(invite, app) !== "open") throw new BadRequestException("There is no live link to send. Create one first.");
    const to = this.emailOn(app);
    if (!to) throw new BadRequestException("Add the applicant's email address first.");
    const token = decryptSecret(invite.tokenEnc);
    let ok = false;
    try {
      const u = new URL(url);
      ok = (u.protocol === "https:" || u.protocol === "http:") && u.pathname.endsWith(`/apply/${token}`) && !u.search && !u.hash;
    } catch {
      ok = false;
    }
    if (!ok) throw new BadRequestException("That is not this application's link.");
    const name = app.applicants[0]?.name?.split(" ")[0] ?? "there";
    const sent = await this.alerts.applicationFormLinkEmail(to, name, url, app.loanProduct.name, invite.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }), true);
    if (!sent) throw new ServiceUnavailableException("The email could not be sent. Check the mail settings.");
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Application", entityId: applicationId, entityLabel: `${this.appNo(app)} · form link emailed`, ip });
    return { sent: true, to: maskEmail(to) };
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

  /** The email the code goes to: the applicant's, on file. None on file means the link opens without a code. */
  private emailOn(app: FormApplication): string | null {
    return app.applicants[0]?.email?.trim().toLowerCase() || null;
  }

  private hasSession(invite: { id: string; application: FormApplication }, session: string | undefined) {
    return !this.emailOn(invite.application) || checkFormSession(this.secret, invite.id, session);
  }

  private requireSession(invite: { id: string; application: FormApplication }, session: string | undefined) {
    if (!this.hasSession(invite, session)) throw new ForbiddenException({ message: "Please confirm your email to continue.", code: "SESSION" });
  }

  /** Emails a one-time code to the address on file. The answer is the same whether or not the address matched. */
  async sendCode(token: string, email: string) {
    const invite = await this.openInvite(token);
    const on = this.emailOn(invite.application);
    if (!on) return { sent: false as const, codeRequired: false as const };
    if (invite.otpSentAt && Date.now() - invite.otpSentAt.getTime() < CODE_RESEND_SECONDS * 1000) {
      throw new BadRequestException("A code was sent a moment ago. Please check your email, or wait a minute for another.");
    }
    if (email.trim().toLowerCase() === on) {
      const code = generateFormCode();
      await this.prisma.applicationInvite.update({
        where: { id: invite.id },
        data: { otpHash: hashFormCode(this.secret, invite.id, code), otpExpiresAt: new Date(Date.now() + CODE_VALID_MINUTES * 60_000), otpAttempts: 0, otpSentAt: new Date() },
      });
      if (!(await this.alerts.formCodeEmail(on, code, CODE_VALID_MINUTES))) throw new ServiceUnavailableException("We could not send the email just now. Please try again in a few minutes.");
    }
    return { sent: true as const, validMinutes: CODE_VALID_MINUTES };
  }

  /** Checks the emailed code and, if right, hands back a pass that opens this form for a few hours. */
  async verifyCode(token: string, email: string, code: string) {
    const invite = await this.openInvite(token);
    const on = this.emailOn(invite.application);
    const bad = new BadRequestException("That code is not right, or it has expired. Please ask for a new one.");
    if (!on) return { session: signFormSession(this.secret, invite.id, Date.now() + SESSION_HOURS * 3_600_000) };
    if (!invite.otpHash || !invite.otpExpiresAt || invite.otpExpiresAt <= new Date() || invite.otpAttempts >= CODE_MAX_TRIES || email.trim().toLowerCase() !== on) {
      throw bad;
    }
    const given = Buffer.from(hashFormCode(this.secret, invite.id, code));
    const stored = Buffer.from(invite.otpHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await this.prisma.applicationInvite.update({ where: { id: invite.id }, data: { otpAttempts: { increment: 1 } } });
      throw bad;
    }
    await this.prisma.applicationInvite.update({ where: { id: invite.id }, data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } });
    return { session: signFormSession(this.secret, invite.id, Date.now() + SESSION_HOURS * 3_600_000) };
  }

  // ── the extra loan-profile questions (all optional, mostly pick-lists) ──

  /** What is already known (from the lead) with what the customer has answered on the form on top. */
  private async profileAnswers(invite: { profileDraft: Prisma.JsonValue | null; application: FormApplication }): Promise<Answers> {
    const held = invite.application.leadId ? await this.profile.answers(invite.application.leadId) : {};
    const draft = (invite.profileDraft && typeof invite.profileDraft === "object" ? invite.profileDraft : {}) as Answers;
    return { ...held, ...draft };
  }

  private profileShape(answers: Answers) {
    const pick = (f: Field) => ({ id: f.id, num: f.num, section: f.section, label: f.label, ask: f.ask, kind: f.kind, options: f.options ?? null, hint: f.hint ?? null, optional: Boolean(f.optional), min: f.min ?? null, max: f.max ?? null });
    return { fields: fieldsFor(answers).map(pick), answers: Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith("lp-")).map(([k, v]) => [k.slice(3), v])) };
  }

  async profileView(token: string, session?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
    return this.profileShape(await this.profileAnswers(invite));
  }

  /** Saves some answers. Each is read by the same rules as on WhatsApp; a blank clears that answer. */
  async saveProfile(token: string, values: Record<string, string>, session?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
    let answers = await this.profileAnswers(invite);
    const draft = { ...((invite.profileDraft && typeof invite.profileDraft === "object" ? invite.profileDraft : {}) as Answers) };
    const problems: Record<string, string> = {};
    for (const [id, raw] of Object.entries(values ?? {}).slice(0, 80)) {
      const field = fieldsFor(answers).find((f) => f.id === id);
      if (!field) continue;
      const key = answerKey(id);
      if (!String(raw ?? "").trim()) {
        delete draft[key];
        answers = { ...answers };
        delete answers[key];
        continue;
      }
      const parsed = parseAnswer(field, String(raw));
      if (!parsed.ok) { problems[id] = parsed.reason; continue; }
      draft[key] = parsed.value;
      answers = { ...answers, [key]: parsed.value };
    }
    if (Object.keys(problems).length) throw new BadRequestException({ message: "Some answers need another look", fields: problems });
    await this.prisma.applicationInvite.update({ where: { id: invite.id }, data: { profileDraft: draft as Prisma.InputJsonValue, lastSavedAt: new Date() } });
    return this.profileShape(answers);
  }

  /** On submit, what the customer answered becomes part of the lead's loan profile (never replacing what staff entered). */
  private async keepProfile(invite: { profileDraft: Prisma.JsonValue | null; application: FormApplication }) {
    const leadId = invite.application.leadId;
    const draft = (invite.profileDraft && typeof invite.profileDraft === "object" ? invite.profileDraft : {}) as Answers;
    if (!leadId || !Object.keys(draft).length) return;
    const all = fieldsFor(draft);
    const known = new Map([...all, ...fieldsFor({ ...draft, "lp-profile": "Salaried" }), ...fieldsFor({ ...draft, "lp-profile": "Business Owner" })].map((f) => [f.id, f]));
    for (const [key, value] of Object.entries(draft)) {
      const f = known.get(key.slice(3));
      if (!f) continue;
      await this.prisma.leadAnswer.upsert({
        where: { leadId_key: { leadId, key } },
        create: { leadId, stage: PROFILE_STAGE, key, label: `Loan profile ${f.num} · ${f.label}`, value },
        update: { stage: PROFILE_STAGE, label: `Loan profile ${f.num} · ${f.label}`, value },
      });
    }
  }

  async view(token: string, session?: string) {
    const invite = await this.load(token);
    const app = invite.application;
    const state = this.stateOf(invite, app);
    const base = { company: this.company(), applicationNo: this.appNo(app) };

    if (state !== "open") {
      return { ...base, state: state === "revoked" ? ("closed" as const) : state, submittedAt: invite.submittedAt };
    }

    // With an email on file the form stays shut until the emailed code has been entered.
    if (!this.hasSession(invite, session)) {
      return { ...base, state: "code" as const, emailHint: maskEmail(this.emailOn(app)!), validMinutes: CODE_VALID_MINUTES };
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
      this.prisma.document.findMany({ where: { applicationId: app.id }, select: { id: true, category: true, fileName: true, checklistItem: true } }),
      Promise.resolve(this.settings.get<string[]>("documents.categories")),
    ]);
    const lines = items.map((i) => ({ label: i.name, category: i.category }));
    const placed = placeDocuments(lines, allDocs);
    const have = new Set(allDocs.map((d) => `${d.category}|${placed.get(d.id) ?? ""}`));

    return {
      ...base,
      state: "open" as const,
      expiresAt: invite.expiresAt,
      product: app.loanProduct.name,
      phone: app.applicants[0]?.phone ?? null,
      form,
      checklist: items.map((i) => ({ label: i.name, description: i.description, category: i.category, received: have.has(`${i.category}|${i.name}`) })),
      categories,
      documents: invite.documents.map((d) => ({ id: d.id, category: d.category, item: placed.get(d.id) ?? null, fileName: d.fileName, sizeBytes: d.sizeBytes })),
      limits: {
        maxFileMb: this.settings.get<number>("documents.maxUploadMb"),
        maxFiles: this.settings.get<number>("forms.maxFilesPerLink"),
        referencesRequired: this.settings.get<number>("forms.referencesRequired"),
      },
    };
  }

  async save(token: string, dto: SaveFormDto, session?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
    const patch: FormData = { ...dto };
    const merged = mergeForm((invite.draft ?? {}) as FormData, patch);
    await this.prisma.applicationInvite.update({
      where: { id: invite.id },
      data: { draft: merged as Prisma.InputJsonValue, lastSavedAt: new Date() },
    });
    return { saved: true };
  }

  async upload(token: string, file: { originalname: string; size: number; buffer: Buffer } | undefined, category: string | undefined, session?: string, item?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
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
    const lines = await this.checklist.itemsFor(invite.application.loanProductId, bucket);
    const known = new Set([...this.settings.get<string[]>("documents.categories"), ...lines.map((i) => i.category)]);
    const filed = category && known.has(category) ? category : "Other";

    // The line is kept only when it is a real line of that kind.
    const checklistItem = lines.find((l) => l.category === filed && l.name === item)?.name;
    const doc = await this.documents.storeFile(invite.application.id, file, filed, { inviteId: invite.id, checklistItem });
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
    return { id: doc.id, category: doc.category, item: doc.checklistItem, fileName: doc.fileName, sizeBytes: doc.sizeBytes };
  }

  async removeDocument(token: string, documentId: string, session?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
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

  async submit(token: string, session?: string) {
    const invite = await this.openInvite(token);
    this.requireSession(invite, session);
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
      // The lead page is where staff look first, so what the customer typed goes there too (a blank never erases what staff hold).
      if (app.leadId) {
        await tx.lead.update({
          where: { id: app.leadId },
          data: {
            ...(form.email ? { email: form.email } : {}),
            ...(form.city ? { city: form.city } : {}),
            dateOfBirth: new Date(`${form.dateOfBirth}T00:00:00.000Z`),
            pan: form.pan,
            address: form.address,
            pincode: form.pincode,
            employmentType: form.employmentType,
            ...(form.employerName ? { employerName: form.employerName } : {}),
            monthlyIncome: form.monthlyIncome,
            amount: form.requestedAmount!,
          },
        });
      }
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

    await this.keepProfile(invite).catch((e) => console.error(`Could not keep the loan-profile answers for ${this.appNo(app)}: ${(e as Error).message}`));

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
    // Read what they uploaded in the background, so staff open the file to answers. The customer is not kept waiting.
    void this.reader.readAfterSubmit(app.id);
    return { submitted: true, applicationNo: this.appNo(app) };
  }
}
