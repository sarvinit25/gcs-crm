import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { detectFile, safeFileName } from "../documents/file-sniff";
import { istToday } from "../common/date.util";
import type { AuthUser } from "../auth/auth.decorators";
import { assertTestimonials } from "../site-content/site-content.controller";
import { readSubmission } from "./testimonial-input";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_WAITING = 200;

/**
 * Client testimonials sent from the public form. They wait here, private, until staff approve. Approving adds the story to
 * the website's client stories as HIDDEN, with the client's consent already on record, so a person still decides to show it.
 */
@Injectable()
export class TestimonialsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private alerts: AlertsService,
  ) {}

  /** The public form. Returns the same quiet "ok" for a bot as for a person, so a bot learns nothing. */
  async submit(body: Record<string, unknown>, photo: { buffer: Buffer; size: number } | undefined, ip?: string) {
    let photoMime: string | null = null;
    if (photo?.buffer?.length) {
      if (photo.size > MAX_PHOTO_BYTES) throw new PayloadTooLargeException("Please choose a photo under 4 MB.");
      const kind = detectFile(photo.buffer);
      if (!kind || !PHOTO_TYPES.has(kind.mime)) throw new BadRequestException("The photo must be a JPG, PNG or WebP picture.");
      photoMime = kind.mime;
    }
    const read = readSubmission(body, photoMime !== null);
    if ("spam" in read) return { ok: true };
    if ("error" in read) throw new BadRequestException(read.error);
    if ((await this.prisma.testimonialSubmission.count({ where: { status: "PENDING" } })) >= MAX_WAITING) {
      throw new ServiceUnavailableException("We cannot take more right now. Please try again in a few days, or send it to us on WhatsApp.");
    }
    const v = read.value;
    await this.prisma.testimonialSubmission.create({
      data: {
        name: v.name, city: v.city, product: v.product, role: v.role, contact: v.contact, rating: v.rating, quote: v.quote,
        consentWords: true, consentPhoto: v.consentPhoto, signedName: v.signedName,
        // A photo the client did not agree to share is not kept at all.
        ...(photoMime && v.consentPhoto && photo ? { photoMime, photoData: new Uint8Array(photo.buffer) } : {}),
        ip: ip?.slice(0, 64) ?? null,
      },
    });
    // The team is told, but the client never waits for the email and a mail problem never fails their submission.
    void this.alerts.newTestimonial({ name: v.name, rating: v.rating, city: v.city, product: v.product, role: v.role, quote: v.quote, hasPhoto: photoMime !== null, photoOk: v.consentPhoto, contact: v.contact });
    return { ok: true };
  }

  /** How many are waiting, for the badge on the Website menu item. */
  async pendingCount() {
    return { pending: await this.prisma.testimonialSubmission.count({ where: { status: "PENDING" } }) };
  }

  async list() {
    const rows = await this.prisma.testimonialSubmission.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: { id: true, name: true, city: true, product: true, role: true, contact: true, rating: true, quote: true, consentPhoto: true, signedName: true, status: true, createdAt: true, reviewedByName: true, reviewedAt: true, photoMime: true },
    });
    const pending = rows.filter((r) => r.status === "PENDING");
    const rest = rows.filter((r) => r.status !== "PENDING");
    return { pendingCount: pending.length, items: [...pending, ...rest].map(({ photoMime, ...r }) => ({ ...r, hasPhoto: photoMime !== null })) };
  }

  async photo(id: string) {
    const row = await this.prisma.testimonialSubmission.findUnique({ where: { id }, select: { photoData: true, photoMime: true } });
    if (!row?.photoData || !row.photoMime) throw new NotFoundException("No photo");
    return { buffer: Buffer.from(row.photoData), mime: row.photoMime };
  }

  async approve(id: string, user: AuthUser, ip?: string) {
    const sub = await this.prisma.testimonialSubmission.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException("Submission not found");
    if (sub.status !== "PENDING") throw new BadRequestException("This one was already dealt with.");

    const story = await this.prisma.$transaction(async (tx) => {
      let photo: string | undefined;
      if (sub.photoData && sub.photoMime && sub.consentPhoto) {
        const ext = sub.photoMime === "image/png" ? ".png" : sub.photoMime === "image/webp" ? ".webp" : ".jpg";
        const img = await tx.siteImage.create({ data: { name: safeFileName(`testimonial-${sub.name}`, ext), mime: sub.photoMime, data: sub.photoData, createdByName: user.name }, select: { id: true } });
        photo = `/public/site-images/${img.id}`;
      }
      const row = await tx.siteContent.findUnique({ where: { key: "testimonials" } });
      const list = Array.isArray(row?.value) ? (row!.value as unknown[]) : [];
      const made = {
        name: sub.name, city: sub.city ?? "", product: sub.product ?? "", rating: sub.rating, quote: sub.quote,
        ...(sub.role ? { role: sub.role } : {}),
        // Hidden until a person chooses to show it.
        visible: false,
        ...(photo ? { photo } : {}),
        consent: {
          given: true,
          photoOk: Boolean(photo),
          how: "Online form",
          date: istToday(),
          note: `Sent through the online form on ${sub.createdAt.toISOString().slice(0, 10)} and signed as "${sub.signedName}".${sub.contact ? ` Contact: ${sub.contact}.` : ""}`,
        },
      };
      const next = [...list, made];
      assertTestimonials(next);
      await tx.siteContent.upsert({ where: { key: "testimonials" }, update: { value: next as Prisma.InputJsonValue, updatedByName: user.name }, create: { key: "testimonials", value: next as Prisma.InputJsonValue, updatedByName: user.name } });
      await tx.siteContentVersion.create({ data: { key: "testimonials", value: next as Prisma.InputJsonValue, savedByName: user.name } });
      // The picture now lives with the story; the private copy is not kept.
      await tx.testimonialSubmission.update({ where: { id }, data: { status: "APPROVED", reviewedByName: user.name, reviewedAt: new Date(), photoData: null } });
      return made;
    });
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Testimonial", entityId: id, entityLabel: `${sub.name} · approved as a hidden story`, ip });
    return { story };
  }

  async reject(id: string, user: AuthUser, ip?: string) {
    const sub = await this.prisma.testimonialSubmission.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!sub) throw new NotFoundException("Submission not found");
    if (sub.status !== "PENDING") throw new BadRequestException("This one was already dealt with.");
    await this.prisma.testimonialSubmission.update({ where: { id }, data: { status: "REJECTED", reviewedByName: user.name, reviewedAt: new Date(), photoData: null } });
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Testimonial", entityId: id, entityLabel: `${sub.name} · not used`, ip });
    return { ok: true };
  }
}
