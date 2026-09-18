import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.audit.record({
      actor: { id: user.id, name: user.name },
      action: AuditAction.LOGIN,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      ip,
    });

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  static hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }
}
