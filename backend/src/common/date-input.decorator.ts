import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsDateString } from "class-validator";

/**
 * A date field on a request. Accepts a plain "YYYY-MM-DD" (what a date picker
 * gives you) or a full ISO timestamp. A plain date is normalised to midnight UTC —
 * which shows as the same calendar day in India time — because the database
 * rejects a bare date string with a 500.
 */
export const DateInput = () =>
  applyDecorators(
    Transform(({ value }) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)),
    IsDateString(),
  );
