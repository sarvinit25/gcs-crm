import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/auth.decorators";

/** For uptime monitors: answers 200 only when the app can actually reach its database. */
@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "down", database: false });
    }
    return { status: "ok", database: true, time: new Date().toISOString() };
  }
}
