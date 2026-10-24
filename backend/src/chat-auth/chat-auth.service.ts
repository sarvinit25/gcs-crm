import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "../leads/leads.service";
import { AlertsService } from "../alerts/alerts.service";
import type { PublicLeadDto } from "../leads/dto/lead.dto";
import { OtpSenderService } from "./otp-sender.service";
import type { SendOtpDto, VerifyOtpDto } from "./dto/chat-auth.dto";

/** How long a code works, how often one can be asked for, how many wrong tries it survives. */
export const OTP_VALID_MINUTES = 10;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_DAY = 10;
export const OTP_MAX_TRIES = 5;
/** A verified visitor stays signed in on that browser this long. */
export const SESSION_DAYS = 7;
/** Off-topic messages allowed before the chat is paused, how long the pause lasts, and how long a lone strike is remembered. */
export const STRIKE_LIMIT = 3;
export const BLOCK_MINUTES = 60;
export const STRIKE_MEMORY_HOURS = 6;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const tooMany = (message: string) => new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);

/**
 * Signs a visitor in to the website chat with a one-time code sent to their mobile. Verifying
 * the code also puts the person in the CRM as a lead, marked as a chatbot contact.
 */
@Injectable()
export class ChatAuthService {
  private readonly log = new Logger(ChatAuthService.name);
  private readonly secret: string;
  /** Test numbers that always get one fixed code and no SMS (CHAT_OTP_TEST_PHONES + CHAT_OTP_TEST_CODE). Empty unless both are set. */
  private readonly testPhones: Set<string>;
  private readonly testCode: string;

  constructor(
    private prisma: PrismaService,
    private leads: LeadsService,
    private alerts: AlertsService,
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
    if (this.testPhones.size > 0) {
      this.log.warn(`Chat sign-in TEST MODE: ${this.testPhones.size} number(s) use a fixed code and get no SMS. Remove CHAT_OTP_TEST_PHONES once SMS is set up.`);
    }
  }

