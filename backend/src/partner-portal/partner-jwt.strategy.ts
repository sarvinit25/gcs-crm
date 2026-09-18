import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import type { PartnerAuthUser } from "./partner.decorators";

/**
 * Separate named strategy ("jwt-partner") from the staff one, so a staff
 * token and a partner token are never interchangeable even though both are
 * signed with the same JWT_SECRET — the payload's `type` claim is what's
 * actually checked here.
 */
@Injectable()
export class PartnerJwtStrategy extends PassportStrategy(Strategy, "jwt-partner") {
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

  async validate(payload: { sub: string; type?: string }): Promise<PartnerAuthUser> {
    if (payload.type !== "partner") throw new UnauthorizedException();

    const partner = await this.prisma.sourcingPartner.findUnique({ where: { id: payload.sub } });
    if (!partner || !partner.active) throw new UnauthorizedException();

    return { id: partner.id, name: partner.name, phone: partner.phone, type: "partner" };
  }
}
