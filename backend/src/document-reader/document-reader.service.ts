import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../documents/storage.service";
import { CamService } from "../cam/cam.service";
import { readStatement } from "../cam/statement-read";
import { StatementError } from "../cam/statement-parse";
import type { AuthUser } from "../auth/auth.decorators";
import { NEVER_READ_CATEGORIES, normaliseReading, readingPrompt, statementFields, type CamPatch, type Reading } from "./document-reading";

const MAX_AI_BYTES = 20 * 1024 * 1024;
const MAX_AT_ONCE = 8;
const AI_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Reads the documents on an application. A statement that is a text PDF, Excel or CSV is read on our own server first (free,
 * exact). Anything else, scans and photos included, goes to the AI. Identity papers (the "KYC" category) are never read.
 * Staff look at what was found and press a button to put it in the CAM; nothing goes in on its own.
 */
@Injectable()
export class DocumentReaderService {
  private readonly log = new Logger("DocumentReader");

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private cam: CamService,
    private config: ConfigService,
  ) {}

  get aiEnabled() {
    return Boolean((this.config.get<string>("OPENAI_API_KEY") ?? "").trim());
  }

  private async applicationFor(applicationId: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, ...(user.role === Role.ADVISOR ? { ownerId: user.id } : {}) },
      select: { id: true, seq: true, leadId: true },
    });
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  private async documentFor(applicationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, applicationId } });
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  async list(applicationId: string, user: AuthUser) {
    await this.applicationFor(applicationId, user);
    const rows = await this.prisma.documentReading.findMany({ where: { document: { applicationId } }, orderBy: { createdAt: "asc" } });
    return { aiEnabled: this.aiEnabled, readings: rows.map((r) => ({ documentId: r.documentId, docType: r.docType, method: r.method, summary: r.summary, fields: r.fields, canAddToCam: Boolean(r.cam) || r.method === "local", addedToCamAt: r.appliedToCamAt, readAt: r.createdAt })) };
  }

  async readOne(applicationId: string, documentId: string, user: AuthUser) {
    await this.applicationFor(applicationId, user);
    const doc = await this.documentFor(applicationId, documentId);
    const saved = await this.readDocument(doc);
    await this.audit.record({ actor: user, action: AuditAction.CREATE, entity: "Document", entityId: documentId, entityLabel: `${doc.fileName} · read (${saved.method === "local" ? "on our server" : "AI"})` });
    return { documentId, docType: saved.docType, method: saved.method, summary: saved.summary, fields: saved.fields, canAddToCam: Boolean(saved.cam) };
  }

  /**
   * Run when the customer sends their form in: reads what they uploaded so staff open the file to answers, not a pile of PDFs.
   * It never throws and never touches the CAM; a file that cannot be read is simply left for staff to read by hand.
   */
  async readAfterSubmit(applicationId: string): Promise<void> {
    try {
      const docs = await this.prisma.document.findMany({ where: { applicationId, category: { notIn: NEVER_READ_CATEGORIES }, reading: null }, orderBy: { createdAt: "asc" }, take: MAX_AT_ONCE });
      for (const d of docs) {
        try {
          await this.readDocument(d);
        } catch (e) {
          this.log.warn(`Could not read ${d.fileName} on its own: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.log.warn(`Automatic reading of an application's documents stopped: ${(e as Error).message}`);
    }
  }

  /**
   * Reads the bank statements on an application with OUR OWN statement reader only: nothing is sent to an outside AI. Each
   * one that reads is saved as a reading for staff to see. The one with the most months also goes into the lead's CAM, but only
   * while the CAM has no bank months of its own yet, so it never overwrites what a person entered. Never throws.
   */
  async readStatementsOnServer(applicationId: string, user: AuthUser): Promise<{ read: number; appliedToCam: boolean }> {
    let read = 0;
    let appliedToCam = false;
    try {
      const app = await this.prisma.application.findUnique({ where: { id: applicationId }, select: { leadId: true } });
      const docs = await this.prisma.document.findMany({ where: { applicationId, category: "Bank statement", reading: null }, orderBy: { createdAt: "asc" }, take: 12 });
      let best: { documentId: string; fileName: string; months: number; fill: CamPatch } | null = null;
      for (const d of docs) {
        try {
          const local = await this.tryStatement(await this.storage.get(d.objectKey), d.fileName);
          if (!local) continue;
          const summary = `Bank statement, ${local.analysis.monthsFound} month${local.analysis.monthsFound === 1 ? "" : "s"} read on our own server.`;
          await this.prisma.documentReading.upsert({
            where: { documentId: d.id },
            create: { documentId: d.id, docType: "BANK_STATEMENT", method: "local", summary, fields: statementFields(local.analysis) as unknown as Prisma.InputJsonValue, cam: local.fill as unknown as Prisma.InputJsonValue, model: null },
            update: {},
          });
          read++;
          if (!best || local.analysis.monthsFound > best.months) best = { documentId: d.id, fileName: d.fileName, months: local.analysis.monthsFound, fill: local.fill as unknown as CamPatch };
        } catch (e) {
          this.log.warn(`Could not read the statement ${d.fileName} on our server: ${(e as Error).message}`);
        }
      }
      if (best && app?.leadId) {
        const cam = await this.prisma.camCase.findUnique({ where: { leadId: app.leadId }, select: { data: true } });
        const banking = ((cam?.data ?? {}) as { banking?: { months?: unknown[] } }).banking;
        if (!banking?.months?.length) {
          await this.cam.save(app.leadId, { data: best.fill }, user);
          await this.prisma.documentReading.update({ where: { documentId: best.documentId }, data: { appliedToCamAt: new Date() } });
          appliedToCam = true;
        }
      }
    } catch (e) {
      this.log.warn(`Reading the statements of an application stopped: ${(e as Error).message}`);
    }
    return { read, appliedToCam };
  }

  private async readDocument(doc: { id: string; category: string; fileName: string; objectKey: string; mimeType: string }) {
    const documentId = doc.id;
    if (NEVER_READ_CATEGORIES.includes(doc.category)) throw new BadRequestException("Identity papers (KYC) are not read by the AI. The customer types those numbers themselves.");
    const buffer = await this.storage.get(doc.objectKey);

    let reading: Reading;
    let method: "local" | "ai" = "ai";
    let cam: CamPatch | null = null;
    let model: string | null = null;

    // A statement we can read ourselves never leaves our server.
    const local = await this.tryStatement(buffer, doc.fileName);
    if (local) {
      method = "local";
      reading = { docType: "BANK_STATEMENT", summary: `Bank statement, ${local.analysis.monthsFound} month${local.analysis.monthsFound === 1 ? "" : "s"} read on our own server.`, fields: statementFields(local.analysis), cam: null };
      cam = local.fill as unknown as CamPatch;
    } else {
      const ai = await this.readWithAi(buffer, doc.mimeType, doc.fileName);
      reading = ai.reading;
      cam = ai.reading.cam;
      model = ai.model;
    }

    const data = { docType: reading.docType, method, summary: reading.summary, fields: reading.fields as unknown as Prisma.InputJsonValue, cam: (cam ?? Prisma.JsonNull) as Prisma.InputJsonValue, model, appliedToCamAt: null };
    return this.prisma.documentReading.upsert({ where: { documentId }, create: { documentId, ...data }, update: data });
  }

  /** Reads every document not yet read, a few at a time, skipping identity papers. One failing file does not stop the rest. */
  async readAll(applicationId: string, user: AuthUser) {
    await this.applicationFor(applicationId, user);
    const docs = await this.prisma.document.findMany({ where: { applicationId, category: { notIn: NEVER_READ_CATEGORIES }, reading: null }, orderBy: { createdAt: "asc" }, take: MAX_AT_ONCE });
    const results: { documentId: string; fileName: string; ok: boolean; error?: string }[] = [];
    for (const d of docs) {
      try {
        await this.readOne(applicationId, d.id, user);
        results.push({ documentId: d.id, fileName: d.fileName, ok: true });
      } catch (e) {
        results.push({ documentId: d.id, fileName: d.fileName, ok: false, error: (e as Error).message });
      }
    }
    return { read: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), left: Math.max(0, (await this.prisma.document.count({ where: { applicationId, category: { notIn: NEVER_READ_CATEGORIES }, reading: null } }))) };
  }

  /** Puts what was read into the lead's CAM. Staff pressed the button, so these boxes take the document's figures. */
  async addToCam(applicationId: string, documentId: string, user: AuthUser, ip?: string) {
    const app = await this.applicationFor(applicationId, user);
    if (!app.leadId) throw new BadRequestException("This application has no lead, so there is no CAM to put it in.");
    const doc = await this.documentFor(applicationId, documentId);
    const reading = await this.prisma.documentReading.findUnique({ where: { documentId } });
    if (!reading?.cam) throw new BadRequestException("Nothing from this document can go into the CAM.");
    await this.cam.save(app.leadId, { data: reading.cam }, user, ip);
    await this.prisma.documentReading.update({ where: { documentId }, data: { appliedToCamAt: new Date() } });
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Document", entityId: documentId, entityLabel: `${doc.fileName} · added to the CAM`, ip });
    return { ok: true };
  }

  private async tryStatement(buffer: Buffer, fileName: string) {
    try {
      return await readStatement(buffer, fileName);
    } catch (e) {
      // Not a readable statement: a scan, a photo, or not a statement at all. The AI is the next step.
      if (!(e instanceof StatementError)) this.log.warn(`Statement reader failed unexpectedly: ${(e as Error).message}`);
      return null;
    }
  }

  private async readWithAi(buffer: Buffer, mime: string, fileName: string): Promise<{ reading: Reading; model: string }> {
    if (!this.aiEnabled) throw new BadRequestException("The AI reader is not switched on: the OpenAI key is missing on the server.");
    if (!AI_MIMES.has(mime)) throw new BadRequestException("The AI can read PDFs and pictures (JPG, PNG, WebP). For a statement in another format, upload the PDF, Excel or CSV from net banking.");
    if (buffer.length > MAX_AI_BYTES) throw new BadRequestException("That file is too big for the AI to read (20 MB at most).");
    const uri = `data:${mime};base64,${buffer.toString("base64")}`;
    const content: Record<string, unknown>[] = [
      { type: "input_text", text: readingPrompt() },
      mime === "application/pdf" ? { type: "input_file", filename: fileName.slice(0, 100), file_data: uri } : { type: "input_image", image_url: uri },
    ];
    const model = this.config.get<string>("DOC_READER_MODEL")?.trim() || this.config.get<string>("OFFER_READER_MODEL")?.trim() || "gpt-4.1-mini";
    const payload = JSON.stringify({ model, input: [{ role: "user", content }], text: { format: { type: "json_object" } }, temperature: 0, max_output_tokens: 4000 });
    let res: Response | undefined;
    // A connection that was open for a while is sometimes cut as it is reused ("fetch failed"). That is not an answer, so try again.
    for (let attempt = 1; attempt <= 3 && !res; attempt++) {
      try {
        res = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${this.config.get<string>("OPENAI_API_KEY")}`, "content-type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(180_000),
        });
      } catch (err) {
        const timedOut = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
        this.log.warn(`Reading a document failed (try ${attempt}): ${(err as Error).message}${(err as { cause?: { code?: string } }).cause?.code ? ` [${(err as { cause: { code: string } }).cause.code}]` : ""}`);
        if (timedOut || attempt === 3) throw new BadGatewayException("The reader did not answer in time. Try again.");
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    if (!res) throw new BadGatewayException("The reader did not answer. Try again.");
    if (!res.ok) {
      this.log.error(`The AI refused a document (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
      throw new BadGatewayException("The reader could not read that file. Try a clearer picture or PDF.");
    }
    const body = (await res.json()) as { output?: { content?: { type?: string; text?: string }[] }[] };
    const out = (body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(out ?? "");
    } catch {
      throw new BadGatewayException("The reader gave an answer that could not be used. Try again.");
    }
    return { reading: normaliseReading(parsed), model };
  }
}
