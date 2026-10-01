import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuditAction, AuditActorType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LoginLockService } from "../security/login-lock.service";
import { SettingsService } from "../settings/settings.service";

@Injectable()
export class BorrowerAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private settings: SettingsService,
    private locks: LoginLockService,
  ) {}

  async login(phone: string, accessCode: string, ip?: string) {
    const subject = `borrower:${phone}`;
    await this.locks.assertOpen(subject);
    const application = await this.prisma.application.findUnique({
      where: { portalAccessCode: accessCode.toUpperCase() },
      include: { applicants: { where: { isPrimary: true }, take: 1 } },
    });
    const primary = application?.applicants[0];

    // Same message whether the code is unknown or the phone doesn't match —
    // never reveal which case it is to an unauthenticated caller.
    if (!application || !primary || primary.phone !== phone) {
      await this.locks.fail(subject);
      throw new UnauthorizedException("Invalid phone number or access code");
    }
    await this.locks.clear(subject);

    const applicationNo = this.settings.applicationNo(application.seq, application.createdAt);

    await this.audit.record({
      actor: { id: application.id, name: applicationNo },
      actorType: AuditActorType.CLIENT,
      action: AuditAction.LOGIN,
      entity: "Application",
      entityId: application.id,
      entityLabel: applicationNo,
      ip,
    });

    return {
      accessToken: await this.jwt.signAsync(
        { sub: application.id, type: "borrower", tv: application.portalTokenVersion },
        { expiresIn: `${this.settings.get<number>("security.sessionHours")}h` },
      ),
      applicationNo,
    };
  }
}
