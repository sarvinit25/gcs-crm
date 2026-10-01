import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AuditAction, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "./auth.decorators";
import { generateTotpSecret, otpauthUrl, verifyTotpStep } from "./totp";
import { LoginLockService } from "../security/login-lock.service";
import { decryptSecret, encryptSecret, isEncrypted } from "../security/secret-box";
import { randomUUID } from "node:crypto";

const ISSUER = "GCS CRM";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private settings: SettingsService,
    private locks: LoginLockService,
  ) {}

  private publicUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.totpEnabledAt !== null,
    };
  }

  /** Signed per request so a change to session length applies to new sign-ins without a restart. */
  private async session(user: User) {
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, role: user.role, type: "staff", tv: user.tokenVersion },
        { expiresIn: `${this.settings.get<number>("security.sessionHours")}h` },
      ),
      user: this.publicUser(user),
    };
  }

  private recordLogin(user: User, ip?: string) {
    return this.audit.record({
      actor: { id: user.id, name: user.name },
      action: AuditAction.LOGIN,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      ip,
    });
  }

  /** The authenticator code for this account, checked against replay. Returns the step used, or null. */
  private checkCode(user: User, code: string) {
    if (!user.totpSecret) return null;
    const step = verifyTotpStep(decryptSecret(user.totpSecret), code);
    // A step already used to sign in can't be used again, even though it's still inside the window.
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) return null;
    return step;
  }

  async login(email: string, password: string, ip?: string) {
    const subject = `staff:${email.toLowerCase()}`;
    await this.locks.assertOpen(subject);

    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.locks.fail(subject);
      throw new UnauthorizedException("Invalid email or password");
    }
    await this.locks.clear(subject);

    // Password is right but a second factor is needed: hand back a short-lived
    // challenge that is good for nothing except finishing the sign-in. It is
    // single-use — a newer password sign-in replaces it, and success consumes it.
    if (user.totpEnabledAt && user.totpSecret) {
      const jti = randomUUID();
      await this.prisma.user.update({ where: { id: user.id }, data: { totpChallengeJti: jti } });
      return {
        twoFactorRequired: true as const,
        challengeToken: await this.jwt.signAsync({ sub: user.id, type: "staff-2fa", jti }, { expiresIn: "5m" }),
      };
    }

    await this.recordLogin(user, ip);
    return this.session(user);
  }

  async verifyTwoFactor(challengeToken: string, code: string, ip?: string) {
    let payload: { sub: string; type: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(challengeToken);
    } catch {
      throw new UnauthorizedException("That sign-in has expired — enter your password again");
    }
    if (payload.type !== "staff-2fa" || !payload.jti) throw new UnauthorizedException("Invalid sign-in");

    const subject = `staff-2fa:${payload.sub}`;
    await this.locks.assertOpen(subject);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active || !user.totpEnabledAt || user.totpChallengeJti !== payload.jti) {
      throw new UnauthorizedException("That sign-in has expired — enter your password again");
    }
    const step = this.checkCode(user, code);
    if (step === null) {
      await this.locks.fail(subject);
      throw new UnauthorizedException("That code is not right");
    }
    await this.locks.clear(subject);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpLastStep: step,
        totpChallengeJti: null,
        // Seeds saved before encryption existed are upgraded the first time they're used.
        ...(user.totpSecret && !isEncrypted(user.totpSecret) ? { totpSecret: encryptSecret(user.totpSecret) } : {}),
      },
    });
    await this.recordLogin(user, ip);
    return this.session(user);
  }

  async me(user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.publicUser(row);
  }

  // ── password ──────────────────────────────────────────────

  async changePassword(actor: AuthUser, current: string, next: string, ip?: string) {
    const subject = `staff-pw:${actor.id}`;
    await this.locks.assertOpen(subject);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      await this.locks.fail(subject);
      throw new BadRequestException("Your current password is not right");
    }
    await this.locks.clear(subject);

    const min = this.settings.get<number>("security.minPasswordLength");
    if (next.length < min) throw new BadRequestException(`Password must be at least ${min} characters`);
    if (next === current) throw new BadRequestException("Choose a password you have not used just now");

    // Every other session — a stolen one included — stops working; this one carries on with a fresh token.
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await AuthService.hashPassword(next),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
    // The password itself is never recorded — only the fact that it changed.
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      changes: { password: { from: "«hidden»", to: "«changed by the user»" } },
      ip,
    });
    return { ok: true, accessToken: (await this.session(updated)).accessToken };
  }

  // ── two-step login ────────────────────────────────────────

  /** Starts setup: makes a secret and returns what the authenticator app needs. Not active until confirmed. */
  async setupTwoFactor(actor: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (user.totpEnabledAt) throw new BadRequestException("Two-step login is already on");
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret), totpLastStep: null } });
    return { secret, otpauthUrl: otpauthUrl(user.email, ISSUER, secret) };
  }

  async enableTwoFactor(actor: AuthUser, code: string, ip?: string) {
    const subject = `staff-pw:${actor.id}`;
    await this.locks.assertOpen(subject);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (user.totpEnabledAt) throw new BadRequestException("Two-step login is already on");
    const step = this.checkCode(user, code);
    if (step === null) {
      await this.locks.fail(subject);
      throw new BadRequestException("That code is not right — check the time on your phone and try the next one");
    }
    await this.locks.clear(subject);
    // The code used to turn it on can't also be used to sign in.
    await this.prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpLastStep: step } });
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      changes: { twoStepLogin: { from: false, to: true } },
      ip,
    });
    return { ok: true };
  }

  async disableTwoFactor(actor: AuthUser, password: string, code: string, ip?: string) {
    const subject = `staff-pw:${actor.id}`;
    await this.locks.assertOpen(subject);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.totpEnabledAt || !user.totpSecret) throw new BadRequestException("Two-step login is not on");
    if (!(await bcrypt.compare(password, user.passwordHash)) || this.checkCode(user, code) === null) {
      await this.locks.fail(subject);
      throw new BadRequestException("Password or code is not right");
    }
    await this.locks.clear(subject);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpChallengeJti: null, tokenVersion: { increment: 1 } },
    });
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      changes: { twoStepLogin: { from: true, to: false } },
      ip,
    });
    return { ok: true, accessToken: (await this.session(updated)).accessToken };
  }

  static hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }
}
