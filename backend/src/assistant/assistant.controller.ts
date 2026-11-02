import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsString, Length, ValidateNested } from "class-validator";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { AssistantService } from "./assistant.service";

class MessageDto {
  @IsIn(["user", "assistant"]) role: "user" | "assistant";
  @IsString() @Length(1, 4000) content: string;
}

class AskDto {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => MessageDto) messages: MessageDto[];
}

@Controller("assistant")
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  /** Whether the assistant is set up, so the screen can say so instead of failing. */
  @Get("status")
  status() {
    return { enabled: this.assistant.enabled };
  }

  @Post("ask")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.assistant.ask(dto.messages, user, ip);
  }
}
