import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  ChecklistApplicantType,
  EmploymentType,
  Prisma,
  Role,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateChecklistItemDto, UpdateChecklistItemDto } from "./dto/checklist-item.dto";

type ApplicantProfile = {
  isNRI: boolean;
  employmentType: EmploymentType | null;
  constitution: string | null;
};

/**
 * Which checklist bucket an applicant falls into. NRI overrides everything
 * else (a self-employed NRI still gets the NRI document set, not the business
 * one), then employment type, then business constitution for the
 * self-employed/business case. Null means "only universal items apply" — e.g.
 * the applicant's profile isn't filled in yet, or is OTHER.
 */
export function resolveChecklistBucket(applicant: ApplicantProfile | undefined | null): ChecklistApplicantType | null {
  if (!applicant) return null;
  if (applicant.isNRI) return ChecklistApplicantType.NRI;
  if (applicant.employmentType === EmploymentType.SALARIED) return ChecklistApplicantType.SALARIED;
  if (applicant.employmentType === EmploymentType.PROFESSIONAL) {
    return ChecklistApplicantType.PROFESSIONAL;
  }
  if (
    applicant.employmentType === EmploymentType.SELF_EMPLOYED ||
    applicant.employmentType === EmploymentType.BUSINESS
  ) {
    switch (applicant.constitution) {
      case "PROPRIETORSHIP":
        return ChecklistApplicantType.PROPRIETORSHIP;
      case "PARTNERSHIP":
        return ChecklistApplicantType.PARTNERSHIP;
      case "PRIVATE_LIMITED":
        return ChecklistApplicantType.PRIVATE_LIMITED;
      case "LLP":
        return ChecklistApplicantType.LLP;
      default:
        return null;
    }
  }
  return null;
}

@Injectable()
export class ChecklistService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  /** The required-documents gap view for one application. */
  async forApplication(applicationId: string, user: AuthUser) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: {
        loanProductId: true,
        applicants: { where: { isPrimary: true }, take: 1 },
        documents: { select: { category: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const bucket = resolveChecklistBucket(application.applicants[0]);
    const uploadedCategories = new Set(application.documents.map((d) => d.category));

    const items = await this.prisma.checklistItem.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ loanProductId: null }, { loanProductId: application.loanProductId }] },
          bucket
            ? { OR: [{ applicantType: null }, { applicantType: bucket }] }
            : { applicantType: null },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });

    const result = items.map((i) => ({
      id: i.id,
      label: i.label,
      category: i.category,
      status: uploadedCategories.has(i.category) ? ("GIVEN" as const) : ("PENDING" as const),
    }));

    return {
      bucket,
      items: result,
      total: result.length,
      given: result.filter((i) => i.status === "GIVEN").length,
    };
  }

  findAll(query: { loanProductId?: string; applicantType?: ChecklistApplicantType }) {
    return this.prisma.checklistItem.findMany({
      where: {
        ...(query.loanProductId && { loanProductId: query.loanProductId }),
        ...(query.applicantType && { applicantType: query.applicantType }),
      },
      include: { loanProduct: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
  }

  async create(dto: CreateChecklistItemDto, user: AuthUser, ip?: string) {
    const item = await this.prisma.checklistItem.create({ data: { ...dto } });
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "ChecklistItem",
      entityId: item.id,
      entityLabel: item.label,
      ip,
    });
    return item;
  }

  async update(id: string, dto: UpdateChecklistItemDto, user: AuthUser, ip?: string) {
    const before = await this.prisma.checklistItem.findUniqueOrThrow({ where: { id } });
    const item = await this.prisma.checklistItem.update({ where: { id }, data: { ...dto } });
    await this.audit.recordUpdate({
      actor: user,
      entity: "ChecklistItem",
      entityId: id,
      entityLabel: item.label,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });
    return item;
  }

  async remove(id: string, user: AuthUser, ip?: string) {
    const item = await this.prisma.checklistItem.findUniqueOrThrow({ where: { id } });
    await this.prisma.checklistItem.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: AuditAction.DELETE,
      entity: "ChecklistItem",
      entityId: id,
      entityLabel: item.label,
      ip,
    });
    return { ok: true };
  }
}
