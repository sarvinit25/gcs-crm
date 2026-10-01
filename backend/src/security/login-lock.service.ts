import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Caps guessing per account, whatever IP the guesses come from (the per-IP
 * throttle alone can't stop a slow or spread-out attack). Subjects are plain
 * strings such as `staff:ravi@x.com` and exist whether or not the account does,
 * so a locked response never reveals if an email or phone is registered.
 */
@Injectable()
export class LoginLockService {
  constructor(private prisma: PrismaService) {}

  /** Throws 429 while the subject is locked; clears an expired lock. */
  async assertOpen(subject: string, now = new Date()) {
    const row = await this.prisma.loginLock.findUnique({ where: { subject } });
    if (!row?.lockedUntil) return;
    if (row.lockedUntil > now) {
      const minutes = Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 60_000));
      throw new HttpException(
        `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.loginLock.delete({ where: { subject } }).catch(() => undefined);
  }

  /** Records a failed attempt; the fifth in a row locks the subject. */
  async fail(subject: string, now = new Date()) {
    const row = await this.prisma.loginLock.upsert({
      where: { subject },
      create: { subject, failures: 1 },
      update: { failures: { increment: 1 } },
    });
    if (row.failures >= MAX_FAILURES) {
      await this.prisma.loginLock.update({
        where: { subject },
        data: { lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000), failures: 0 },
      });
    }
    // Subjects for emails that don't exist would otherwise pile up forever.
    void this.prisma.loginLock
      .deleteMany({ where: { lockedUntil: null, updatedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } } })
      .catch(() => undefined);
  }

  async clear(subject: string) {
    await this.prisma.loginLock.deleteMany({ where: { subject } });
  }
}
