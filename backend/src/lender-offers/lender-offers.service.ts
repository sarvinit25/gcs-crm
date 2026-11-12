import { createHash, randomUUID } from "crypto";
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
import { isDocx, isOldWord, readDocx } from "./docx-text";
import { isXlsx, readXlsx } from "./xlsx-text";
import { PolicySheetService } from "../lender-policies/policy-sheet.service";
import { SHEET_FIELDS, type SheetData } from "../lender-policies/policy-sheet-schema";
import { bestLender, cleanPhone, fillContact, mergeIntoPolicy, mergeOffers, normalizedForHash, normalizeExtraction, offerEnded, type ExistingPolicy, type Extraction, type PolicyDraft } from "./offer-extraction";

const READABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// No everyday limit: big scanned PDFs are normal here. Only what the reader itself can take (about 40 MB a file) stops a file.
const MAX_BYTES = 40 * 1024 * 1024;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const TODAY = () => new Date().toISOString().slice(0, 10);

type UploadedFile = { originalname: string; size: number; buffer: Buffer };

/** A stored policy, in the plain-number shape the merge works with. */
function existingOf(p: Prisma.LenderPolicyGetPayload<object>): ExistingPolicy {
  const n = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
  return {
    minAmount: n(p.minAmount), maxAmount: n(p.maxAmount), minRate: n(p.minRate), maxRate: n(p.maxRate),
    minTenureMonths: p.minTenureMonths, maxTenureMonths: p.maxTenureMonths, rateType: p.rateType, processingFee: p.processingFee,
    specialScheme: p.specialScheme, employmentTypes: p.employmentTypes, cities: p.cities, gstRequired: p.gstRequired,
    allIndia: p.allIndia, minCreditScore: p.minCreditScore, notes: p.notes,
  };
}

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
    private sheets: PolicySheetService,
  ) {}

  private products() {
    return this.prisma.loanProduct.findMany({ where: { active: true }, select: { id: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } });
  }

  /** Reads each picture or PDF (one draft per file) and any pasted text (one more draft). Nothing is added to Lender match yet. */
  async create(files: UploadedFile[], text: string | undefined, actor: AuthUser) {
    const pasted = text?.trim();
    if (!files.length && !pasted) throw new BadRequestException("Choose a picture, PDF or Word file, or paste the message.");
    if (files.length > 20) throw new BadRequestException("Send at most 20 files at a time.");
    const products = await this.products();
    const made: { id: string; duplicate?: boolean }[] = [];
    // Pages of one document sent together: a page that does not name the lender belongs to the one before it.
    let previous: Extraction | null = null;

    for (const file of files) {
      if (isOldWord(file.buffer) && /\.xls$/i.test(file.originalname)) throw new BadRequestException(`${file.originalname} is an old-style Excel file (.xls). Save it as .xlsx and send that.`);
      if (isOldWord(file.buffer)) throw new BadRequestException(`${file.originalname} is an old-style Word file (.doc). Save it as .docx or PDF and send that.`);
      const word = isDocx(file.buffer);
      const sheet = !word && isXlsx(file.buffer);
      const detected = word ? { mime: DOCX, extension: ".docx" } : sheet ? { mime: XLSX, extension: ".xlsx" } : detectFile(file.buffer);
      if (!detected || (!word && !sheet && !READABLE.has(detected.mime))) throw new BadRequestException(`${file.originalname}: only PDF, Word (.docx), Excel (.xlsx), JPG, PNG or WebP can be read. A phone photo in HEIC format should be sent as JPG.`);
      if (file.size > MAX_BYTES) throw new BadRequestException(`${file.originalname} is larger than the reader can take (40 MB). Split it into two or three parts and send them together.`);
      // The same file put in twice is recognised and not read again (it would only make a copy).
      const contentHash = createHash("sha256").update(file.buffer).digest("hex");
      const repeat = await this.repeatOf(contentHash);
      if (repeat) { made.push({ id: repeat, duplicate: true }); continue; }
      let extracted: Extraction;
      if (sheet) {
        // Excel: every sheet as rows of text.
        const text = readXlsx(file.buffer);
        if (!text.trim()) throw new BadRequestException(`${file.originalname} has no cells with text that can be read.`);
        extracted = await this.reader.read({ text }, products);
      } else if (word) {
        // Word: its text, plus any pictures on the page (a flyer saved in Word is often just an image).
        const doc = readDocx(file.buffer);
        if (!doc.text && !doc.images.length) throw new BadRequestException(`${file.originalname} has no text or pictures that can be read.`);
        extracted = await this.reader.read({ text: doc.text || undefined, images: doc.images }, products);
      } else {
        extracted = await this.reader.read({ file: { buffer: file.buffer, mime: detected.mime, name: file.originalname } }, products);
      }
      if (previous?.lenderName && !extracted.lenderName) {
        extracted = { ...extracted, lenderName: previous.lenderName, lenderType: extracted.lenderType ?? previous.lenderType };
      }
      if (extracted.lenderName) previous = extracted;
      // The original is kept so a person can look at what was read; failing to keep it does not lose the reading.
      let objectKey: string | null = null;
      try {
        objectKey = `lender-offers/${randomUUID()}${detected.extension}`;
        await this.storage.put(objectKey, file.buffer, detected.mime);
      } catch (err) {
        this.log.error(`Could not keep the original of ${file.originalname}: ${(err as Error).message}`);
        objectKey = null;
      }
      const id = await this.save({ source: "upload", fileName: safeFileName(file.originalname, detected.extension), objectKey, mimeType: detected.mime, sizeBytes: file.size, extracted, contentHash }, actor);
      await this.autoAdd(id, actor);
      made.push({ id });
    }
    if (pasted) {
      const contentHash = createHash("sha256").update(normalizedForHash(pasted)).digest("hex");
      const repeat = await this.repeatOf(contentHash);
      if (repeat) {
        made.push({ id: repeat, duplicate: true });
      } else {
        const extracted = await this.reader.read({ text: pasted }, products);
        const id = await this.save({ source: "paste", rawText: pasted.slice(0, 20_000), extracted, contentHash }, actor);
        await this.autoAdd(id, actor);
        made.push({ id });
      }
    }
    return Promise.all(made.map(async (m) => ({ ...(await this.get(m.id)), duplicate: Boolean(m.duplicate) })));
  }

  /** An earlier reading of exactly the same file or text (one that was not thrown away). */
  private async repeatOf(contentHash: string) {
    const found = await this.prisma.lenderOffer.findFirst({ where: { contentHash, status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return found?.id ?? null;
  }

  /**
   * When the lender on a flyer is already in the CRM, its terms are added to that lender at once (if the switch under
   * Settings is on). A lender we do not know yet always waits for a person to look, so a misread name never makes a lender.
   */
  private async autoAdd(id: string, actor: AuthUser) {
    if (this.settings.get<boolean>("lenderOffers.autoAdd") === false) return;
    try {
      const row = await this.prisma.lenderOffer.findUnique({ where: { id }, select: { extracted: true } });
      const x = row?.extracted as unknown as Extraction | undefined;
      const hasSheet = Object.keys(x?.sheet ?? {}).length > 0;
      if (!x || x.kind !== "LENDER_OFFER" || (!mergeOffers(x.offers).policies.length && !hasSheet)) return;
      // An offer that has already ended is for a person to look at, not to put into the matcher.
      if (offerEnded(x.validTill, TODAY())) return;
      const lenders = await this.prisma.lender.findMany({ select: { id: true, name: true, shortName: true } });
      const match = bestLender(x.lenderName, lenders);
      if (match) await this.apply(id, { lenderId: match.id }, actor);
    } catch (err) {
      this.log.warn(`A reading was not added automatically, so it waits for review: ${(err as Error).message}`);
    }
  }

  private async save(
    d: { source: string; fileName?: string; objectKey?: string | null; mimeType?: string; sizeBytes?: number; rawText?: string; extracted: Extraction; contentHash?: string },
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
        contentHash: d.contentHash,
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

  async list(status?: string, lenderId?: string) {
    const rows = await this.prisma.lenderOffer.findMany({
      where: { ...(status ? { status } : { status: { not: "DISCARDED" } }), ...(lenderId ? { appliedLenderId: lenderId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, source: true, fileName: true, kind: true, summary: true, status: true, createdAt: true, createdByName: true, extracted: true, objectKey: true, appliedLenderId: true },
    });
    return rows.map(({ extracted, objectKey, ...r }) => {
      const x = extracted as unknown as Extraction;
      return { ...r, hasFile: Boolean(objectKey), lenderName: x.lenderName, offerCount: x.offers?.length ?? 0, sheetCount: Object.keys(x.sheet ?? {}).length };
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
    const merged = mergeOffers(extracted.offers);
    const { policies } = merged;
    const skipped = merged.skipped + merged.empty;
    const name = new Map(products.map((p) => [p.slug, p.name]));
    const held = match ? await this.prisma.lenderPolicy.findMany({ where: { lenderId: match.id }, include: { loanProduct: { select: { slug: true } } } }) : [];
    return {
      ...row,
      hasFile: Boolean(await this.prisma.lenderOffer.count({ where: { id, objectKey: { not: null } } })),
      lenderMatch: match ? { id: match.id, name: match.name } : null,
      // the one-pager details the page states, named in words for the review screen
      sheetFound: SHEET_FIELDS.filter((f) => (extracted.sheet ?? {})[f.key] !== undefined).map((f) => f.label),
      preview: policies.map((p) => {
        const have = held.find((h) => h.loanProduct.slug === p.productSlug);
        return { ...p, productName: name.get(p.productSlug) ?? p.productSlug, exists: Boolean(have), changes: have ? mergeIntoPolicy(existingOf(have), p, TODAY()).changes : [] };
      }),
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

  /** The original file's bytes, for showing it beside the reading. */
  async fileContent(id: string) {
    const row = await this.prisma.lenderOffer.findUnique({ where: { id }, select: { objectKey: true, fileName: true, mimeType: true } });
    if (!row?.objectKey) throw new NotFoundException("The original file was not kept");
    return { buffer: await this.storage.get(row.objectKey), mime: row.mimeType ?? "application/octet-stream", name: row.fileName ?? "flyer" };
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
    const merged0 = mergeOffers(x.offers);
    const skipped = merged0.skipped + merged0.empty;
    // The date the flyer says the offer holds till goes into each policy's notes, so nobody takes it for open-ended.
    const policies = merged0.policies.map((p) => (x.validTill ? { ...p, notes: [p.notes, `offer valid till ${x.validTill}`].filter(Boolean).join("; ").slice(0, 900) } : p));
    if (!policies.length && !Object.keys(x.sheet ?? {}).length) throw new BadRequestException("There is nothing here to add: no product has a loan type we offer together with figures or conditions to record. Pick a loan type for each product, or fill in what the page says.");

    const lender = await this.resolveLender(body, x);
    const products = await this.products();
    const idOf = new Map(products.map((p) => [p.slug, p]));
    const source = `Flyer reading: ${row.fileName ?? "pasted message"} (${TODAY()})`;
    const created: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];
    const changes: { product: string; items: string[] }[] = [];

    for (const p of policies) {
      const product = idOf.get(p.productSlug)!;
      const existing = await this.prisma.lenderPolicy.findUnique({ where: { lenderId_loanProductId: { lenderId: lender.id, loanProductId: product.id } } });
      if (existing) {
        // The lender already has this loan type: what the flyer says is added to it. Ranges only widen, lists only gain entries,
        // and nothing the flyer repeats is written twice.
        const merged = mergeIntoPolicy(existingOf(existing), p, TODAY());
        if (!merged.changes.length) { unchanged.push(product.name); continue; }
        const trail = existing.source && !existing.source.startsWith("Flyer reading") ? `${existing.source}; ${source}`.slice(0, 300) : source;
        await this.policies.update(existing.id, { ...merged.fields, source: trail, reason: `Added from ${source}` }, actor, ip);
        // The terms changed on the strength of a flyer: it needs checking again before the matcher trusts it.
        await this.prisma.lenderPolicy.update({ where: { id: existing.id }, data: { lastVerifiedAt: null, verifiedById: null, verifiedByName: null } });
        updated.push(product.name);
        changes.push({ product: product.name, items: merged.changes });
      } else {
        await this.policies.create({ ...this.fields(p), source, lenderId: lender.id, loanProductId: product.id }, actor, ip);
        created.push(product.name);
      }
    }
    const lenderFilled = lender.isNew ? [] : await this.fillLender(lender.id, x);
    // the standard policy one-pager: only blanks are filled, so nothing a person entered is overwritten
    // the first person named on the page is the one-pager's contact, unless the page's own one-pager details say otherwise
    const c0 = x.contacts?.[0];
    const fromContact: SheetData = { ...(c0?.name && { rmName: c0.name }), ...(c0?.designation && { rmDesignation: c0.designation }), ...(c0?.phone && { rmMobile: c0.phone }), ...(c0?.email && { rmEmail: c0.email }), ...(x.city && { rmLocation: x.city }) };
    const sheet = await this.sheets.fillFrom(lender.id, { ...fromContact, ...(x.sheet ?? {}) }, source, actor, ip);
    const contacts = await this.saveContacts(lender.id, x, policies.map((p) => idOf.get(p.productSlug)!.name));
    const summary = { lender: { id: lender.id, name: lender.name, isNew: lender.isNew }, created, updated, unchanged, changes, contactsAdded: contacts.added, contactsUpdated: contacts.updated, lenderFilled, skippedProducts: skipped, sheetFilled: sheet.filled, sheetDiffers: sheet.differs };
    await this.prisma.lenderOffer.update({ where: { id }, data: { status: "APPLIED", appliedLenderId: lender.id, appliedSummary: json(summary) } });
    await this.audit.record({ actor, action: AuditAction.UPDATE, entity: "LenderOffer", entityId: id, entityLabel: `Added to ${lender.name}`, ip });
    return summary;
  }

  /** Details of the lender that the flyer gave and the CRM did not hold yet: the website, the office address and city. */
  private async fillLender(lenderId: string, x: Extraction) {
    const l = await this.prisma.lender.findUnique({ where: { id: lenderId }, select: { portalUrl: true, branchAddress: true, branchCity: true } });
    if (!l) return [];
    const data: Prisma.LenderUpdateInput = {};
    const filled: string[] = [];
    if (!l.portalUrl && x.website?.startsWith("http")) { data.portalUrl = x.website.slice(0, 200); filled.push("website"); }
    if (!l.branchAddress && x.address) { data.branchAddress = x.address; filled.push("address"); }
    if (!l.branchCity && x.city) { data.branchCity = x.city; filled.push("city"); }
    if (filled.length) await this.prisma.lender.update({ where: { id: lenderId }, data });
    return filled;
  }

  /** The values for a brand-new policy: only what the flyer actually gave. */
  private fields(p: PolicyDraft) {
    const out: Record<string, unknown> = { gstRequired: p.gstRequired, allIndia: p.allIndia };
    const set = (k: string, v: unknown) => { if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v; };
    for (const k of ["minAmount", "maxAmount", "minRate", "maxRate", "minTenureMonths", "maxTenureMonths", "rateType", "processingFee", "specialScheme", "minCreditScore"] as const) set(k, p[k]);
    set("employmentTypes", p.employmentTypes);
    set("cities", p.cities);
    if (p.notes) out.notes = `From flyer ${TODAY()}: ${p.notes}`.slice(0, 1000);
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
        branchAddress: x.address ?? undefined,
        branchCity: x.city ?? undefined,
        notes: `Added from a flyer on ${TODAY()}.${x.website && !x.website.startsWith("http") ? ` Website: ${x.website}` : ""}`,
      },
    });
    return { id: made.id, name: made.name, isNew: true };
  }

  private async saveContacts(lenderId: string, x: Extraction, segments: string[]) {
    if (!x.contacts.length) return { added: 0, updated: 0 };
    const have = await this.prisma.lenderContact.findMany({ where: { lenderId }, select: { id: true, name: true, designation: true, phone: true, email: true, segments: true } });
    let added = 0;
    let updated = 0;
    for (const c of x.contacts) {
      // The same person (same phone or same email) is never added twice; the flyer only fills what we did not have for them.
      const known = have.find((h) => (c.phone && cleanPhone(h.phone) === c.phone) || (c.email && h.email?.toLowerCase() === c.email));
      if (known) {
        const { data, filled } = fillContact(known, c, segments);
        if (filled.length) {
          await this.prisma.lenderContact.update({ where: { id: known.id }, data });
          Object.assign(known, data);
          updated += 1;
        }
        continue;
      }
      const made = await this.prisma.lenderContact.create({
        data: { lenderId, name: c.name ?? "Contact from flyer", designation: c.designation, phone: c.phone, email: c.email, segments, notes: `From a flyer on ${TODAY()}` },
        select: { id: true, name: true, designation: true, phone: true, email: true, segments: true },
      });
      have.push(made);
      added += 1;
    }
    return { added, updated };
  }
}
