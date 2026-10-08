import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditAction, WebsiteAd } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { StorageService } from "../documents/storage.service";
import { detectFile } from "../documents/file-sniff";
import { istDayEnd, istDayStart, istParts, parseYmd, ymd } from "../common/date.util";
import { CreateAdDto, UpdateAdDto } from "./dto/ads.dto";

/** A poster is shown over the whole page, so keep it small enough to load at once. */
export const MAX_AD_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type AdStatus = "LIVE" | "SCHEDULED" | "ENDED" | "PAUSED";

export function adStatus(ad: Pick<WebsiteAd, "paused" | "startsAt" | "endsAt">, now: Date = new Date()): AdStatus {
  if (ad.paused) return "PAUSED";
  if (now < ad.startsAt) return "SCHEDULED";
  if (now > ad.endsAt) return "ENDED";
  return "LIVE";
}

function dayRange(startsOn: string, endsOn: string) {
  const start = parseYmd(startsOn);
  const end = parseYmd(endsOn);
  if (!start || !end) throw new BadRequestException("Choose real start and end dates");
  const startsAt = istDayStart(start);
  const endsAt = istDayEnd(end);
  if (endsAt < startsAt) throw new BadRequestException("The end date cannot be before the start date");
  return { startsAt, endsAt };
}

@Injectable()
export class AdsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  private view(ad: WebsiteAd, now = new Date()) {
    const { imageKey: _key, ...rest } = ad;
    return {
      ...rest,
      status: adStatus(ad, now),
      startsOn: ymd(istParts(ad.startsAt)),
      endsOn: ymd(istParts(ad.endsAt)),
    };
  }

  async list() {
    const now = new Date();
    const ads = await this.prisma.websiteAd.findMany({ orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }] });
    return { items: ads.map((a) => this.view(a, now)) };
  }

  async create(file: Express.Multer.File | undefined, dto: CreateAdDto, user: AuthUser, ip?: string) {
    if (!file) throw new BadRequestException("Choose the poster image to upload");
    if (file.size > MAX_AD_BYTES) throw new PayloadTooLargeException("The poster must be 3 MB or smaller");
    const kind = detectFile(file.buffer);
    if (!kind || !IMAGE_TYPES.has(kind.mime)) throw new BadRequestException("The poster must be a PNG, JPG or WebP image");
    const { startsAt, endsAt } = dayRange(dto.startsOn, dto.endsOn);

    const imageKey = `website-ads/${randomUUID()}${kind.extension}`;
    await this.storage.put(imageKey, file.buffer, kind.mime);
    const ad = await this.prisma.websiteAd.create({
      data: {
        title: dto.title.trim(),
        imageKey,
        imageMime: kind.mime,
        imageSize: file.size,
        linkUrl: dto.linkUrl ?? null,
        startsAt,
        endsAt,
        createdById: user.id,
        createdByName: user.name,
      },
    });
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "WebsiteAd",
      entityId: ad.id,
      entityLabel: `${ad.title} · ${dto.startsOn} to ${dto.endsOn}`,
      ip,
    });
    return this.view(ad);
  }

  private async mustFind(id: string) {
    const ad = await this.prisma.websiteAd.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException("Ad not found");
    return ad;
  }

  async update(id: string, dto: UpdateAdDto, user: AuthUser, ip?: string) {
    const before = await this.mustFind(id);
    const dates =
      dto.startsOn || dto.endsOn
        ? dayRange(dto.startsOn ?? ymd(istParts(before.startsAt)), dto.endsOn ?? ymd(istParts(before.endsAt)))
        : {};
    const data = {
      title: dto.title?.trim(),
      linkUrl: dto.linkUrl,
      paused: dto.paused,
      ...dates,
    };
    const ad = await this.prisma.websiteAd.update({ where: { id }, data });
    await this.audit.recordUpdate({
      actor: user,
      entity: "WebsiteAd",
      entityId: id,
      entityLabel: ad.title,
      changes: diff(before, data),
      ip,
    });
    return this.view(ad);
  }

  async remove(id: string, user: AuthUser, ip?: string) {
    const ad = await this.mustFind(id);
    await this.prisma.websiteAd.delete({ where: { id } });
    await this.storage.remove(ad.imageKey).catch(() => undefined); // an orphaned file is harmless; a failed delete must not block
    await this.audit.record({ actor: user, action: AuditAction.DELETE, entity: "WebsiteAd", entityId: id, entityLabel: ad.title, ip });
    return { ok: true };
  }

  /** The poster for staff previews: any ad, whatever its dates. */
  async image(id: string) {
    const ad = await this.mustFind(id);
    return { body: await this.storage.get(ad.imageKey), mime: ad.imageMime };
  }

  /** What the public website shows right now: the running ad that started most recently, or none. */
  async live(now: Date = new Date()) {
    const ad = await this.prisma.websiteAd.findFirst({
      where: { paused: false, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    });
    if (!ad) return { ad: null };
    return {
      ad: {
        id: ad.id,
        title: ad.title,
        imagePath: `/public/website-ad/${ad.id}/image?v=${ad.updatedAt.getTime()}`,
        linkUrl: ad.linkUrl,
        endsAt: ad.endsAt,
      },
    };
  }

  /** Public image: only while the ad is actually running, so a scheduled poster is not exposed early. */
  async liveImage(id: string, now: Date = new Date()) {
    const ad = await this.prisma.websiteAd.findUnique({ where: { id } });
    if (!ad || adStatus(ad, now) !== "LIVE") throw new NotFoundException();
    return { body: await this.storage.get(ad.imageKey), mime: ad.imageMime };
  }
}
