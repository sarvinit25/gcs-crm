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

/**
 * Whether a line of the list counts as received. What staff ticked (or un-ticked) wins; a line nobody has touched keeps the
 * old guess: some uploaded file sits in the same category.
 */
export function statusFor(
  item: { id: string; category: string },
  marks: ReadonlyMap<string, boolean>,
  uploadedCategories: ReadonlySet<string>,
): "GIVEN" | "PENDING" {
  const marked = marks.get(item.id);
  if (marked !== undefined) return marked ? "GIVEN" : "PENDING";
  return uploadedCategories.has(item.category) ? "GIVEN" : "PENDING";
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
        checklistMarks: { select: { documentTypeId: true, given: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const bucket = resolveChecklistBucket(application.applicants[0]);
    const uploadedCategories = new Set(application.documents.map((d) => d.category));
    const marks = new Map(application.checklistMarks.map((m) => [m.documentTypeId, m.given]));

    const items = await this.itemsFor(application.loanProductId, bucket);

    const result = items.map((i) => ({
      id: i.id,
      label: i.name,
      description: i.description,
      category: i.category,
      status: statusFor(i, marks, uploadedCategories),
    }));

    return {
      bucket,
      items: result,
      total: result.length,
      given: result.filter((i) => i.status === "GIVEN").length,
    };
  }

  /**
   * Staff tick or un-tick one line of an application's list. Only a line that is actually on this application's list
   * can be marked, and an adviser can only touch their own applications. Returns the whole list as it now stands.
   */
  async setGiven(applicationId: string, documentTypeId: string, given: boolean, user: AuthUser) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { loanProductId: true, applicants: { where: { isPrimary: true }, take: 1 } },
    });
    if (!application) throw new NotFoundException("Application not found");

    const onTheList = await this.itemsFor(application.loanProductId, resolveChecklistBucket(application.applicants[0]));
    if (!onTheList.some((i) => i.id === documentTypeId)) throw new NotFoundException("That document is not on this application's list");

    await this.prisma.applicationChecklistMark.upsert({
      where: { applicationId_documentTypeId: { applicationId, documentTypeId } },
      create: { applicationId, documentTypeId, given, markedById: user.id },
      update: { given, markedById: user.id },
    });
    return this.forApplication(applicationId, user);
  }
}
