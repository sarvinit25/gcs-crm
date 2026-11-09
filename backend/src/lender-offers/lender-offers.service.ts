import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuditAction, LenderType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { detectFile, safeFileName } from "../documents/file-sniff";
import { StorageService } from "../documents/storage.service";
import { LenderPoliciesService } from "../lender-policies/lender-policies.service";
import { OfferReaderService } from "./offer-reader.service";
import { bestLender, cleanPhone, mergeOffers, normalizeExtraction, type Extraction, type PolicyDraft } from "./offer-extraction";

const READABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const TODAY = () => new Date().toISOString().slice(0, 10);

type UploadedFile = { originalname: string; size: number; buffer: Buffer };

@Injectable()
export class LenderOffersService {
  private readonly log = new Logger("LenderOffers");

  constructor(
    private prisma: PrismaService,
    private reader: OfferReaderService,
    private storage: StorageService,
    private policies: LenderPoliciesService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private products() {
    return this.prisma.loanProduct.findMany({ where: { active: true }, select: { id: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } });
  }

  /** Reads each picture or PDF (one draft per file) and any pasted text (one more draft). Nothing is added to Lender match yet. */
  async create(files: UploadedFile[], text: string | undefined, actor: AuthUser) {
    const pasted = text?.trim();
    if (!files.length && !pasted) throw new BadRequestException("Choose a picture or PDF, or paste the message.");
    if (files.length > 10) throw new BadRequestException("Send at most 10 files at a time.");
    const products = await this.products();
    const made: string[] = [];

    for (const file of files) {
      const detected = detectFile(file.buffer);
      if (!detected || !READABLE.has(detected.mime)) throw new BadRequestException(`${file.originalname}: only PDF, JPG, PNG or WebP can be read. A phone photo in HEIC format should be sent as JPG.`);
      if (file.size > MAX_BYTES) throw new BadRequestException(`${file.originalname} is larger than 15MB.`);
      const extracted = await this.reader.read({ file: { buffer: file.buffer, mime: detected.mime, name: file.originalname } }, products);
      // The original is kept so a person can look at what was read; failing to keep it does not lose the reading.
      let objectKey: string | null = null;
      try {
        objectKey = `lender-offers/${randomUUID()}${detected.extension}`;
        await this.storage.put(objectKey, file.buffer, detected.mime);
      } catch (err) {
        this.log.error(`Could not keep the original of ${file.originalname}: ${(err as Error).message}`);
        objectKey = null;
      }
      made.push(await this.save({ source: "upload", fileName: safeFileName(file.originalname, detected.extension), objectKey, mimeType: detected.mime, sizeBytes: file.size, extracted }, actor));
    }
    if (pasted) {
      const extracted = await this.reader.read({ text: pasted }, products);
      made.push(await this.save({ source: "paste", rawText: pasted.slice(0, 20_000), extracted }, actor));
    }
    return Promise.all(made.map((id) => this.get(id)));
  }

  private async save(
    d: { source: string; fileName?: string; objectKey?: string | null; mimeType?: string; sizeBytes?: number; rawText?: string; extracted: Extraction },
    actor: AuthUser,
  ) {
    const row = await this.prisma.lenderOffer.create({
      data: {
        source: d.source,
        fileName: d.fileName,
        objectKey: d.objectKey ?? undefined,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        rawText: d.rawText,
        kind: d.extracted.kind,
        summary: d.extracted.summary || null,
        extracted: json(d.extracted),
        createdById: actor.id,
        createdByName: actor.name,
      },
    });
    await this.audit.record({ actor, action: AuditAction.CREATE, entity: "LenderOffer", entityId: row.id, entityLabel: d.fileName ?? "Pasted message" });
    return row.id;
  }

  async list(status?: string) {
    const rows = await this.prisma.lenderOffer.findMany({
      where: status ? { status } : { status: { not: "DISCARDED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, source: true, fileName: true, kind: true, summary: true, status: true, createdAt: true, createdByName: true, extracted: true },
    });
    return rows.map(({ extracted, ...r }) => {
      const x = extracted as unknown as Extraction;
      return { ...r, lenderName: x.lenderName, offerCount: x.offers?.length ?? 0 };
    });
  }

  async get(id: string) {
    const row = await this.prisma.lenderOffer.findUnique({ where: { id }, omit: { objectKey: true } });
    if (!row) throw new NotFoundException("Offer not found");
    const extracted = row.extracted as unknown as Extraction;
    const [lenders, products] = await Promise.all([
      this.prisma.lender.findMany({ select: { id: true, name: true, shortName: true, policies: { select: { loanProduct: { select: { slug: true } } } } } }),
      this.products(),
    ]);
    const match = bestLender(extracted.lenderName, lenders);
    const { policies, skipped } = mergeOffers(extracted.offers);
    const name = new Map(products.map((p) => [p.slug, p.name]));
    return {
      ...row,
      hasFile: Boolean(await this.prisma.lenderOffer.count({ where: { id, objectKey: { not: null } } })),
      lenderMatch: match ? { id: match.id, name: match.name } : null,
      preview: policies.map((p) => ({ ...p, productName: name.get(p.productSlug) ?? p.productSlug, exists: Boolean(match?.policies.some((x) => x.loanProduct.slug === p.productSlug)) })),
      skipped,
      lenders: lenders.map((l) => ({ id: l.id, name: l.name })).sort((a, b) => a.name.localeCompare(b.name)),
      products: products.map((p) => ({ slug: p.slug, name: p.name })),
    };
  }

  /** A person's corrections to what was read. Only a draft can be edited. */
  async update(id: string, body: unknown, actor: AuthUser) {
    const row = await this.draft(id);
    const products = await this.products();
    const extracted = normalizeExtraction(body, new Set(products.map((p) => p.slug)));
    // The reader decided what kind of page this was; a person may change it, but never invent offers on a non-lender page.
    await this.prisma.lenderOffer.update({ where: { id: row.id }, data: { extracted: json(extracted), kind: extracted.kind, summary: extracted.summary || null } });
    await this.audit.record({ actor, action: AuditAction.UPDATE, entity: "LenderOffer", entityId: id, entityLabel: row.fileName ?? "Pasted message" });
    return this.get(id);
  }

  private async draft(id: string) {
    const row = await this.prisma.lenderOffer.findUnique({ where: { id }, select: { id: true, status: true, fileName: true, source: true, extracted: true, createdAt: true } });
    if (!row) throw new NotFoundException("Offer not found");
    if (row.status !== "DRAFT") throw new ConflictException(row.status === "APPLIED" ? "This offer has already been added to Lender match." : "This offer was discarded.");
    return row;
  }

  async discard(id: string, actor: AuthUser) {
    const row = await this.draft(id);
    await this.prisma.lenderOffer.update({ where: { id }, data: { status: "DISCARDED" } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "LenderOffer", entityId: id, entityLabel: row.fileName ?? "Pasted message" });
    return { ok: true };
  }

  async fileUrl(id: string) {
    const row = await this.prisma.lenderOffer.findUnique({ where: { id }, select: { objectKey: true, fileName: true, mimeType: true } });
    if (!row?.objectKey) throw new NotFoundException("The original file was not kept");
    const minutes = this.settings.get<number>("documents.downloadLinkMinutes");
    return { url: await this.storage.signedDownloadUrl(row.objectKey, row.fileName ?? "flyer", minutes * 60, row.mimeType ?? undefined) };
  }

  /**
   * Adds the reviewed terms to Lender match: finds or creates the lender, saves the people to call, and creates or updates one
   * policy per loan type. Policies from a flyer are never marked verified: the matcher keeps sending those to a person until
   * someone checks them against the lender.
   */
  async apply(id: string, body: { lenderId?: string; newLenderName?: string }, actor: AuthUser, ip?: string) {
    const row = await this.draft(id);
    const x = row.extracted as unknown as Extraction;
    if (x.kind !== "LENDER_OFFER") throw new BadRequestException("This is not a lender's offer, so there is nothing to add to Lender match.");
    const { policies, skipped } = mergeOffers(x.offers);
    if (!policies.length) throw new BadRequestException("None of the products on this page match a loan type we offer. Pick a loan type for each product first.");

    const lender = await this.resolveLender(body, x);
    const products = await this.products();
    const idOf = new Map(products.map((p) => [p.slug, p]));
    const source = `Flyer reading: ${row.fileName ?? "pasted message"} (${TODAY()})`;
    const created: string[] = [];
    const updated: string[] = [];

    for (const p of policies) {
      const product = idOf.get(p.productSlug)!;
      const existing = await this.prisma.lenderPolicy.findUnique({ where: { lenderId_loanProductId: { lenderId: lender.id, loanProductId: product.id } } });
      if (existing) {
        await this.policies.update(existing.id, { ...this.fields(p, existing.notes), source, reason: `Terms from ${source}` }, actor, ip);
        // The terms changed on the strength of a flyer: it needs checking again before the matcher trusts it.
        await this.prisma.lenderPolicy.update({ where: { id: existing.id }, data: { lastVerifiedAt: null, verifiedById: null, verifiedByName: null } });
        updated.push(product.name);
      } else {
        await this.policies.create({ ...this.fields(p, null), source, lenderId: lender.id, loanProductId: product.id }, actor, ip);
        created.push(product.name);
      }
    }
    const contacts = await this.saveContacts(lender.id, x, policies.map((p) => idOf.get(p.productSlug)!.name));
    await this.prisma.lenderOffer.update({ where: { id }, data: { status: "APPLIED", appliedLenderId: lender.id } });
    await this.audit.record({ actor, action: AuditAction.UPDATE, entity: "LenderOffer", entityId: id, entityLabel: `Added to ${lender.name}`, ip });
    return { lender: { id: lender.id, name: lender.name, isNew: lender.isNew }, created, updated, contactsAdded: contacts, skippedProducts: skipped };
  }

  /** Only values the flyer actually gave: a blank never wipes out something already known. */
  private fields(p: PolicyDraft, existingNotes: string | null) {
    const out: Record<string, unknown> = { gstRequired: p.gstRequired, allIndia: p.allIndia };
    const set = (k: string, v: unknown) => { if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v; };
    for (const k of ["minAmount", "maxAmount", "minRate", "maxRate", "minTenureMonths", "maxTenureMonths", "rateType", "processingFee", "specialScheme", "minCreditScore"] as const) set(k, p[k]);
    set("employmentTypes", p.employmentTypes);
    set("cities", p.cities);
    const notes = [existingNotes, p.notes ? `From flyer ${TODAY()}: ${p.notes}` : null].filter(Boolean).join("\n").slice(0, 1000);
    if (notes) out.notes = notes;
    return out;
  }

  private async resolveLender(body: { lenderId?: string; newLenderName?: string }, x: Extraction): Promise<{ id: string; name: string; isNew: boolean }> {
    if (body.lenderId) {
      const l = await this.prisma.lender.findUnique({ where: { id: body.lenderId }, select: { id: true, name: true } });
      if (!l) throw new NotFoundException("That lender no longer exists");
      return { ...l, isNew: false };
    }
    const name = (body.newLenderName ?? x.lenderName ?? "").trim().slice(0, 120);
    if (name.length < 2) throw new BadRequestException("Choose a lender, or give the new lender's name.");
    const all = await this.prisma.lender.findMany({ select: { id: true, name: true, shortName: true } });
    const same = all.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? bestLender(name, all);
    if (same) return { id: same.id, name: same.name, isNew: false };
    const made = await this.prisma.lender.create({
      data: {
        name,
        type: x.lenderType === "BANK" ? LenderType.BANK : LenderType.NBFC,
        // A lender added from a flyer is for our own use until someone decides to show it on the website.
        isPublic: false,
        portalUrl: x.website?.startsWith("http") ? x.website.slice(0, 200) : undefined,
        notes: `Added from a flyer on ${TODAY()}.${x.website && !x.website.startsWith("http") ? ` Website: ${x.website}` : ""}`,
      },
    });
    return { id: made.id, name: made.name, isNew: true };
  }

  private async saveContacts(lenderId: string, x: Extraction, segments: string[]) {
    if (!x.contacts.length) return 0;
    const have = await this.prisma.lenderContact.findMany({ where: { lenderId }, select: { phone: true, email: true } });
    const phones = new Set(have.map((c) => cleanPhone(c.phone)).filter(Boolean));
    const emails = new Set(have.map((c) => c.email?.toLowerCase()).filter(Boolean));
    let added = 0;
    for (const c of x.contacts) {
      if ((c.phone && phones.has(c.phone)) || (c.email && emails.has(c.email))) continue;
      await this.prisma.lenderContact.create({
        data: { lenderId, name: c.name ?? "Contact from flyer", designation: c.designation, phone: c.phone, email: c.email, segments, notes: `From a flyer on ${TODAY()}` },
      });
      added += 1;
    }
    return added;
  }
}
