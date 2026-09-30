import { Body, Controller, Get, Ip, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { BorrowerAuthService } from "./borrower-auth.service";
import { BorrowerPortalService } from "./borrower-portal.service";
import { BorrowerAuthGuard } from "./borrower-auth.guard";
import { CurrentBorrower, type BorrowerAuthUser } from "./borrower.decorators";
import { BorrowerLoginDto } from "./dto/borrower-portal.dto";

@Controller("borrower/auth")
export class BorrowerAuthController {
  constructor(private borrowerAuth: BorrowerAuthService) {}

  // Public bypasses the global staff JwtAuthGuard; rate-limited against guessing.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: BorrowerLoginDto, @Ip() ip: string) {
    return this.borrowerAuth.login(dto.phone, dto.accessCode, ip);
  }
}

/** Everything a borrower can see once signed in — strictly their own file. */
@Controller("borrower")
@Public()
@UseGuards(BorrowerAuthGuard)
export class BorrowerPortalController {
  constructor(private portal: BorrowerPortalService) {}

  @Get("me")
  me(@CurrentBorrower() borrower: BorrowerAuthUser) {
    return this.portal.me(borrower.id);
  }
}
