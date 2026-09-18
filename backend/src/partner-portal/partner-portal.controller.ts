import { Body, Controller, Get, Ip, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { PartnerAuthService } from "./partner-auth.service";
import { PartnerPortalService } from "./partner-portal.service";
import { PartnerAuthGuard } from "./partner-auth.guard";
import { CurrentPartner, type PartnerAuthUser } from "./partner.decorators";
import { PartnerLoginDto } from "./dto/partner-portal.dto";

@Controller("partner/auth")
export class PartnerAuthController {
  constructor(private partnerAuth: PartnerAuthService) {}

  // Public bypasses the global staff JwtAuthGuard; rate-limited against guessing.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: PartnerLoginDto, @Ip() ip: string) {
    return this.partnerAuth.login(dto.phone, dto.password, ip);
  }
}

/**
 * Everything a partner can see once signed in — strictly their own referrals
 * and stats, never another partner's or the internal CRM's data.
 */
@Controller("partner")
@Public()
@UseGuards(PartnerAuthGuard)
export class PartnerPortalController {
  constructor(private portal: PartnerPortalService) {}

  @Get("me")
  me(@CurrentPartner() partner: PartnerAuthUser) {
    return this.portal.me(partner.id);
  }

  @Get("stats")
  stats(@CurrentPartner() partner: PartnerAuthUser) {
    return this.portal.stats(partner.id);
  }

  @Get("leads")
  leads(@CurrentPartner() partner: PartnerAuthUser) {
    return this.portal.leads(partner.id);
  }

  @Get("commission-structure")
  rateCard() {
    return this.portal.rateCard();
  }
}