  private hashCode(phone: string, code: string) {
    return createHmac("sha256", this.secret).update(`${phone}:${code}`).digest("hex");
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  async sendCode(dto: SendOtpDto, ip?: string) {
    const now = Date.now();
    const isTest = this.testPhones.has(dto.phone);
    const recent = await this.prisma.chatOtp.findMany({
      where: { phone: dto.phone, createdAt: { gt: new Date(now - DAY) } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    // A test number can ask again at once, as often as needed.
    if (!isTest) {
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
    }
    const code = isTest ? this.testCode : String(randomInt(100_000, 1_000_000));
    // Only the newest code counts: asking again kills the earlier one.
    await this.prisma.chatOtp.updateMany({ where: { phone: dto.phone, usedAt: null }, data: { usedAt: new Date() } });
    const row = await this.prisma.chatOtp.create({
      data: {
        phone: dto.phone,
        name: dto.name.trim(),
        codeHash: this.hashCode(dto.phone, code),
        expiresAt: new Date(now + OTP_VALID_MINUTES * MINUTE),
        ip: ip ?? null,
      },
      select: { id: true },
    });

    if (!isTest && !(await this.sender.send(dto.phone, code, OTP_VALID_MINUTES))) {
      await this.prisma.chatOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      throw new ServiceUnavailableException("We couldn't send the code just now. Please try again, or call us.");
    }

    // Housekeeping: old codes and passes are of no use to anyone.
    void this.prisma.chatOtp.deleteMany({ where: { expiresAt: { lt: new Date(now - DAY) } } }).catch(() => undefined);
    void this.prisma.chatSession.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);

    return { sent: true, resendAfterSeconds: OTP_RESEND_SECONDS, validMinutes: OTP_VALID_MINUTES };
  }

  async verify(dto: VerifyOtpDto) {
    const now = new Date();
    const otp = await this.prisma.chatOtp.findFirst({
      where: { phone: dto.phone, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new BadRequestException("That code has expired. Please ask for a new one.");

    // Count the try first, atomically, so parallel guesses cannot beat the limit.
    const counted = await this.prisma.chatOtp.updateMany({
      where: { id: otp.id, usedAt: null, attempts: { lt: OTP_MAX_TRIES } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      await this.prisma.chatOtp.updateMany({ where: { id: otp.id }, data: { usedAt: now } });
      throw new BadRequestException("Too many wrong tries. Please ask for a new code.");
    }

    const given = Buffer.from(this.hashCode(dto.phone, dto.code));
    const stored = Buffer.from(otp.codeHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      const left = OTP_MAX_TRIES - (otp.attempts + 1);
      throw new BadRequestException(
        left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Please ask for a new one.",
      );
    }

    // One code, one sign-in.
    const used = await this.prisma.chatOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: now } });
    if (used.count === 0) throw new BadRequestException("That code has already been used. Please ask for a new one.");

    const leadId = await this.recordContact(otp.name, dto.phone);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
    await this.prisma.chatSession.create({
      data: { tokenHash: this.hashToken(token), phone: dto.phone, name: otp.name, leadId, expiresAt },
    });
    return { token, expiresAt: expiresAt.toISOString(), name: otp.name };
  }

  /** The person is a lead now, flagged as a chatbot contact whose number is confirmed. */
  private async recordContact(name: string, phone: string) {
    const result = await this.leads.intake({
      name,
      phone,
      source: "website-chat",
      detail: "Confirmed their mobile number with a code to use the website chat.",
    } as PublicLeadDto);
    await this.prisma.lead.update({ where: { id: result.id }, data: { chatVerifiedAt: new Date() } });
    if ("isNew" in result && result.isNew) {
      void this.alerts.newLead({
        leadNo: result.leadNo,
        name,
        phone,
        email: null,
        city: null,
        source: "website-chat",
        loanType: null,
        amount: null,
        detail: "Signed in to the website chat with a mobile code.",
      });
    }
    return result.id;
  }

  /** Is this chat pass still good, and is the chat paused for this number? Asked by the website's server before each answer. */
  async check(token: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { name: true, phone: true, expiresAt: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return { valid: false as const };
    const strike = await this.prisma.chatStrike.findUnique({ where: { phone: session.phone } });
    const blocked = strike?.blockedUntil && strike.blockedUntil.getTime() > Date.now() ? strike.blockedUntil : null;
    return { valid: true as const, name: session.name, blockedUntil: blocked ? blocked.toISOString() : null };
  }

  /**
   * Counts one off-topic message against the visitor's number. Strikes from long ago are forgotten, and the
   * third one pauses the chat for an hour. Returns where that leaves them.
   */
  async strike(token: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { phone: true, expiresAt: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return { valid: false as const };

    const now = Date.now();
    const row = await this.prisma.chatStrike.findUnique({ where: { phone: session.phone } });
    const wasBlocked = row?.blockedUntil && row.blockedUntil.getTime() > now;
    // a finished pause, or a long quiet spell, starts the count again
    const stale =
      !row ||
      (row.blockedUntil && row.blockedUntil.getTime() <= now) ||
      (row.lastStrikeAt && now - row.lastStrikeAt.getTime() > STRIKE_MEMORY_HOURS * HOUR);
    const strikes = wasBlocked ? row.strikes : (stale ? 0 : row.strikes) + 1;
    const blockedUntil = wasBlocked
      ? row.blockedUntil
      : strikes >= STRIKE_LIMIT
        ? new Date(now + BLOCK_MINUTES * MINUTE)
        : null;
    const saved = await this.prisma.chatStrike.upsert({
      where: { phone: session.phone },
      create: { phone: session.phone, strikes, lastStrikeAt: new Date(now), blockedUntil },
      update: { strikes, lastStrikeAt: new Date(now), blockedUntil },
    });
    return {
      valid: true as const,
      strikes: saved.strikes,
      left: Math.max(0, STRIKE_LIMIT - saved.strikes),
      blockedUntil: saved.blockedUntil ? saved.blockedUntil.toISOString() : null,
    };
  }

  async end(token: string) {
    await this.prisma.chatSession.deleteMany({ where: { tokenHash: this.hashToken(token) } });
    return { ok: true };
  }
}
