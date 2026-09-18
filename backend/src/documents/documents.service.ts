import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "./storage.service";
import type { AuthUser } from "../auth/auth.decorators";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** KYC and loan files are scans and statements, not arbitrary uploads. */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export const DOCUMENT_CATEGORIES = [
  "KYC",
  "Income proof",
  "Bank statement",
  "Property papers",
  "Business proof",
  "Sanction letter",
  "Other",
];

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

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

    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`${file.mimetype} is not an accepted document type`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException("File is larger than 15MB");
    }

    // Random key, not the filename — two applicants both uploading "pan.pdf"
    // must not collide, and object keys should not leak applicant names.
    const extension = file.originalname.includes(".")
      ? file.originalname.slice(file.originalname.lastIndexOf("."))
      : "";
    const objectKey = `applications/${applicationId}/${randomUUID()}${extension}`;

    await this.storage.put(objectKey, file.buffer, file.mimetype);

    const document = await this.prisma.document.create({
      data: {
        applicationId,
        category,
        fileName: file.originalname,
        objectKey,
        mimeType: file.mimetype,
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
      entityLabel: file.originalname,
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

    return { url: await this.storage.signedDownloadUrl(doc.objectKey, doc.fileName) };
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
