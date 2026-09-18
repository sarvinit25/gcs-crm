import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus, AuditAction, PayoutStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import {
  MarkAttendanceDto,
  MonthQuery,
  PayrollStatusDto,
  UpsertPayrollDto,
} from "./dto/attendance.dto";

/** Days counted as worked when tallying a month. */
const WORKED = new Set<AttendanceStatus>([AttendanceStatus.PRESENT, AttendanceStatus.HALF_DAY]);

const monthRange = ({ month, year }: MonthQuery) => ({
  // Month is 1-indexed from the caller; Date wants 0-indexed.
  from: new Date(Date.UTC(year, month - 1, 1)),
  to: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
});

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Every active staff member with their marks for the month, for the grid. */
  async month(query: MonthQuery) {
    const { from, to } = monthRange(query);

    const [staff, marks] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, designation: true, role: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: "asc" },
      }),
    ]);

    const byUser = new Map<string, typeof marks>();
    for (const mark of marks) {
      const list = byUser.get(mark.userId) ?? [];
      list.push(mark);
      byUser.set(mark.userId, list);
    }

    return {
      month: query.month,
      year: query.year,
      daysInMonth: new Date(Date.UTC(query.year, query.month, 0)).getUTCDate(),
      staff: staff.map((s) => {
        const own = byUser.get(s.id) ?? [];
        return {
          ...s,
          days: own.map((m) => ({
            date: m.date.toISOString().slice(0, 10),
            status: m.status,
            note: m.note,
          })),
          present: own.filter((m) => m.status === AttendanceStatus.PRESENT).length,
          halfDays: own.filter((m) => m.status === AttendanceStatus.HALF_DAY).length,
          leave: own.filter((m) => m.status === AttendanceStatus.LEAVE).length,
          absent: own.filter((m) => m.status === AttendanceStatus.ABSENT).length,
          worked: own.filter((m) => WORKED.has(m.status)).length,
        };
      }),
    };
  }

  /** One mark per person per day, so setting it again just overwrites. */
  async mark(dto: MarkAttendanceDto, actor: AuthUser, ip?: string) {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date");

    // Attendance is a record of what happened, not a roster of intentions.
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Attendance cannot be marked for a future date");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true },
    });
    if (!user) throw new NotFoundException("Staff member not found");

    const day = new Date(date.toISOString().slice(0, 10));
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: dto.userId, date: day } },
    });

    const record = await this.prisma.attendance.upsert({
      where: { userId_date: { userId: dto.userId, date: day } },
      create: { userId: dto.userId, date: day, status: dto.status, note: dto.note },
      update: { status: dto.status, note: dto.note },
    });

    // Only log real changes — marking a whole month would otherwise flood the trail.
    if (existing?.status !== dto.status) {
      await this.audit.record({
        actor,
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        entity: "Attendance",
        entityId: record.id,
        entityLabel: `${user.name} · ${day.toISOString().slice(0, 10)}`,
        changes: { status: { from: existing?.status ?? null, to: dto.status } },
        ip,
      });
    }

    return record;
  }

  /** Marks every unmarked active staff member present for a day. */
  async bulkPresent(dateInput: string, actor: AuthUser, ip?: string) {
    const day = new Date(new Date(dateInput).toISOString().slice(0, 10));
    if (day.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Attendance cannot be marked for a future date");
    }

    const staff = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    const already = await this.prisma.attendance.findMany({
      where: { date: day },
      select: { userId: true },
    });
    const marked = new Set(already.map((a) => a.userId));
    // Never overwrite a mark someone already set by hand.
    const missing = staff.filter((s) => !marked.has(s.id));

    if (missing.length) {
      await this.prisma.attendance.createMany({
        data: missing.map((s) => ({
          userId: s.id,
          date: day,
          status: AttendanceStatus.PRESENT,
        })),
      });

      await this.audit.record({
        actor,
        action: AuditAction.CREATE,
        entity: "Attendance",
        entityId: day.toISOString().slice(0, 10),
        entityLabel: `Bulk present · ${day.toISOString().slice(0, 10)}`,
        changes: { marked: { from: null, to: missing.length } },
        ip,
      });
    }

    return { marked: missing.length, skipped: marked.size };
  }

  // ─── Payroll ──────────────────────────────────────────────

  async payrollMonth(query: MonthQuery) {
    const [staff, records] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, designation: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.payrollRecord.findMany({
        where: { month: query.month, year: query.year },
      }),
    ]);

    const byUser = new Map(records.map((r) => [r.userId, r]));
    return staff.map((s) => ({ ...s, payroll: byUser.get(s.id) ?? null }));
  }

  async upsertPayroll(dto: UpsertPayrollDto, actor: AuthUser, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true },
    });
    if (!user) throw new NotFoundException("Staff member not found");

    const incentives = dto.incentives ?? 0;
    const deductions = dto.deductions ?? 0;
    // Computed here, never taken from the client — the arithmetic is the point.
    const netPay = dto.baseSalary + incentives - deductions;

    if (netPay < 0) {
      throw new BadRequestException("Deductions exceed salary and incentives");
    }

    const key = { userId_month_year: { userId: dto.userId, month: dto.month, year: dto.year } };
    const before = await this.prisma.payrollRecord.findUnique({ where: key });

    const record = await this.prisma.payrollRecord.upsert({
      where: key,
      create: {
        userId: dto.userId,
        month: dto.month,
        year: dto.year,
        baseSalary: dto.baseSalary,
        incentives,
        deductions,
        netPay,
      },
      update: { baseSalary: dto.baseSalary, incentives, deductions, netPay },
    });

    await this.audit.record({
      actor,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entity: "Payroll",
      entityId: record.id,
      entityLabel: `${user.name} · ${dto.month}/${dto.year}`,
      changes: { netPay: { from: before?.netPay?.toString() ?? null, to: netPay } },
      ip,
    });

    return record;
  }

  async setPayrollStatus(id: string, dto: PayrollStatusDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.payrollRecord.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
    if (!before) throw new NotFoundException("Payroll record not found");

    const record = await this.prisma.payrollRecord.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === PayoutStatus.PAID ? (dto.paidAt ?? new Date()) : null,
      },
    });

    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "Payroll",
      entityId: id,
      entityLabel: `${before.user.name} · ${before.month}/${before.year}`,
      changes: { status: { from: before.status, to: dto.status } },
      ip,
    });

    return record;
  }
}
