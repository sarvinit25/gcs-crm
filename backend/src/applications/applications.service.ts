import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { LeadHandoff } from "./lead-handoff";
import { DocumentReaderService } from "../document-reader/document-reader.service";
import { ApplicationStatus, AuditAction, LeadStatus, Prisma, Role, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import { generatePortalAccessCode } from "../common/access-code.util";
import {
  ApplicantDto,
  CreateApplicationDto,
  ListApplicationsQuery,
  ReferenceDto,
  UpdateApplicantDto,
  UpdateApplicationDto,
} from "./dto/application.dto";
import { EventsService } from "../events/events.service";


const LIST_INCLUDE = {
  loanProduct: { select: { id: true, name: true, slug: true } },
  lender: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  applicants: { where: { isPrimary: true }, take: 1 },
} satisfies Prisma.ApplicationInclude;

type WithSeq = { seq: number; createdAt: Date };

/**
 * Makes sure a file that is now Sanctioned has a sanction record, approved on the financial side, so it shows in the
 * Sanctions section. A record already there is kept as it is (amounts, letter number, notes); only a decision still
 * Pending or Rejected is set to Approved, because someone has just said the file is sanctioned.
 */
export async function markSanctioned(tx: Pick<Prisma.TransactionClient, "sanction">, applicationId: string) {
  const now = new Date();
  const existing = await tx.sanction.findUnique({ where: { applicationId }, select: { financialStatus: true, sanctionDate: true } });
  if (!existing) {
    await tx.sanction.create({ data: { applicationId, financialStatus: SanctionStatus.APPROVED, financialAt: now, sanctionDate: now } });
  } else if (existing.financialStatus !== SanctionStatus.APPROVED) {
    await tx.sanction.update({
      where: { applicationId },
      data: { financialStatus: SanctionStatus.APPROVED, financialAt: now, ...(existing.sanctionDate ? {} : { sanctionDate: now }) },
    });
  }
}

@Injectable()
export class ApplicationsService {
  private readonly log = new Logger(ApplicationsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private events: EventsService,
    // Optional so a service built without it (a unit test, a script) simply skips the carry-over.
    @Optional() private handoff?: LeadHandoff,
    @Optional() private reader?: DocumentReaderService,
  ) {}

  /** Adds the derived applicationNo the UI and lenders refer to. */
  private decorate<T extends WithSeq>(app: T) {
    return { ...app, applicationNo: this.settings.applicationNo(app.seq, app.createdAt) };
  }

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  async create(dto: CreateApplicationDto, user: AuthUser) {
    let applicants = dto.applicants ?? [];
    // A file raised from a lead keeps that lead's owner when "Auto file assignment" is on.
    let inheritedOwnerId: string | null = null;

    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        include: { application: { select: { id: true } } },
      });
      if (!lead) throw new NotFoundException("Lead not found");
      if (this.settings.get<boolean>("teams.autoAssignFiles")) inheritedOwnerId = lead.assignedOfficerId;
      if (lead.application) {
        throw new BadRequestException("This lead already has an application");
      }
      // The primary applicant starts from the lead, so nothing is retyped: whether none was sent, or a screen sent only the name
      // and contact, every detail the lead holds fills the blanks. What was sent always wins.
      const fromLead = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? undefined,
        city: lead.city ?? undefined,
        address: lead.address ?? undefined,
        pincode: lead.pincode ?? undefined,
        pan: lead.pan ?? undefined,
        dateOfBirth: lead.dateOfBirth ? lead.dateOfBirth.toISOString() : undefined,
        employmentType: lead.employmentType ?? undefined,
        employerName: lead.employerName ?? undefined,
        monthlyIncome: lead.monthlyIncome ? lead.monthlyIncome.toNumber() : undefined,
      };
      if (!applicants.length) {
        applicants = [{ ...fromLead, isPrimary: true }];
      } else {
        const marked = applicants.findIndex((a) => a.isPrimary);
        const primary = marked === -1 ? 0 : marked;
        applicants = applicants.map((a, i) => {
          if (i !== primary) return a;
          const sent = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== ""));
          return { ...fromLead, ...sent } as typeof a;
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          leadId: dto.leadId,
          loanProductId: dto.loanProductId,
          requestedAmount: dto.requestedAmount,
          tenureMonths: dto.tenureMonths,
          purpose: dto.purpose,
          lenderId: dto.lenderId,
          ownerId: dto.ownerId ?? inheritedOwnerId ?? user.id,
          portalAccessCode: generatePortalAccessCode(),
          applicants: {
            create: applicants.map((a, i) => ({
              ...this.applicantData(a),
              isPrimary: a.isPrimary ?? i === 0,
            })),
          },
          references: { create: (dto.references ?? []).map((r) => this.referenceData(r)) },
        },
        include: LIST_INCLUDE,
      });

      if (dto.leadId) {
        await tx.lead.update({
          where: { id: dto.leadId },
          data: { status: LeadStatus.CONVERTED },
        });
      }
      return app;
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Application",
      entityId: created.id,
      entityLabel: this.settings.applicationNo(created.seq, created.createdAt),
      changes: diff({}, { requestedAmount: dto.requestedAmount, leadId: dto.leadId }),
    });

    // What the lead already holds comes across: its documents, and the figures from its CAM. A failure here never stops the file.
    if (dto.leadId && this.handoff) {
      try {
        await this.handoff.copyDocuments(dto.leadId, created.id, user.id);
        // The bank statements are read on our own server and their balances go into the CAM, before the evaluation takes its figures from it.
        await this.reader?.readStatementsOnServer(created.id, user);
        await this.handoff.seedEvaluation(dto.leadId, created.id);
      } catch (e) {
        this.log.warn(`Carrying the lead's documents and figures onto ${created.id} failed: ${(e as Error).message}`);
      }
    }

    this.events.emit("APPLICATION_CREATED", { applicationId: created.id });
    return this.decorate(created);
  }

  /** The list's filters as a database condition. `skipProduct` leaves the loan-type filter out, for the per-type counts. */
  private listWhere(query: ListApplicationsQuery, user: AuthUser, skipProduct = false): Prisma.ApplicationWhereInput {
    // "GCS-2026-0042" and a bare "42" both resolve to the sequence number.
    const seqFromSearch = query.search ? Number(query.search.replace(/^.*-/, "")) : NaN;

    return {
      ...this.scopeFor(user),
      archivedAt: query.archived === "true" ? { not: null } : null,
      ...(query.status && { status: query.status }),
      ...(query.lenderId && { lenderId: query.lenderId }),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(!skipProduct && query.loanProductId && { loanProductId: query.loanProductId }),
      ...(query.loggedIn === "true" && { bankLoginAt: { not: null } }),
      ...(rangeFilter(resolveRange(query)) && { createdAt: rangeFilter(resolveRange(query)) }),
      ...(query.search && {
        OR: [
          ...(Number.isFinite(seqFromSearch) ? [{ seq: seqFromSearch }] : []),
          { applicants: { some: { name: { contains: query.search, mode: "insensitive" } } } },
          { applicants: { some: { phone: { contains: query.search } } } },
        ],
      }),
    };
  }

  /** How many files each loan type has under the list's other filters, for the tabs above the list. Biggest first. */
  async countsByProduct(query: ListApplicationsQuery, user: AuthUser) {
    const rows = await this.prisma.application.groupBy({
      by: ["loanProductId"],
      where: this.listWhere(query, user, true),
      _count: { _all: true },
    });
    const names = await this.prisma.loanProduct.findMany({
      where: { id: { in: rows.map((r) => r.loanProductId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    const items = rows
      .map((r) => ({ id: r.loanProductId, name: nameOf.get(r.loanProductId) ?? "Other", count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { total: items.reduce((n, i) => n + i.count, 0), items };
  }

  async findAll(query: ListApplicationsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const where = this.listWhere(query, user);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);

    return { items: items.map((a) => this.decorate(a)), total, page, pageSize };
  }

  async findOne(id: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        loanProduct: { select: { id: true, name: true, slug: true } },
        lender: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNo: true, name: true, source: true } },
        applicants: { orderBy: { isPrimary: "desc" } },
        references: true,
        documents: { orderBy: { createdAt: "desc" } },
        sanction: true,
        disbursements: { orderBy: { disbursedAt: "desc" } },
      },
    });
    if (!app) throw new NotFoundException("Application not found");

    // The money on the file at a glance. Commission is what the lender pays us, so advisors do not see it.
    const sum = (rows: (Prisma.Decimal | null)[]) => rows.reduce((n, d) => n + (d ? d.toNumber() : 0), 0);
    const commission =
      user.role === Role.ADVISOR
        ? null
        : (await this.prisma.commission.aggregate({ where: { disbursement: { applicationId: id } }, _sum: { grossAmount: true } }))._sum.grossAmount?.toNumber() ?? 0;
    const summary = {
      sanctionedAmount: app.sanction?.sanctionedAmount?.toNumber() ?? 0,
      disbursedAmount: sum(app.disbursements.map((d) => d.amount)),
      processingFee: sum(app.disbursements.map((d) => d.processingFee)),
      commissionAmount: commission,
    };
    return { ...this.decorate(app), summary };
  }

  async update(id: string, dto: UpdateApplicationDto, user: AuthUser, ip?: string) {
    const before = await this.findOne(id, user);
    const app = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({ where: { id }, data: { ...dto }, include: LIST_INCLUDE });
      // A file marked Sanctioned belongs in the Sanctions section. That section lists sanction records, and only saving
      // a sanction used to make one, so a file moved to Sanctioned by status alone never appeared there.
      if (dto.status === ApplicationStatus.SANCTIONED) await markSanctioned(tx, id);
      return updated;
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Application",
      entityId: id,
      entityLabel: this.settings.applicationNo(app.seq, app.createdAt),
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    if (dto.status && dto.status !== before.status) {
      this.events.emit(dto.status === ApplicationStatus.REJECTED ? "FILE_REJECTED" : "FILE_STAGE_CHANGED", { applicationId: id });
    }

    return this.decorate(app);
  }

  /** Issues a fresh borrower-portal code — e.g. if the old one was shared too widely. */
  /** Only finished files (disbursed, rejected, withdrawn) may be archived. */
  async setArchived(id: string, archived: boolean, user: AuthUser, ip?: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, ...this.scopeFor(user) },
      select: { id: true, seq: true, createdAt: true, status: true },
    });
    if (!app) throw new NotFoundException("Application not found");
    const finished: ApplicationStatus[] = [ApplicationStatus.DISBURSED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN];
    if (archived && !finished.includes(app.status)) {
      throw new BadRequestException("Only disbursed, rejected or withdrawn applications can be archived");
    }
    await this.prisma.application.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit.record({
      actor: user,
      action: AuditAction.UPDATE,
      entity: "Application",
      entityId: id,
      entityLabel: this.settings.applicationNo(app.seq, app.createdAt),
      changes: { archived: { from: !archived, to: archived } },
      ip,
    });
    return { id, archived };
  }

  async regeneratePortalAccessCode(id: string, user: AuthUser, ip?: string) {
    await this.findOne(id, user);
    const portalAccessCode = generatePortalAccessCode();
    await this.prisma.application.update({ where: { id }, data: { portalAccessCode, portalTokenVersion: { increment: 1 } } });

    await this.audit.record({
      actor: user,
      action: AuditAction.UPDATE,
      entity: "Application",
      entityId: id,
      entityLabel: "Portal access code",
      ip,
    });

    return { portalAccessCode };
  }

  async addApplicant(id: string, dto: ApplicantDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.applicant.create({
      data: { ...this.applicantData(dto), isPrimary: false, applicationId: id },
    });
  }

  async updateApplicant(id: string, applicantId: string, dto: UpdateApplicantDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.applicant.update({
      where: { id: applicantId },
      data: { ...dto },
    });
  }

  async removeApplicant(id: string, applicantId: string, user: AuthUser) {
    await this.findOne(id, user);
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant || applicant.applicationId !== id) {
      throw new NotFoundException("Applicant not found on this application");
    }
    if (applicant.isPrimary) {
      throw new BadRequestException("The primary applicant cannot be removed");
    }
    await this.prisma.applicant.delete({ where: { id: applicantId } });
    return { ok: true };
  }

  async addReference(id: string, dto: ReferenceDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.reference.create({ data: { ...this.referenceData(dto), applicationId: id } });
  }

  async removeReference(id: string, referenceId: string, user: AuthUser) {
    await this.findOne(id, user);
    const ref = await this.prisma.reference.findUnique({ where: { id: referenceId } });
    if (!ref || ref.applicationId !== id) {
      throw new NotFoundException("Reference not found on this application");
    }
    await this.prisma.reference.delete({ where: { id: referenceId } });
    return { ok: true };
  }

  private applicantData(a: ApplicantDto) {
    const { id: _id, isPrimary: _isPrimary, ...rest } = a;
    return rest;
  }

  private referenceData(r: ReferenceDto) {
    const { id: _id, ...rest } = r;
    return rest;
  }
}
