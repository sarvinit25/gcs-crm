import { Injectable, NotFoundException } from "@nestjs/common";
import { ChecklistApplicantType, EmploymentType, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";

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
  constructor(private prisma: PrismaService) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  /** The active document types that apply to a loan type and applicant bucket. */
  itemsFor(loanProductId: string, bucket: ChecklistApplicantType | null) {
    return this.prisma.documentType.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ loanProducts: { none: {} } }, { loanProducts: { some: { id: loanProductId } } }] },
          bucket
            ? { OR: [{ applicantTypes: { isEmpty: true } }, { applicantTypes: { has: bucket } }] }
            : { applicantTypes: { isEmpty: true } },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

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

    const items = await this.itemsFor(application.loanProductId, bucket);

    const result = items.map((i) => ({
      id: i.id,
      label: i.name,
      description: i.description,
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
}
