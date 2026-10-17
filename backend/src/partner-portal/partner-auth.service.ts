import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AuditAction, AuditActorType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LoginLockService } from "../security/login-lock.service";
import { SettingsService } from "../settings/settings.service";

/** Letters and digits only, so "gcs-bsa-001" and "GCS BSA 001" are the same ID. */
const squash = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A GCS ID that was typed must be the partner's own. Nothing typed, or no ID on file yet, is not held against them. */
const sameGcsId = (typed: string | undefined, onFile: string | null) =>
  !typed?.trim() || !onFile || squash(typed) === squash(onFile);

@Injectable()
export class PartnerAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private settings: SettingsService,
    private locks: LoginLockService,
  ) {}

  async login(phone: string, password: string, ip?: string, code?: string) {
    const subject = `partner:${phone}`;
    await this.locks.assertOpen(subject);
    const partner = await this.prisma.sourcingPartner.findUnique({ where: { phone } });

    // Same message whether the phone is unknown, the account is deactivated,
    // no password has been set yet, the password is wrong, or the GCS ID is not theirs — never reveal
    // which case it is to an unauthenticated caller.
    if (
      !partner ||
      !partner.active ||
      !partner.passwordHash ||
      !(await bcrypt.compare(password, partner.passwordHash)) ||
      !sameGcsId(code, partner.code)
    ) {
      await this.locks.fail(subject);
      throw new UnauthorizedException("Invalid phone number, GCS ID or password");
    }
    await this.locks.clear(subject);

    await this.audit.record({
      actor: { id: partner.id, name: partner.name },
      actorType: AuditActorType.PARTNER,
      action: AuditAction.LOGIN,
      entity: "SourcingPartner",
      entityId: partner.id,
      entityLabel: partner.name,
      ip,
    });

    return {
      accessToken: await this.jwt.signAsync(
        { sub: partner.id, type: "partner", tv: partner.tokenVersion },
        { expiresIn: `${this.settings.get<number>("security.sessionHours")}h` },
      ),
      partner: {
        id: partner.id,
        name: partner.name,
        firm: partner.firm,
        phone: partner.phone,
        commissionRate: partner.commissionRate,
      },
    };
  }
}
