import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { periodRange, resolveRange } from "../common/date.util";
import { PlivoClient } from "./plivo.client";
import { summarise } from "./telephony-stats";

/** A query-string number kept inside sane limits, or the fallback when it is missing or not a number. */
function clampInt(raw: string | undefined, min: number, max: number, fallback: number) {
  const n = Math.round(Number(raw));
  return raw === undefined || raw === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
}

@Controller("telephony")
@Roles(Role.ADMIN, Role.MANAGER)
export class TelephonyController {
  constructor(private plivo: PlivoClient) {}

  /** Whether Plivo credentials are set on the server (never the values). */
  @Get("status")
  status() {
    return { configured: this.plivo.configured };
  }

  /** Telecaller numbers for a period, read live from Plivo's call records. */
  @Get("stats")
  async stats(
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("direction") direction?: string,
    @Query("minSeconds") minSeconds?: string,
    @Query("top") top?: string,
  ) {
    // Plivo has no "all time", so the default is the last 30 days and an open-ended window is capped at a year.
    const resolved = resolveRange({ range: range && range !== "all" ? range : from || to ? undefined : "30d", from, to });
    const end = resolved.to ?? new Date();
    const start = resolved.from ?? periodRange("30d").from!;
    if (start > end) throw new BadRequestException("The start date is after the end date");
    if (end.getTime() - start.getTime() > 366 * 86_400_000) throw new BadRequestException("Choose a period of a year or less");

    const { calls, partial } = await this.plivo.calls(start, end);
    const wanted = direction === "inbound" || direction === "outbound" ? direction : undefined;
    return {
      ...summarise(wanted ? calls.filter((c) => c.direction === wanted) : calls, {
        minSeconds: clampInt(minSeconds, 1, 600, 1),
        topNumbers: clampInt(top, 3, 50, 10),
      }),
      from: start.toISOString(),
      to: end.toISOString(),
      partial,
    };
  }
}
