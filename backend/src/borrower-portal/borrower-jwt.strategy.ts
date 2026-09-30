import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import type { BorrowerAuthUser } from "./borrower.decorators";

/**
 * Separate named strategy ("jwt-borrower"), same idea as the partner one —
 * `sub` here is an Application id, never a staff or partner id, so a token
 * from one portal can never be replayed against another.
 */
@Injectable()
export class BorrowerJwtStrategy extends PassportStrategy(Strategy, "jwt-borrower") {
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

  async validate(payload: { sub: string; type?: string }): Promise<BorrowerAuthUser> {
    if (payload.type !== "borrower") throw new UnauthorizedException();

    const application = await this.prisma.application.findUnique({ where: { id: payload.sub } });
    if (!application) throw new UnauthorizedException();

    return { id: application.id, type: "borrower" };
  }
}
