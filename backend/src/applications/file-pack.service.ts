import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuditAction, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "../documents/storage.service";
import { compressFile } from "../documents/file-compress";
import { CamService } from "../cam/cam.service";
import type { AuthUser } from "../auth/auth.decorators";
import { reportBlocks, type ReportData } from "./file-report";
import { pdf } from "./simple-pdf";
import { zip, type ZipEntry } from "./zip";

/** The whole pack is built in memory, so it is held to a size the server can carry. */
const MAX_PACK_BYTES = 400 * 1024 * 1024;

const tidy = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "") || "file";

/** A path inside the pack for a document, never the same twice. A file that changed type when it was shrunk gets the right ending. */
export function packPath(category: string, fileName: string, type: string, used: Set<string>): string {
  const ending = type === "image/jpeg" ? ".jpg" : null;
  const dot = fileName.lastIndexOf(".");
  const base = tidy(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 100);
  const ext = ending && !/\.jpe?g$/i.test(fileName) ? ending : dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const folder = `Documents/${tidy(category)}`;
  let path = `${folder}/${base}${ext}`;
  for (let n = 2; used.has(path.toLowerCase()); n++) path = `${folder}/${base} (${n})${ext}`;
  used.add(path.toLowerCase());
  return path;
}

@Injectable()
export class FilePackService {
  private readonly logger = new Logger(FilePackService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private storage: StorageService,
    private cam: CamService,
  ) {}

  private async gather(id: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id, ...(user.role === Role.ADVISOR ? { ownerId: user.id } : {}) },
      include: {
        loanProduct: { select: { name: true } },
        lender: { select: { name: true } },
        owner: { select: { name: true } },
        lead: { select: { id: true, leadNo: true, createdAt: true, source: true, notes: true } },
        applicants: { orderBy: { isPrimary: "desc" }, include: { creditChecks: { where: { kind: { not: "SIMULATED" } }, orderBy: { createdAt: "asc" } } } },
        references: true,
        existingLoans: { orderBy: { createdAt: "asc" } },
        creditEvaluation: true,
        sanction: true,
        disbursements: { orderBy: { disbursedAt: "asc" } },
        invites: { orderBy: { createdAt: "asc" }, select: { createdAt: true, submittedAt: true } },
        documents: { orderBy: [{ category: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!app) throw new NotFoundException("Application not found");
    const [history, run] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { entity: "Application", entityId: id }, orderBy: { createdAt: "asc" }, select: { createdAt: true, actorName: true, changes: true } }),
      app.leadId ? this.prisma.matchRun.findFirst({ where: { leadId: app.leadId }, orderBy: { createdAt: "desc" } }) : null,
    ]);
    const results = run ? (Array.isArray(run.results) ? run.results : (run.results as { results?: unknown[] } | null)?.results) : null;
    const applicationNo = this.settings.applicationNo(app.seq, app.createdAt);
    const data: Omit<ReportData, "documents" | "missing"> = {
      company: { name: this.settings.get<string>("org.name"), phone: this.settings.get<string>("org.phone"), email: this.settings.get<string>("org.email") },
      applicationNo,
      generatedBy: user.name,
      generatedAt: new Date(),
      app: app as unknown as ReportData["app"],
      history,
      match: run && Array.isArray(results) ? { createdAt: run.createdAt, results: results as NonNullable<ReportData["match"]>["results"] } : null,
    };
    return { app, data, applicationNo, name: app.applicants[0]?.name ?? "" };
  }

  private async log(id: string, label: string, user: AuthUser, what: string, ip?: string) {
    await this.audit.record({ actor: user, action: AuditAction.CREATE, entity: "FileDownload", entityId: id, entityLabel: `${label} · ${what} downloaded`, ip });
  }

  /** The report alone, as a PDF. */
  async report(id: string, user: AuthUser, ip?: string) {
    const { app, data, applicationNo } = await this.gather(id, user);
    const documents = app.documents.map((d) => ({ category: d.category, path: d.fileName, createdAt: d.createdAt }));
    const buffer = pdf(reportBlocks({ ...data, documents, missing: [] }));
    await this.log(id, applicationNo, user, "report", ip);
    return { buffer, fileName: `${applicationNo} report.pdf` };
  }

  /** The report, the CAM workbook and every document, in one ZIP, each file as small as it can be while still clear. */
  async pack(id: string, user: AuthUser, ip?: string) {
    const { app, data, applicationNo, name } = await this.gather(id, user);
    if (app.documents.reduce((s, d) => s + d.sizeBytes, 0) > MAX_PACK_BYTES) throw new BadRequestException("The documents on this file are too large to pack into one download");

    const entries: ZipEntry[] = [];
    const documents: ReportData["documents"] = [];
    const missing: string[] = [];
    const used = new Set<string>();
    // One at a time: shrinking large scans together would exhaust the server.
    for (const d of app.documents) {
      try {
        const original = await this.storage.get(d.objectKey);
        const out = await compressFile(original, d.mimeType);
        const path = packPath(d.category, d.fileName, out.contentType, used);
        entries.push({ name: path, data: out.body });
        documents.push({ category: d.category, path: path.slice(path.lastIndexOf("/") + 1), createdAt: d.createdAt });
      } catch (e) {
        this.logger.warn(`Could not pack ${d.id}: ${(e as Error).message}`);
        missing.push(d.fileName);
      }
    }
    if (app.lead) {
      try {
        entries.push({ name: "CAM.xlsx", data: Buffer.from((await this.cam.exportXlsx(app.lead.id, user)).buffer) });
      } catch (e) {
        this.logger.warn(`No CAM in the pack of ${applicationNo}: ${(e as Error).message}`);
        missing.push("CAM workbook");
      }
    }
    entries.unshift({ name: "Report.pdf", data: pdf(reportBlocks({ ...data, documents, missing })) });
    const buffer = zip(entries);
    await this.log(id, applicationNo, user, "file pack", ip);
    return { buffer, fileName: `${tidy(`${applicationNo} ${name}`)}.zip` };
  }
}
