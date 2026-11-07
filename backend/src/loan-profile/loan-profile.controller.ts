import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { IsOptional, IsString, Length } from "class-validator";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { LeadsService } from "../leads/leads.service";
import { checkFollowUpToken } from "../leads/follow-up-token";
import { LoanProfileService } from "./loan-profile.service";
import { fieldsFor } from "./profile-schema";

class AnswerDto {
  @IsString() @Length(0, 2000) reply!: string;
  @IsOptional() @IsString() @Length(1, 80) key?: string;
  @IsOptional() @IsString() @Length(1, 400) token?: string;
}

/** The whole form, for anything that wants to show or ask it (the telecaller's script, Gia). */
const schema = () => {
  const all = fieldsFor({}); // the unconditional questions; branches appear as answers come in
  return all.map((f) => ({ key: f.id, num: f.num, section: f.section, label: f.label, ask: f.ask, kind: f.kind, options: f.options ?? null }));
};

@Controller("leads/:id/loan-profile")
export class LoanProfileController {
  constructor(
    private profile: LoanProfileService,
    private leads: LeadsService,
  ) {}

  @Get()
  async view(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    await this.leads.findOne(id, user); // the same access rules as the lead itself
    return this.profile.view(id);
  }

  /** Staff or the AI telecaller type or speak what the customer said; it is read the same way as on WhatsApp. */
  @Post("answer")
  async answer(@Param("id") id: string, @Body() dto: AnswerDto, @CurrentUser() user: AuthUser) {
    await this.leads.findOne(id, user);
    return this.profile.step(id, dto.reply ?? "", { key: dto.key, reword: false });
  }
}

@Controller("public/loan-profile")
export class PublicLoanProfileController {
  constructor(
    private profile: LoanProfileService,
    private config: ConfigService,
  ) {}

  @Public()
  @Get("schema")
  schema() {
    return { questions: schema() };
  }

  private guard(id: string, token?: string) {
    if (!token || !checkFollowUpToken(id, token, this.config.getOrThrow<string>("JWT_SECRET"))) {
      throw new ForbiddenException("This link has expired. Please start again.");
    }
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":id/next")
  async next(@Param("id") id: string, @Query("token") token?: string) {
    this.guard(id, token);
    const q = await this.profile.question(id, null);
    return { key: q?.key ?? null, question: q?.text ?? null, progress: (await this.profile.view(id)).progress };
  }

  /** Gia sends what the visitor wrote; the profile reads it and returns what to ask next. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(":id/answer")
  async answer(@Param("id") id: string, @Body() dto: AnswerDto) {
    this.guard(id, dto.token);
    return this.profile.step(id, dto.reply ?? "", { key: dto.key });
  }
}
