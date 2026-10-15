import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import type { DirectoryQuery, DirectoryType } from "./dto/id-directory.dto";

/** One line of the directory, whatever kind of record it is. */
export type DirectoryRow = {
  kind: "lead" | "application" | "partner";
  /** The record's own id, for opening its page. */
  id: string;
  /** The reference people quote: a lead number, an application number or a partner code. */
  gcsId: string;
  name: string;
  phone: string | null;
  status: string;
  /** The staff member who owns the lead or file, or who looks after the partner. */
  owner: string | null;
  /** The sourcing partner a lead came through, where there is one. */
  partner: string | null;
  /** What a client signs in with to track their file (applications only). */
  accessCode: string | null;
  createdAt: Date;
};

/**
 * One place to find every GCS reference: leads, client applications (with the code a client tracks them
 * with) and sourcing partners. Admin only. Each kind is searched on its own, so a page is always one kind.
 */
@Injectable()
export class IdDirectoryService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async summary() {
    const [leads, applications, partners] = await this.prisma.$transaction([
      this.prisma.lead.count(),
      this.prisma.application.count(),
      this.prisma.sourcingPartner.count(),
    ]);
    return { leads, applications, partners };
  }

  async list(query: DirectoryQuery) {
    const type: DirectoryType = query.type ?? "applications";
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const search = query.search?.trim() ?? "";
    const paging = { skip: (page - 1) * pageSize, take: pageSize };

    if (type === "leads") return this.leads(search, page, pageSize, paging);
    if (type === "partners") return this.partners(search, page, pageSize, paging);
    return this.applications(search, page, pageSize, paging);
  }

  /** "#23", "L-23" and "23" all mean lead number 23. */
  private numberIn(search: string): number | null {
    const m = search.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : null;
  }

  private async leads(search: string, page: number, pageSize: number, paging: { skip: number; take: number }) {
    const n = this.numberIn(search);
    const where: Prisma.LeadWhereInput = search
      ? {
          OR: [
            ...(n !== null && n < 2_147_483_647 ? [{ leadNo: n }] : []),
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paging,
        select: {
          id: true,
          leadNo: true,
          name: true,
          phone: true,
          status: true,
          createdAt: true,
          assignedOfficer: { select: { name: true } },
          sourcingPartner: { select: { name: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    const rows: DirectoryRow[] = items.map((l) => ({
      kind: "lead",
      id: l.id,
      gcsId: `#${l.leadNo}`,
      name: l.name,
      phone: l.phone,
      status: l.status,
      owner: l.assignedOfficer?.name ?? null,
      partner: l.sourcingPartner?.name ?? null,
      accessCode: null,
      createdAt: l.createdAt,
    }));
    return { items: rows, total, page, pageSize };
  }

  private async applications(search: string, page: number, pageSize: number, paging: { skip: number; take: number }) {
    const n = this.numberIn(search);
    const where: Prisma.ApplicationWhereInput = search
      ? {
          OR: [
            ...(n !== null && n < 2_147_483_647 ? [{ seq: n }] : []),
            { portalAccessCode: { contains: search, mode: "insensitive" } },
            { applicants: { some: { name: { contains: search, mode: "insensitive" } } } },
            { applicants: { some: { phone: { contains: search } } } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paging,
        select: {
          id: true,
          seq: true,
          status: true,
          createdAt: true,
          portalAccessCode: true,
          owner: { select: { name: true } },
          lead: { select: { sourcingPartner: { select: { name: true } } } },
          applicants: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    const rows: DirectoryRow[] = items.map((a) => ({
      kind: "application",
      id: a.id,
      gcsId: this.settings.applicationNo(a.seq, a.createdAt),
      name: a.applicants[0]?.name ?? "Applicant not named",
      phone: a.applicants[0]?.phone ?? null,
      status: a.status,
      owner: a.owner?.name ?? null,
      partner: a.lead?.sourcingPartner?.name ?? null,
      accessCode: a.portalAccessCode,
      createdAt: a.createdAt,
    }));
    return { items: rows, total, page, pageSize };
  }

  private async partners(search: string, page: number, pageSize: number, paging: { skip: number; take: number }) {
    const where: Prisma.SourcingPartnerWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { firm: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sourcingPartner.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paging,
        select: {
          id: true,
          code: true,
          name: true,
          firm: true,
          phone: true,
          active: true,
          createdAt: true,
          manager: { select: { name: true } },
        },
      }),
      this.prisma.sourcingPartner.count({ where }),
    ]);
    const rows: DirectoryRow[] = items.map((p) => ({
      kind: "partner",
      id: p.id,
      gcsId: p.code ?? "Not set",
      name: p.firm ? `${p.name} (${p.firm})` : p.name,
      phone: p.phone,
      status: p.active ? "Active" : "Inactive",
      owner: p.manager?.name ?? null,
      partner: null,
      accessCode: null,
      createdAt: p.createdAt,
    }));
    return { items: rows, total, page, pageSize };
  }
}
