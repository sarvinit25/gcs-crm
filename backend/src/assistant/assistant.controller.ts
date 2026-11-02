import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length, ValidateNested } from "class-validator";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { AssistantService } from "./assistant.service";

class ChatTurnDto {
  @IsIn(["user", "assistant"]) role: "user" | "assistant";
  @IsString() @Length(1, 2000) content: string;
}

class ChatDto {
  // The browser holds the conversation; "new chat" simply sends a fresh list. Nothing is stored here.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ChatTurnDto)
  messages: ChatTurnDto[];
}

@Controller("assistant")
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Post("chat")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Body() dto: ChatDto, @CurrentUser() user: AuthUser) {
    return this.assistant.chat(dto.messages, user);
  }
}
