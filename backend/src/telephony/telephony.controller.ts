import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { periodRange, resolveRange } from "../common/date.util";
import { PlivoClient } from "./plivo.client";
import { summarise } from "./telephony-stats";

@Controller("telephony")
@Roles(Role.ADMIN, Role.MANAGER)
export class TelephonyController {
  constructor(private plivo: PlivoClient) {}

  /** Whether Plivo credentials are set on the server (never the values). */
  @Get("status")
  status() {
    return { configured: this.plivo.configured };
  }

  /** Telecalling numbers for a period, read live from Plivo's call records. */
  @Get("stats")
  async stats(@Query("range") range?: string, @Query("from") from?: string, @Query("to") to?: string) {
    // Plivo has no "all time", so the default is the last 30 days and an open-ended window is capped at a year.
    const resolved = resolveRange({ range: range && range !== "all" ? range : from || to ? undefined : "30d", from, to });
    const end = resolved.to ?? new Date();
    const start = resolved.from ?? periodRange("30d").from!;
    if (start > end) throw new BadRequestException("The start date is after the end date");
    if (end.getTime() - start.getTime() > 366 * 86_400_000) throw new BadRequestException("Choose a period of a year or less");

    const { calls, partial } = await this.plivo.calls(start, end);
    return { ...summarise(calls), from: start.toISOString(), to: end.toISOString(), partial };
  }
}
