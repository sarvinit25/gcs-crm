import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AuditAction, AuditActorType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LoginLockService } from "../security/login-lock.service";
import { SettingsService } from "../settings/settings.service";

@Injectable()
export class PartnerAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private settings: SettingsService,
    private locks: LoginLockService,
  ) {}

  async login(phone: string, password: string, ip?: string) {
    const subject = `partner:${phone}`;
    await this.locks.assertOpen(subject);
    const partner = await this.prisma.sourcingPartner.findUnique({ where: { phone } });

    // Same message whether the phone is unknown, the account is deactivated,
    // no password has been set yet, or the password is wrong — never reveal
    // which case it is to an unauthenticated caller.
    if (
      !partner ||
      !partner.active ||
      !partner.passwordHash ||
      !(await bcrypt.compare(password, partner.passwordHash))
    ) {
      await this.locks.fail(subject);
      throw new UnauthorizedException("Invalid phone number or password");
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
