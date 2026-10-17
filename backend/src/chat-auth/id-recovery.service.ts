import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  OTP_MAX_PER_DAY,
  OTP_MAX_PER_HOUR,
  OTP_MAX_TRIES,
  OTP_RESEND_SECONDS,
  OTP_VALID_MINUTES,
} from "./chat-auth.service";
import { OtpSenderService } from "./otp-sender.service";
import type { IdKind, SendIdCodeDto, VerifyIdCodeDto } from "./dto/id-recovery.dto";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A client with several files gets the newest few, one message each. */
const MAX_CLIENT_IDS = 3;

const tooMany = (message: string) => new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);

/**
 * Lets a client or partner who has lost (or never saw) their GCS ID have it sent to the mobile number it is on.
 * The person proves they hold the number with a one-time code, and the ID goes to that number by SMS. It is never
 * shown on the page, and the answer to "send a code" is the same whether or not an ID exists for the number, so
 * nobody can use this to find out who is a client. Numbers with no ID are not sent a code at all, which also keeps
 * the form from being used to spend SMS on arbitrary numbers.
 */
@Injectable()
export class IdRecoveryService {
  private readonly log = new Logger(IdRecoveryService.name);
  private readonly secret: string;
  /** The same fixed-code test numbers the chat sign-in uses (CHAT_OTP_TEST_PHONES + CHAT_OTP_TEST_CODE). */
  private readonly testPhones: Set<string>;
  private readonly testCode: string;

  constructor(
    private prisma: PrismaService,
    private sender: OtpSenderService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>("JWT_SECRET") ?? "";
    const code = (config.get<string>("CHAT_OTP_TEST_CODE") ?? "").trim();
    const phones = (config.get<string>("CHAT_OTP_TEST_PHONES") ?? "")
      .split(",")
      .map((p) => p.replace(/\D/g, "").slice(-10))
      .filter((p) => /^[6-9]\d{9}$/.test(p));
    this.testCode = /^\d{6}$/.test(code) ? code : "";
    this.testPhones = new Set(this.testCode ? phones : []);
  }

  private hashCode(kind: IdKind, phone: string, code: string) {
    return createHmac("sha256", this.secret).update(`id:${kind}:${phone}:${code}`).digest("hex");
  }

  /** The GCS IDs held against this mobile number, newest first. Empty when the number is not on file. */
  private async idsFor(kind: IdKind, phone: string): Promise<string[]> {
    if (kind === "partner") {
      const partner = await this.prisma.sourcingPartner.findUnique({
        where: { phone },
        select: { code: true, active: true },
      });
      return partner?.active && partner.code ? [partner.code] : [];
    }
    const files = await this.prisma.application.findMany({
      where: {
        archivedAt: null,
        portalAccessCode: { not: null },
        applicants: { some: { isPrimary: true, phone } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CLIENT_IDS,
      select: { portalAccessCode: true },
    });
    return files.flatMap((f) => (f.portalAccessCode ? [f.portalAccessCode] : []));
  }

  async sendCode(dto: SendIdCodeDto, ip?: string) {
    const now = Date.now();
    const recent = await this.prisma.idRecoveryOtp.findMany({
      where: { phone: dto.phone, createdAt: { gt: new Date(now - DAY) } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const last = recent[0]?.createdAt.getTime() ?? 0;
    if (now - last < OTP_RESEND_SECONDS * 1000) {
      throw tooMany(`Please wait ${OTP_RESEND_SECONDS} seconds before asking for another code.`);
    }
    if (recent.filter((r) => now - r.createdAt.getTime() < HOUR).length >= OTP_MAX_PER_HOUR) {
      throw tooMany("Too many codes were requested for this number. Please try again in an hour.");
    }
    if (recent.length >= OTP_MAX_PER_DAY) {
      throw tooMany("Too many codes were requested for this number today. Please call us instead.");
    }

    const known = (await this.idsFor(dto.kind, dto.phone)).length > 0;
    const isTest = this.testPhones.has(dto.phone);
    const code = isTest ? this.testCode : String(randomInt(100_000, 1_000_000));
    // Only the newest code counts: asking again kills the earlier one.
    await this.prisma.idRecoveryOtp.updateMany({
      where: { phone: dto.phone, usedAt: null },
      data: { usedAt: new Date() },
    });
    // A row is kept even when no code is sent, so the cooldown and limits behave the same for every number.
    const row = await this.prisma.idRecoveryOtp.create({
      data: {
        phone: dto.phone,
        kind: dto.kind,
        codeHash: this.hashCode(dto.kind, dto.phone, code),
        expiresAt: new Date(now + OTP_VALID_MINUTES * MINUTE),
        ip: ip ?? null,
      },
      select: { id: true },
    });

    if (known && !isTest && !(await this.sender.send(dto.phone, code, OTP_VALID_MINUTES))) {
      await this.prisma.idRecoveryOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      throw new ServiceUnavailableException("We couldn't send the code just now. Please try again, or call us.");
    }

    void this.prisma.idRecoveryOtp
      .deleteMany({ where: { expiresAt: { lt: new Date(now - DAY) } } })
      .catch(() => undefined);

    return { sent: true, resendAfterSeconds: OTP_RESEND_SECONDS, validMinutes: OTP_VALID_MINUTES };
  }

  async verify(dto: VerifyIdCodeDto) {
    const now = new Date();
    const otp = await this.prisma.idRecoveryOtp.findFirst({
      where: { phone: dto.phone, kind: dto.kind, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new BadRequestException("That code has expired. Please ask for a new one.");

    // Count the try first, atomically, so parallel guesses cannot beat the limit.
    const counted = await this.prisma.idRecoveryOtp.updateMany({
      where: { id: otp.id, usedAt: null, attempts: { lt: OTP_MAX_TRIES } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      await this.prisma.idRecoveryOtp.updateMany({ where: { id: otp.id }, data: { usedAt: now } });
      throw new BadRequestException("Too many wrong tries. Please ask for a new code.");
    }

    const given = Buffer.from(this.hashCode(dto.kind, dto.phone, dto.code));
    const stored = Buffer.from(otp.codeHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      const left = OTP_MAX_TRIES - (otp.attempts + 1);
      throw new BadRequestException(
        left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Please ask for a new one.",
      );
    }

    // One code, one delivery.
    const used = await this.prisma.idRecoveryOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: now } });
    if (used.count === 0) throw new BadRequestException("That code has already been used. Please ask for a new one.");

    const ids = await this.idsFor(dto.kind, dto.phone);
    // Oldest first, so the newest file's message is the one that lands last on the phone.
    for (const id of [...ids].reverse()) {
      if (!(await this.sender.sendGcsId(dto.phone, id))) {
        this.log.error(`Could not deliver a GCS ID to ${dto.phone}`);
        throw new ServiceUnavailableException("Your number is confirmed, but we couldn't send the message just now. Please try again, or call us.");
      }
    }
    return { sent: ids.length > 0 };
  }
}
