import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AuditAction, CreditCheckKind, CreditCheckStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { istDayStart, istParts, istToday } from "../common/date.util";
import { BANDS, CONSENT_METHODS, bandOf, rangeOfBand } from "./credit-bands";
import { SandboxProvider, type CreditBureauProvider } from "./providers/credit-provider";
import type { ListCreditQuery, RecordScoreDto, RunCheckDto } from "./dto/credit.dto";

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const DAY = 86_400_000;

export type Mode = "none" | "sandbox";

@Injectable()
export class CreditService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  /** Which provider is switched on. Anything other than a name we know means "off". */
  mode(): Mode {
    return this.settings.get<string>("credit.provider").trim().toLowerCase() === "sandbox" ? "sandbox" : "none";
  }

  private production = () => process.env.NODE_ENV === "production";

  private provider(): CreditBureauProvider {
    const mode = this.mode();
    if (mode === "none") {
      throw new ConflictException("Live credit checks are not switched on yet. You can still record a score from a report you already have.");
    }
    if (mode === "sandbox" && this.production()) {
      throw new ServiceUnavailableException("The test provider cannot be used on the live system.");
    }
    return new SandboxProvider();
  }

  status() {
    const mode = this.mode();
    return {
      mode,
      // A real bureau connection has not been built yet; only the labelled test provider exists.
      live: false,
      simulated: mode === "sandbox" && !this.production(),
      available: mode === "sandbox" && !this.production(),
      consentText: this.settings.get<string>("credit.consentText"),
      consentMethods: CONSENT_METHODS,
      recheckDays: this.settings.get<number>("credit.recheckDays"),
      bands: BANDS,
    };
  }

  private scopeFor(user: AuthUser): Prisma.ApplicantWhereInput {
    return user.role === Role.ADVISOR ? { application: { ownerId: user.id } } : {};
  }

  private async applicantFor(id: string, user: AuthUser) {
    const a = await this.prisma.applicant.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: { application: { select: { id: true, seq: true, createdAt: true } } },
    });
    if (!a) throw new NotFoundException("Applicant not found");
    return a;
  }

  private label(a: { name: string; application: { seq: number; createdAt: Date } }) {
    return `${a.name} · ${this.settings.applicationNo(a.application.seq, a.application.createdAt)}`;
  }

  // ── the list ──────────────────────────────────────────────

  async list(q: ListCreditQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const recheckDays = this.settings.get<number>("credit.recheckDays");
    const staleBefore = new Date(`${istToday(new Date(Date.now() - recheckDays * DAY))}T00:00:00.000Z`);
    const band = q.band ? rangeOfBand(q.band) : undefined;
    const words = (q.search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
    const seq = (w: string) => (/^([A-Za-z]+-)?[\d-]+$/.test(w) && Number(w.replace(/^.*-/, "")) > 0 && Number(w.replace(/^.*-/, "")) < 2_000_000_000 ? Number(w.replace(/^.*-/, "")) : null);

    const base: Prisma.ApplicantWhereInput = { ...this.scopeFor(user), application: { ...(user.role === Role.ADVISOR ? { ownerId: user.id } : {}), archivedAt: null } };
    const where: Prisma.ApplicantWhereInput = {
      ...base,
      ...(band && { cibilScore: { gte: band.min, lte: band.max } }),
      ...(q.show === "none" && { cibilScore: null }),
      ...(q.show === "stale" && { cibilScore: { not: null }, OR: [{ cibilScoreDate: null }, { cibilScoreDate: { lt: staleBefore } }] }),
      ...(words.length && {
        AND: words.map((w) => ({
          OR: [
            { name: { contains: w, mode: "insensitive" as const } },
            { phone: { contains: w } },
            ...(seq(w) !== null ? [{ application: { seq: seq(w)! } }] : []),
          ],
        })),
      }),
    };

    const monthStart = istDayStart({ ...istParts(), day: 1 });
    const [items, total, scored, avg, low, checks] = await this.prisma.$transaction([
      this.prisma.applicant.findMany({
        where,
        include: {
          application: { select: { id: true, seq: true, createdAt: true, status: true, loanProduct: { select: { name: true } }, owner: { select: { name: true } } } },
          creditChecks: { where: { kind: { not: CreditCheckKind.SIMULATED }, status: CreditCheckStatus.SUCCESS }, orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, reference: true } },
        },
        orderBy: [{ cibilScore: { sort: "asc", nulls: "first" } }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.applicant.count({ where }),
      this.prisma.applicant.count({ where: { ...base, cibilScore: { not: null } } }),
      this.prisma.applicant.aggregate({ where: { ...base, cibilScore: { not: null } }, _avg: { cibilScore: true } }),
      this.prisma.applicant.count({ where: { ...base, cibilScore: { lt: 650, not: null } } }),
      this.prisma.creditCheck.count({
        where: { kind: { not: CreditCheckKind.SIMULATED }, status: CreditCheckStatus.SUCCESS, createdAt: { gte: monthStart }, applicant: base },
      }),
    ]);
    const everyone = await this.prisma.applicant.count({ where: base });

    const today = istToday();
    return {
      items: items.map((a) => ({
        id: a.id,
        name: a.name,
        isPrimary: a.isPrimary,
        phone: a.phone,
        hasPan: Boolean(a.pan && PAN.test(a.pan)),
        hasDob: Boolean(a.dateOfBirth),
        score: a.cibilScore,
        band: bandOf(a.cibilScore),
        scoreDate: a.cibilScoreDate,
        stale: a.cibilScore !== null && (!a.cibilScoreDate || a.cibilScoreDate < staleBefore),
        source: a.creditChecks[0]?.kind ?? null,
        reference: a.creditChecks[0]?.reference ?? null,
        application: {
          id: a.application.id,
          applicationNo: this.settings.applicationNo(a.application.seq, a.application.createdAt),
          status: a.application.status,
          product: a.application.loanProduct.name,
          owner: a.application.owner?.name ?? null,
        },
      })),
      total,
      page,
      pageSize,
      summary: {
        applicants: everyone,
        scored,
        withoutScore: everyone - scored,
        averageScore: avg._avg.cibilScore === null ? null : Math.round(avg._avg.cibilScore),
        low,
        checksThisMonth: checks,
      },
      today,
    };
  }

  async history(applicantId: string, user: AuthUser) {
    const a = await this.applicantFor(applicantId, user);
    const checks = await this.prisma.creditCheck.findMany({
      where: { applicantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { requestedBy: { select: { name: true } } },
    });
    return {
      applicant: { id: a.id, name: a.name, score: a.cibilScore, band: bandOf(a.cibilScore), scoreDate: a.cibilScoreDate },
      checks: checks.map((c) => ({ ...c, band: bandOf(c.score) })),
    };
  }

  // ── running a check ───────────────────────────────────────

  async run(applicantId: string, dto: RunCheckDto, user: AuthUser, ip?: string) {
    const applicant = await this.applicantFor(applicantId, user);
    const provider = this.provider();

    if (!applicant.pan || !PAN.test(applicant.pan)) throw new BadRequestException("Add the applicant's PAN first — the bureau needs it to find the report");
    if (!applicant.dateOfBirth) throw new BadRequestException("Add the applicant's date of birth first");
    if (!applicant.phone) throw new BadRequestException("Add the applicant's mobile number first");

    // Every pull costs money and leaves a mark, so a recent one is reused unless a Super Admin insists.
    const days = this.settings.get<number>("credit.recheckDays");
    const recent = await this.prisma.creditCheck.findFirst({
      where: { applicantId, kind: { not: CreditCheckKind.MANUAL }, status: CreditCheckStatus.SUCCESS, createdAt: { gte: new Date(Date.now() - days * DAY) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent && !(dto.force && user.role === Role.ADMIN)) {
      throw new ConflictException(
        `A check was already run on ${istToday(recent.createdAt)}. Checks are not repeated within ${days} days${user.role === Role.ADMIN ? " unless you choose to run it again" : " — ask a Super Admin if it must be repeated"}.`,
      );
    }

    const base = {
      applicantId,
      kind: provider.kind === "LIVE" ? CreditCheckKind.LIVE : CreditCheckKind.SIMULATED,
      consentAt: new Date(),
      consentMethod: dto.consentMethod,
      consentText: this.settings.get<string>("credit.consentText"),
      requestedById: user.id,
    };

    let result;
    try {
      result = await provider.fetch({
        name: applicant.name,
        pan: applicant.pan,
        dateOfBirth: applicant.dateOfBirth.toISOString().slice(0, 10),
        phone: applicant.phone,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The bureau could not be reached";
      await this.prisma.creditCheck.create({ data: { ...base, status: CreditCheckStatus.FAILED, error: message.slice(0, 300) } });
      throw new BadGatewayException("The credit bureau could not complete the check. Nothing was changed; please try again shortly.");
    }

    const check = await this.prisma.creditCheck.create({
      data: {
        ...base,
        status: CreditCheckStatus.SUCCESS,
        score: result.score,
        reportDate: new Date(`${result.reportDate}T00:00:00.000Z`),
        reference: result.reference,
        note: base.kind === CreditCheckKind.SIMULATED ? "Simulated result — not a real credit score." : null,
      },
    });

    // Only a real result may change what the applicant's file says.
    const applied = base.kind === CreditCheckKind.LIVE && result.score !== null;
    if (applied) {
      await this.prisma.applicant.update({ where: { id: applicantId }, data: { cibilScore: result.score, cibilScoreDate: check.reportDate } });
    }
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "CreditCheck",
      entityId: check.id,
      entityLabel: `${this.label(applicant)} · credit check${base.kind === CreditCheckKind.SIMULATED ? " (simulated)" : ""}`,
      changes: applied ? { cibilScore: { from: applicant.cibilScore, to: result.score } } : undefined,
      ip,
    });
    return { ...check, band: bandOf(check.score), applied };
  }

  /** A score typed in from a report obtained elsewhere. */
  async record(applicantId: string, dto: RecordScoreDto, user: AuthUser, ip?: string) {
    const applicant = await this.applicantFor(applicantId, user);
    const reportDate = new Date(`${dto.reportDate.slice(0, 10)}T00:00:00.000Z`);
    if (dto.reportDate.slice(0, 10) > istToday()) throw new BadRequestException("The report date cannot be in the future");

    const check = await this.prisma.creditCheck.create({
      data: {
        applicantId,
        kind: CreditCheckKind.MANUAL,
        status: CreditCheckStatus.SUCCESS,
        score: dto.score,
        reportDate,
        reference: dto.reference || null,
        note: dto.note || null,
        requestedById: user.id,
      },
    });
    // An older report never replaces a newer score.
    const applied = !applicant.cibilScoreDate || reportDate >= applicant.cibilScoreDate;
    if (applied) await this.prisma.applicant.update({ where: { id: applicantId }, data: { cibilScore: dto.score, cibilScoreDate: reportDate } });
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "CreditCheck",
      entityId: check.id,
      entityLabel: `${this.label(applicant)} · CIBIL score recorded`,
      changes: applied ? { cibilScore: { from: applicant.cibilScore, to: dto.score } } : undefined,
      ip,
    });
    return { ...check, band: bandOf(check.score), applied };
  }
}
