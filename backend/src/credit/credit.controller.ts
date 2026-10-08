import { Body, Controller, Get, Ip, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { CreditService } from "./credit.service";
import { ListCreditQuery, RecordScoreDto, RunCheckDto } from "./dto/credit.dto";

/** CIBIL scores and credit checks. Staff reach only the applicants on their own files; admins reach all. */
@Controller("credit")
export class CreditController {
  constructor(private credit: CreditService) {}

  @Get("status")
  status() {
    return this.credit.status();
  }

  @Get("applicants")
  list(@Query() q: ListCreditQuery, @CurrentUser() user: AuthUser) {
    return this.credit.list(q, user);
  }

  @Get("applicants/:id/checks")
  history(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.credit.history(id, user);
  }

  // Each run is a real enquiry with a cost, so it is held to a modest rate per person.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("applicants/:id/check")
  run(@Param("id") id: string, @Body() dto: RunCheckDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.credit.run(id, dto, user, ip);
  }

  @Post("applicants/:id/record")
  record(@Param("id") id: string, @Body() dto: RecordScoreDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.credit.record(id, dto, user, ip);
  }
}
