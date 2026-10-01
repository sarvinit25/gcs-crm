import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "./storage.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { detectFile, safeFileName } from "./file-sniff";

/** Hard ceiling for the multipart parser; the configured limit is checked below it. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  categories() {
    return this.settings.get<string[]>("documents.categories");
  }

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private async assertAccess(applicationId: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { id: true, seq: true, createdAt: true },
    });
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  async list(applicationId: string, user: AuthUser) {
    await this.assertAccess(applicationId, user);
    return this.prisma.document.findMany({
      where: { applicationId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    applicationId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    category: string,
    user: AuthUser,
    ip?: string,
  ) {
    await this.assertAccess(applicationId, user);

    // Judge the file by its contents, not by what the browser or the filename claims.
    const detected = detectFile(file.buffer);
    if (!detected) {
      throw new BadRequestException("Only PDF, JPG, PNG, WebP or HEIC files can be uploaded");
    }
    const maxMb = this.settings.get<number>("documents.maxUploadMb");
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`File is larger than ${maxMb}MB`);
    }

    // Random key, not the filename — two applicants both uploading "pan.pdf"
    // must not collide, and object keys should not leak applicant names. The
    // extension comes from the detected type, never from the uploaded name.
    const objectKey = `applications/${applicationId}/${randomUUID()}${detected.extension}`;
    const fileName = safeFileName(file.originalname, detected.extension);

    await this.storage.put(objectKey, file.buffer, detected.mime);

    const document = await this.prisma.document.create({
      data: {
        applicationId,
        category,
        fileName,
        objectKey,
        mimeType: detected.mime,
        sizeBytes: file.size,
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Document",
      entityId: document.id,
      entityLabel: fileName,
      changes: { category: { from: null, to: category } },
      ip,
    });

    return document;
  }

  async downloadUrl(applicationId: string, documentId: string, user: AuthUser) {
    await this.assertAccess(applicationId, user);
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, applicationId },
    });
    if (!doc) throw new NotFoundException("Document not found");

    const minutes = this.settings.get<number>("documents.downloadLinkMinutes");
    return {
      url: await this.storage.signedDownloadUrl(doc.objectKey, doc.fileName, minutes * 60, doc.mimeType),
    };
  }

  async remove(applicationId: string, documentId: string, user: AuthUser, ip?: string) {
    await this.assertAccess(applicationId, user);
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, applicationId },
    });
    if (!doc) throw new NotFoundException("Document not found");

    // Drop the database row first: an orphaned object costs pennies, but a row
    // pointing at a deleted file breaks every download that follows.
    await this.prisma.document.delete({ where: { id: documentId } });
    await this.storage.remove(doc.objectKey);

    await this.audit.record({
      actor: user,
      action: AuditAction.DELETE,
      entity: "Document",
      entityId: documentId,
      entityLabel: doc.fileName,
      ip,
    });

    return { ok: true };
  }
}
