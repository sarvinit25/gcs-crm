// What a lead already holds must not be typed or uploaded a second time when it becomes an application.
//
//  1. The lead's documents are copied onto the application, filed under the checklist's categories, so "required documents
//     received" counts them. Each is copied as its own stored file (never shared), so deleting one never removes the other.
//  2. The credit evaluation starts filled from the lead's CAM: the running loans (with the ones that will be closed from the
//     new loan not counted), the property value, turnover, profit and the average monthly bank credits.
//
// Both are best effort. A file that cannot be copied or a figure that is missing is skipped and the application is still
// created; staff see what came across and can fill in the rest.

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../documents/storage.service";
import { classifyDocument } from "../documents/document-kinds";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) && v !== "" && v !== null && v !== undefined ? n : null;
};
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Row[]) : []);

/** The figures the credit evaluation can take from a CAM; pure, so it can be tested without a database. */
export function evaluationFromCam(cam: unknown, lead: { amount?: unknown; propertyValue?: unknown }): {
  inputs: { annualTurnover?: number; netProfit?: number; avgMonthlyBankCredits?: number; propertyValue?: number };
  loans: { lenderName: string; loanType: string | null; outstanding: number | null; emi: number; monthsLeft: number | null; counted: boolean; note: string | null }[];
} {
  const data = (cam && typeof cam === "object" ? cam : {}) as Record<string, Record<string, unknown> | undefined>;
  const inputs: { annualTurnover?: number; netProfit?: number; avgMonthlyBankCredits?: number; propertyValue?: number } = {};

  const years = rows(data.income?.financials);
  const latest = years[0];
  const turnover = latest ? num(latest.turnover) : null;
  const profit = latest ? num(latest.netProfit) : null;
  if (turnover !== null && turnover > 0) inputs.annualTurnover = turnover;
  if (profit !== null) inputs.netProfit = profit;

  const months = rows(data.banking?.months);
  const credits = months.map((m) => num(m.credits)).filter((c): c is number => c !== null);
  if (credits.length) inputs.avgMonthlyBankCredits = Math.round(credits.reduce((s, c) => s + c, 0) / credits.length);

  const value = num(data.property?.marketValue) ?? num(lead.propertyValue);
  if (value !== null && value > 0) inputs.propertyValue = value;

  const loans = rows(data.obligations?.loans)
    .filter((l) => String(l.lender ?? "").trim().length >= 2 && String(l.status ?? "Live") !== "Closed")
    .map((l) => {
      const closing = String(l.status ?? "") === "Will be closed from this loan";
      const counted = !closing && String(l.foir ?? "Yes") !== "No";
      return {
        lenderName: String(l.lender).trim().slice(0, 120),
        loanType: l.type ? String(l.type).slice(0, 60) : null,
        outstanding: num(l.outstanding) ?? num(l.sanctioned),
        emi: num(l.emi) ?? 0,
        monthsLeft: num(l.monthsLeft) !== null ? Math.max(0, Math.min(600, Math.round(num(l.monthsLeft) as number))) : null,
        counted,
        note: closing ? "To be closed from the new loan, so not counted" : null,
      };
    });
  return { inputs, loans };
}

@Injectable()
export class LeadHandoff {
  private readonly log = new Logger(LeadHandoff.name);
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Copies the lead's files onto the application. Returns how many came across. */
  async copyDocuments(leadId: string, applicationId: string, userId: string): Promise<number> {
    const files = await this.prisma.leadFile.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
    let copied = 0;
    for (const f of files) {
      try {
        const body = await this.storage.get(f.objectKey);
        const objectKey = `applications/${applicationId}/${randomUUID()}${extname(f.objectKey) || ""}`;
        // Already compressed when the lead received it, so it is stored as it is.
        await this.storage.put(objectKey, body, f.mimeType, { compress: false });
        await this.prisma.document.create({
          data: { applicationId, category: classifyDocument(f.fileName, f.caption), fileName: f.fileName, objectKey, mimeType: f.mimeType, sizeBytes: f.sizeBytes, uploadedById: userId },
        });
        copied++;
      } catch (e) {
        this.log.warn(`Could not copy ${f.fileName} to the application: ${(e as Error).message}`);
      }
    }
    return copied;
  }

  /** Starts the credit evaluation from the lead's CAM. Does nothing if one already exists or the CAM holds nothing useful. */
  async seedEvaluation(leadId: string, applicationId: string): Promise<{ loans: number; inputs: string[] }> {
    if (await this.prisma.creditEvaluation.findUnique({ where: { applicationId } })) return { loans: 0, inputs: [] };
    const [cam, lead] = await Promise.all([
      this.prisma.camCase.findUnique({ where: { leadId } }),
      this.prisma.lead.findUnique({ where: { id: leadId }, select: { amount: true } }),
    ]);
    if (!cam) return { loans: 0, inputs: [] };
    const { inputs, loans } = evaluationFromCam(cam.data, { amount: lead?.amount });
    if (!Object.keys(inputs).length && !loans.length) return { loans: 0, inputs: [] };
    await this.prisma.creditEvaluation.create({ data: { applicationId, ...inputs } });
    for (const l of loans) await this.prisma.existingLoan.create({ data: { applicationId, ...l } });
    return { loans: loans.length, inputs: Object.keys(inputs) };
  }
}
