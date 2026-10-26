import { channelFromUtm, cleanLandingPage, cleanTag } from "../marketing/channel.util";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { checkFollowUpToken } from "./follow-up-token";
import { AuditAction, AuditActorType, LeadSegment, LeadStatus, Prisma, Role, SubmissionOutcome } from "@prisma/client";
import { classifyLead, missingForMeeting } from "./lead-segment";
import { entryCount, isFuller, nameTokens, namesMatch, type Entry } from "./lead-dedupe";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { LeadAssignmentService } from "../teams/lead-assignment.service";
import { LeadSourcesService } from "../lead-sources/lead-sources.service";
import { buildLeadTemplate, parseLeadFile } from "./lead-import";
import { SettingsService } from "../settings/settings.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import {
  BulkLeadsDto,
  CreateFollowUpDto,
  CreateLeadDto,
  ListLeadsQuery,
  LeadFollowUpDto,
  PublicLeadDto,
  UpdateLeadDto,
} from "./dto/lead.dto";

const LIST_INCLUDE = {
  loanProduct: { select: { id: true, name: true, slug: true } },
  assignedOfficer: { select: { id: true, name: true } },
  assignedManager: { select: { id: true, name: true } },
  sourcingPartner: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

/** The newest logged call or note, shown on the list as "Last contact". */
const LAST_CONTACT = {
  followUps: { select: { createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  _count: { select: { followUps: true } },
} satisfies Prisma.LeadInclude;

/** The fields the segment rules read. */
const SEGMENT_SELECT = {
  id: true,
  status: true,
  loanProductId: true,
  amount: true,
  city: true,
  employmentType: true,
  monthlyIncome: true,
  documentsStatus: true,
  nextFollowUpAt: true,
  segment: true,
  segmentLocked: true,
  segmentNote: true,
} satisfies Prisma.LeadSelect;

type Db = PrismaService | Prisma.TransactionClient;

/** Text boxes on the lead form: emptying one clears the value. */
const CLEARABLE_TEXT = ["email", "city", "secondaryPhone", "pan", "address", "pincode", "employerName", "designation", "workLocation", "officialEmail", "notes"] as const;

/** A PAN number is shown by its last four characters in the audit log. */
function maskPan(changes: ReturnType<typeof diff>) {
  const pan = changes?.pan;
  if (!changes || !pan) return changes;
  const last4 = (v: unknown) => (typeof v === "string" && v ? `••••${v.slice(-4)}` : null);
  return { ...changes, pan: { from: last4(pan.from), to: last4(pan.to) } };
}

@Injectable()
export class LeadsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private assignment: LeadAssignmentService,
    private sources: LeadSourcesService,
    private config: ConfigService,
  ) {}

  /** Advisors only ever see their own leads; managers and admins see everything. */
  private scopeFor(user: AuthUser): Prisma.LeadWhereInput {
    return user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
  }

  private async resolveProductId(slug?: string) {
    if (!slug) return undefined;
    const product = await this.prisma.loanProduct.findUnique({ where: { slug } });
    return product?.id;
  }

  /** The tracking tags a lead arrived with, cleaned, plus the channel they point to. */
  private attribution(dto: PublicLeadDto & { channel?: string; campaign?: string }) {
    const utmSource = cleanTag(dto.utmSource);
    const utmMedium = cleanTag(dto.utmMedium);
    return {
      utmSource,
      utmMedium,
      utmContent: cleanTag(dto.utmContent),
      utmTerm: cleanTag(dto.utmTerm, 200),
      landingPage: cleanLandingPage(dto.landingPage),
      campaign: cleanTag(dto.campaign) ?? cleanTag(dto.utmCampaign),
      // A channel chosen by staff wins; otherwise it is read from the tracking tags.
      channel: cleanTag(dto.channel, 60) ?? channelFromUtm(utmSource, utmMedium) ?? undefined,
    };
  }

  /**
   * Works out the lead's segment and saves it when it changed. A lead staff pinned keeps its segment
   * until they hand it back, unless it gets closed (a closed lead has none).
   */
  async refreshSegment(id: string, db: Db = this.prisma) {
    const lead = await db.lead.findUnique({ where: { id }, select: SEGMENT_SELECT });
    if (!lead) return;
    const closed = lead.status === LeadStatus.CONVERTED || lead.status === LeadStatus.LOST;
    if (lead.segmentLocked && !closed) return;
    const { segment, note } = classifyLead(lead);
    if (segment === lead.segment && note === lead.segmentNote && !(closed && lead.segmentLocked)) return;
    await db.lead.update({ where: { id }, data: { segment, segmentNote: note, ...(closed && { segmentLocked: false }) } });
  }

  /** Counts per segment for the Leads page chips: open, unarchived leads the caller may see. */
  async segmentCounts(user: AuthUser) {
    const rows = await this.prisma.lead.groupBy({
      by: ["segment"],
      where: { ...this.scopeFor(user), archivedAt: null, segment: { not: null } },
      _count: { _all: true },
    });
    const counts = { HOT: 0, WARM: 0, FOLLOW_UP: 0, COLD: 0, followUpsDue: 0, chatbot: 0 };
    for (const r of rows) if (r.segment) counts[r.segment] = r._count._all;
    counts.followUpsDue = await this.prisma.lead.count({
      where: { ...this.scopeFor(user), archivedAt: null, segment: { not: null }, nextFollowUpAt: { lte: new Date() } },
    });
    // People who confirmed their number with a code to use the website chat, whatever their segment.
    counts.chatbot = await this.prisma.lead.count({
      where: { ...this.scopeFor(user), archivedAt: null, chatVerifiedAt: { not: null } },
    });
    return counts;
  }

  /** Leads that existed before segments did, or came in through a path that missed one, get theirs on start-up. */
  onApplicationBootstrap() {
    void this.backfillSegments().catch((e: unknown) =>
      this.logger.warn(`Could not work out lead segments: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  async backfillSegments() {
    for (;;) {
      const batch = await this.prisma.lead.findMany({
        where: { segment: null, segmentLocked: false, archivedAt: null, status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] } },
        select: { id: true },
        take: 200,
      });
      if (batch.length === 0) return;
      for (const { id } of batch) await this.refreshSegment(id);
    }
  }

  /**
   * Intake from the public website, WhatsApp flow and AI telecaller. Every entry is logged
   * as received; the same person filling a form twice still ends up as one lead:
   *  - same phone + matching name as an open lead → merged into it (the fuller entry wins),
   *  - same phone but a different name → its own lead, flagged as a shared phone.
   * Closed leads (converted, lost, archived) never absorb a new entry: that is a new enquiry.
   */
  async intake(dto: PublicLeadDto) {
    const product = dto.productSlug
      ? await this.prisma.loanProduct.findUnique({ where: { slug: dto.productSlug }, select: { id: true, name: true } })
      : null;
    const incoming: Entry = {
      name: dto.name.trim(),
      phone: dto.phone,
      email: dto.email?.trim().toLowerCase() || null,
      city: dto.city?.trim() || null,
      loanType: product?.name ?? null,
      amount: dto.amount ?? null,
      detail: dto.detail?.trim() || null,
    };
    const attribution = this.attribution({ ...dto, channel: undefined, campaign: undefined });

    return this.prisma.$transaction(async (tx) => {
      // Two copies of one form arriving together must not both create a lead.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.phone}))`;

      const open = await tx.lead.findMany({
        where: { phone: dto.phone, archivedAt: null, status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] } },
        include: { loanProduct: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      const same = open.find((l) => namesMatch(l.name, incoming.name));

      const log = (outcome: SubmissionOutcome, leadId: string, sharedPhone = false) =>
        tx.websiteSubmission.create({
          data: {
            form: dto.source,
            name: incoming.name,
            phone: incoming.phone,
            email: incoming.email,
            city: incoming.city,
            loanType: product?.name ?? null,
            amount: dto.amount,
            detail: incoming.detail,
            landingPage: attribution.landingPage,
            entries: entryCount(incoming),
            outcome,
            sharedPhone,
            leadId,
          },
        });

      if (!same) {
        const lead = await tx.lead.create({
          data: {
            ...attribution,
            name: incoming.name,
            phone: dto.phone,
            email: incoming.email,
            city: incoming.city,
            source: dto.source,
            loanProductId: product?.id,
            amount: dto.amount,
            notes: incoming.detail,
            assignedOfficerId: (await this.assignment.pickOfficer(tx, {})) ?? undefined,
          },
          select: { id: true, leadNo: true },
        });
        await log(SubmissionOutcome.NEW_LEAD, lead.id, open.length > 0);
        await this.refreshSegment(lead.id, tx);
        return { id: lead.id, leadNo: lead.leadNo, isNew: true };
      }

      const stored: Entry = {
        name: same.name,
        phone: same.phone,
        email: same.email,
        city: same.city,
        loanType: same.loanProduct?.name,
        amount: same.amount?.toString(),
        detail: same.notes,
      };
      if (!isFuller(incoming, stored)) {
        await log(SubmissionOutcome.DUPLICATE_KEPT, same.id);
        return { id: same.id, leadNo: same.leadNo };
      }

      // The fuller entry fills in or replaces what the lead holds. Anything it left blank, and everything
      // staff own (status, owner, follow-ups), stays as it was.
      const data = {
        name: nameTokens(incoming.name).length >= nameTokens(same.name).length ? incoming.name : undefined,
        email: incoming.email ?? undefined,
        city: incoming.city ?? undefined,
        loanProductId: product?.id,
        amount: dto.amount,
        notes:
          incoming.detail && !same.notes?.includes(incoming.detail)
            ? [same.notes, incoming.detail].filter(Boolean).join("\n— Sent again from the website: ")
            : undefined,
        utmSource: same.utmSource ?? attribution.utmSource,
        utmMedium: same.utmMedium ?? attribution.utmMedium,
        channel: same.channel ?? attribution.channel,
        landingPage: same.landingPage ?? attribution.landingPage,
      } satisfies Prisma.LeadUncheckedUpdateInput;
      await tx.lead.update({ where: { id: same.id }, data });
      await this.refreshSegment(same.id, tx);
      await log(SubmissionOutcome.DUPLICATE_UPDATED, same.id);
      await this.audit.recordUpdate({
        actor: { name: "Website form" },
        actorType: AuditActorType.CLIENT,
        entity: "Lead",
        entityId: same.id,
        entityLabel: `${same.name} · sent the form again with more details`,
        changes: diff({ ...same, loanProductId: same.loanProductId }, data),
      });
      return { id: same.id, leadNo: same.leadNo };
    });
  }

  /**
   * The optional second form: the visitor's extra answers go into the notes of the lead they just made, so the
   * team sees one record, not two. Employment type and income fill in only when staff have not set them.
   */
  async addWebsiteDetails(id: string, dto: LeadFollowUpDto) {
    if (!checkFollowUpToken(id, dto.token, this.config.getOrThrow<string>("JWT_SECRET"))) {
      throw new ForbiddenException("This link has expired. Please send the form again.");
    }
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead || lead.archivedAt) throw new NotFoundException("Lead not found");
    const detail = dto.detail.trim();
    if (!lead.notes?.includes(detail)) {
      await this.prisma.lead.update({
        where: { id },
        data: {
          notes: [lead.notes, `— More details from the website:\n${detail}`].filter(Boolean).join("\n"),
          ...(dto.employmentType && !lead.employmentType && { employmentType: dto.employmentType }),
          ...(dto.monthlyIncome && !lead.monthlyIncome && { monthlyIncome: dto.monthlyIncome }),
        },
      });
      await this.refreshSegment(id);
      await this.audit.recordUpdate({
        actor: { name: "Website form" },
        actorType: AuditActorType.CLIENT,
        entity: "Lead",
        entityId: id,
        entityLabel: `#${lead.leadNo} ${lead.name} · added the optional detailed form`,
        changes: { notes: { from: null, to: "More details added" } },
      });
    }
    return { ok: true };
  }

  async create(dto: CreateLeadDto, user: AuthUser) {
    const creatorOwns = user.role === Role.ADVISOR && this.settings.get<boolean>("pipeline.autoAssignToCreator");
    const officerId =
      dto.assignedOfficerId ??
      (creatorOwns ? user.id : undefined) ??
      (await this.assignment.pickOfficer(this.prisma, { sourcingPartnerId: dto.sourcingPartnerId })) ??
      undefined;
    const created = await this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.trim().toLowerCase(),
        city: dto.city?.trim(),
        source: dto.source,
        loanProductId: await this.resolveProductId(dto.productSlug),
        amount: dto.amount,
        notes: dto.detail,
        ...this.attribution(dto),
        sourcingPartnerId: dto.sourcingPartnerId,
        // An advisor creating a lead owns it unless someone else is named.
        assignedOfficerId: officerId,
        assignedManagerId: dto.assignedManagerId,
        nextFollowUpAt: dto.nextFollowUpAt,
        employmentType: dto.employmentType,
        monthlyIncome: dto.monthlyIncome,
        meetingMode: dto.meetingMode,
        meetingPlace: dto.meetingPlace,
        documentsStatus: dto.documentsStatus,
      },
      include: LIST_INCLUDE,
    });
    await this.refreshSegment(created.id);
    return this.prisma.lead.findUniqueOrThrow({ where: { id: created.id }, include: LIST_INCLUDE });
  }

  async findAll(query: ListLeadsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const where: Prisma.LeadWhereInput = {
      ...this.scopeFor(user),
      archivedAt: query.archived === "true" ? { not: null } : null,
      // Closed leads stay out of the working list unless a status is picked (Teams → Hide closed leads).
      ...(query.status
        ? { status: query.status }
        : this.settings.get<boolean>("teams.hideClosedLeads") && query.archived !== "true"
          ? { status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] } }
          : {}),
      ...(query.segment && { segment: query.segment }),
      ...(query.source && { source: query.source }),
      ...(query.chatbot === "true" && { chatVerifiedAt: { not: null } }),
      ...(query.assignedOfficerId && { assignedOfficerId: query.assignedOfficerId === "none" ? null : query.assignedOfficerId }),
      ...(query.sourcingPartnerId && { sourcingPartnerId: query.sourcingPartnerId === "none" ? null : query.sourcingPartnerId }),
      ...(query.loanProductId && { loanProductId: query.loanProductId }),
      ...(query.channel && { channel: query.channel === "none" ? null : query.channel }),
      ...(rangeFilter(resolveRange(query)) && { createdAt: rangeFilter(resolveRange(query)) }),
      ...(query.dueOnly === "true" && { nextFollowUpAt: { lte: new Date() } }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: { ...LIST_INCLUDE, ...LAST_CONTACT },
        // Priority order: Hot, Warm, Follow-up, Cold (the enum's own order). Inside a segment the
        // soonest follow-up, or the one most overdue, comes first, then the newest enquiry.
        orderBy: [
          { segment: { sort: "asc", nulls: "last" } },
          { nextFollowUpAt: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items: items.map(({ followUps, _count, ...lead }) => ({ ...lead, lastContactAt: followUps[0]?.createdAt ?? null, contactCount: _count.followUps })),
      total,
      page,
      pageSize,
    };
  }

  /** How many working leads each loan type has, for the tabs above the list. */
  async loanTypeCounts(user: AuthUser) {
    const hideClosed = this.settings.get<boolean>("teams.hideClosedLeads");
    const rows = await this.prisma.lead.groupBy({
      by: ["loanProductId"],
      where: {
        ...this.scopeFor(user),
        archivedAt: null,
        ...(hideClosed && { status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] } }),
      },
      _count: { _all: true },
      orderBy: { loanProductId: "asc" },
    });
    const products = await this.prisma.loanProduct.findMany({
      where: { id: { in: rows.flatMap((r) => (r.loanProductId ? [r.loanProductId] : [])) } },
      select: { id: true, name: true },
    });
    const name = new Map(products.map((p) => [p.id, p.name]));
    return {
      total: rows.reduce((n, r) => n + r._count._all, 0),
      types: rows
        .flatMap((r) => (r.loanProductId && name.has(r.loanProductId) ? [{ loanProductId: r.loanProductId, name: name.get(r.loanProductId)!, count: r._count._all }] : []))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }

  async findOne(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        ...LIST_INCLUDE,
        application: { select: { id: true, seq: true, createdAt: true, status: true } },
        followUps: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const { application, ...rest } = lead;
    return {
      ...rest,
      missingForMeeting: missingForMeeting(lead),
      application: application && {
        id: application.id,
        status: application.status,
        applicationNo: this.settings.applicationNo(application.seq, application.createdAt),
      },
    };
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthUser, ip?: string) {
    const before = await this.findOne(id, user);

    // The segment is handled on its own below: staff either pin one or hand it back to the rules.
    const { segment: requestedSegment, ...fields } = dto;
    const data: Prisma.LeadUncheckedUpdateInput = { ...fields };
    if (requestedSegment === "AUTO") {
      data.segmentLocked = false;
    } else if (requestedSegment) {
      data.segment = requestedSegment;
      data.segmentLocked = true;
      data.segmentNote = `Set by ${user.name}.`;
    }
    // Clearing a field in the form stores nothing, not an empty string.
    for (const key of CLEARABLE_TEXT) {
      const v = (fields as Record<string, unknown>)[key];
      if (typeof v === "string") (data as Record<string, unknown>)[key] = v.trim() || null;
    }
    if (typeof dto.email === "string" && dto.email.trim()) data.email = dto.email.trim().toLowerCase();
    if (dto.officialEmail) data.officialEmail = dto.officialEmail.trim().toLowerCase();
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.channel !== undefined) data.channel = dto.channel?.trim() || null;
    if (dto.campaign !== undefined) data.campaign = dto.campaign?.trim() || null;
    if (dto.status === LeadStatus.LOST) {
      if (!(dto.lostReason?.trim() || before.lostReason)) {
        throw new BadRequestException("Say why this lead was lost");
      }
    } else if (dto.status && before.status === LeadStatus.LOST) {
      // Reopening a lead: the old reason no longer applies.
      data.lostReason = null;
    }

    await this.prisma.lead.update({ where: { id }, data });
    await this.refreshSegment(id);
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id }, include: LIST_INCLUDE });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Lead",
      entityId: id,
      entityLabel: `#${lead.leadNo} ${lead.name}`,
      changes: maskPan(diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>)),
      ip,
    });

    return lead;
  }

  /** Only closed leads may be archived — an open lead still needs working. */
  async setArchived(id: string, archived: boolean, user: AuthUser, ip?: string) {
    const lead = await this.findOne(id, user);
    if (archived && lead.status !== LeadStatus.CONVERTED && lead.status !== LeadStatus.LOST) {
      throw new BadRequestException("Only converted or lost leads can be archived");
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include: LIST_INCLUDE,
    });
    await this.audit.record({
      actor: user,
      action: AuditAction.UPDATE,
      entity: "Lead",
      entityId: id,
      entityLabel: `#${lead.leadNo} ${lead.name}`,
      changes: { archived: { from: !archived, to: archived } },
      ip,
    });
    return updated;
  }

  /**
   * Who already has this phone number? Shown as a warning while a lead is being
   * typed in — details are limited to what is safe to reveal to the caller.
   */
  async findDuplicates(rawPhone: string, user: AuthUser) {
    const phone = rawPhone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(phone)) return [];
    const staff = user.role === Role.ADVISOR;

    const [leads, applicants] = await Promise.all([
      this.prisma.lead.findMany({
        where: { phone },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, leadNo: true, name: true, status: true, createdAt: true, archivedAt: true, assignedOfficerId: true, assignedOfficer: { select: { name: true } } },
      }),
      this.prisma.applicant.findMany({
        where: { phone, isPrimary: true },
        take: 5,
        select: {
          name: true,
          application: { select: { id: true, seq: true, createdAt: true, status: true, ownerId: true, owner: { select: { name: true } } } },
        },
      }),
    ]);

    return [
      ...leads.map((l) => ({
        kind: "lead" as const,
        id: l.id,
        title: `${l.name} · lead #${l.leadNo}`,
        status: l.status,
        owner: l.assignedOfficer?.name ?? null,
        createdAt: l.createdAt,
        archived: l.archivedAt !== null,
        // Staff can only open their own records; for the rest they just learn it exists.
        canOpen: !staff || l.assignedOfficerId === user.id,
      })),
      ...applicants.map((a) => ({
        kind: "application" as const,
        id: a.application.id,
        title: `${a.name} · ${this.settings.applicationNo(a.application.seq, a.application.createdAt)}`,
        status: a.application.status,
        owner: a.application.owner?.name ?? null,
        createdAt: a.application.createdAt,
        archived: false,
        canOpen: !staff || a.application.ownerId === user.id,
      })),
    ];
  }

  /**
   * Bulk import from a spreadsheet. Rows are validated and de-duplicated one by
   * one so a single bad row never sinks the batch; the caller gets a per-row
   * outcome to fix and re-upload.
   */
  /** An uploaded Excel or CSV file, read and imported like a pasted batch; problems are reported against the file's own row numbers. */
  async importFile(file: Express.Multer.File | undefined, user: AuthUser, ip?: string) {
    if (!file) throw new BadRequestException("Choose a file to upload.");
    const { rows, sheetRows } = await parseLeadFile(file.buffer, file.originalname);
    const result = await this.bulkCreate({ rows }, user, ip);
    return { ...result, results: result.results.map((r) => ({ ...r, row: sheetRows[r.row - 1] - 1 })) };
  }

  /** The blank import sheet, with drop-downs of the loan types and lead sources in use. */
  async importTemplate() {
    const [products, sources] = await Promise.all([
      this.prisma.loanProduct.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
      this.sources.activeNames(),
    ]);
    return buildLeadTemplate(products.map((p) => p.name), sources);
  }

  async bulkCreate(dto: BulkLeadsDto, user: AuthUser, ip?: string) {
    const products = await this.prisma.loanProduct.findMany({ select: { id: true, slug: true, name: true } });
    const productKey = new Map<string, string>();
    for (const p of products) {
      productKey.set(p.slug.toLowerCase(), p.id);
      productKey.set(p.name.toLowerCase(), p.id);
    }

    const normalisePhone = (raw: string) => raw.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    const seen = new Set<string>();
    const results: { row: number; name: string; status: "created" | "duplicate" | "invalid"; message?: string }[] = [];
    const owner =
      user.role === Role.ADVISOR && this.settings.get<boolean>("pipeline.autoAssignToCreator") ? user.id : undefined;

    for (const [i, row] of dto.rows.entries()) {
      const line = i + 1;
      const phone = normalisePhone(row.phone);
      if (!/^[6-9]\d{9}$/.test(phone)) {
        results.push({ row: line, name: row.name, status: "invalid", message: "Phone must be a 10-digit Indian mobile number" });
        continue;
      }
      if (row.name.trim().length < 2) {
        results.push({ row: line, name: row.name, status: "invalid", message: "Name is too short" });
        continue;
      }
      let loanProductId: string | undefined;
      if (row.product?.trim()) {
        loanProductId = productKey.get(row.product.trim().toLowerCase());
        if (!loanProductId) {
          results.push({ row: line, name: row.name, status: "invalid", message: `Unknown loan product "${row.product}"` });
          continue;
        }
      }
      if (seen.has(phone) || (await this.prisma.lead.findFirst({ where: { phone }, select: { id: true } }))) {
        results.push({ row: line, name: row.name, status: "duplicate", message: "A lead with this phone already exists" });
        continue;
      }
      seen.add(phone);

      const imported = await this.prisma.lead.create({
        data: {
          name: row.name.trim(),
          phone,
          email: row.email?.trim().toLowerCase() || undefined,
          city: row.city?.trim() || undefined,
          amount: row.amount,
          notes: row.notes,
          source: "bulk-upload",
          channel: row.channel?.trim() || undefined,
          loanProductId,
          assignedOfficerId: owner ?? (await this.assignment.pickOfficer(this.prisma, {})) ?? undefined,
        },
        select: { id: true },
      });
      await this.refreshSegment(imported.id);
      results.push({ row: line, name: row.name, status: "created" });
    }

    const created = results.filter((r) => r.status === "created").length;
    if (created) {
      await this.audit.record({
        actor: user,
        action: AuditAction.CREATE,
        entity: "Lead",
        entityId: "bulk-upload",
        entityLabel: `Bulk import — ${created} lead${created === 1 ? "" : "s"}`,
        changes: { imported: { from: null, to: created } },
        ip,
      });
    }

    return {
      created,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      invalid: results.filter((r) => r.status === "invalid").length,
      results: results.filter((r) => r.status !== "created"),
    };
  }

  async addFollowUp(id: string, dto: CreateFollowUpDto, user: AuthUser) {
    await this.findOne(id, user);
    const followUp = await this.prisma.followUp.create({
      data: { leadId: id, userId: user.id, note: dto.note, dueAt: dto.dueAt },
      include: { user: { select: { id: true, name: true } } },
    });

    // Logging a dated follow-up is how the next action date gets set.
    if (dto.dueAt) {
      await this.prisma.lead.update({
        where: { id },
        data: { nextFollowUpAt: dto.dueAt },
      });
      await this.refreshSegment(id);
    }
    return followUp;
  }
}
