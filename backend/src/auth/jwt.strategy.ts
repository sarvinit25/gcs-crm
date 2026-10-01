import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth.decorators";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: { sub: string; type?: string; tv?: number }): Promise<AuthUser> {
    // Only a full staff session counts: partner, borrower and two-step challenge tokens never do.
    if (payload.type !== "staff") throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    // `tv` is the token version at sign-in; a password change or reset bumps it and ends older sessions.
    if (!user || !user.active || (payload.tv ?? 0) !== user.tokenVersion) throw new UnauthorizedException();
    return { id: user.id, email: user.email, role: user.role, name: user.name, mustChangePassword: user.mustChangePassword };
  }
}
