import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { formatDateIST } from "../common/date.util";
import type { CallRecord } from "./telephony-stats";

const PAGE = 20; // Plivo returns at most 20 call records per request
const MAX_PAGES = 150; // 3,000 calls per look; more than that is flagged as partial instead of hanging the page
const IST = "+05:30";

type PlivoCdr = {
  call_direction?: string;
  from_number?: string;
  to_number?: string;
  call_duration?: string | number;
  bill_duration?: string | number;
  total_amount?: string | number;
  hangup_cause_name?: string;
  initiation_time?: string;
  end_time?: string;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Plivo writes "2026-11-09 14:03:11+05:30"; a stamp with no offset is read as India time, the account's zone. */
export function parsePlivoTime(raw: string | undefined): Date | null {
  if (!raw) return null;
  const iso = raw.trim().replace(" ", "T");
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}${IST}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-11-09 14:03:11", in India time, for Plivo's date filters. */
export function plivoStamp(d: Date): string {
  const shifted = new Date(d.getTime() + 330 * 60_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 19)}`;
}

export function toCallRecord(row: PlivoCdr): CallRecord | null {
  const at = parsePlivoTime(row.initiation_time) ?? parsePlivoTime(row.end_time);
  if (!at) return null;
  const direction = String(row.call_direction ?? "").toLowerCase() === "inbound" ? "inbound" : "outbound";
  return {
    direction,
    customerNumber: String((direction === "inbound" ? row.from_number : row.to_number) ?? "").replace(/[^\d+]/g, ""),
    at,
    seconds: Math.max(0, Math.round(num(row.call_duration ?? row.bill_duration))),
    hangupCause: String(row.hangup_cause_name ?? ""),
    cost: num(row.total_amount),
  };
}

@Injectable()
export class PlivoClient {
  private readonly log = new Logger(PlivoClient.name);

  get configured() {
    return Boolean(process.env.PLIVO_AUTH_ID?.trim() && process.env.PLIVO_AUTH_TOKEN?.trim());
  }

  /** Call detail records between two instants, newest first. `partial` is true when the safety cap cut the list short. */
  async calls(from: Date, to: Date): Promise<{ calls: CallRecord[]; partial: boolean }> {
    if (!this.configured) throw new ServiceUnavailableException("Plivo isn't connected yet. Add PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN on the server.");
    const id = process.env.PLIVO_AUTH_ID!.trim();
    const auth = Buffer.from(`${id}:${process.env.PLIVO_AUTH_TOKEN!.trim()}`).toString("base64");
    const calls: CallRecord[] = [];
    let partial = false;

    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        partial = true;
        break;
      }
      const url = new URL(`https://api.plivo.com/v1/Account/${encodeURIComponent(id)}/Call/`);
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("offset", String(page * PAGE));
      url.searchParams.set("end_time__gte", plivoStamp(from));
      url.searchParams.set("end_time__lte", plivoStamp(to));

      let res: Response;
      try {
        res = await fetch(url, { headers: { authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        this.log.warn(`Plivo unreachable: ${(e as Error).message}`);
        throw new ServiceUnavailableException("Couldn't reach Plivo. Try again in a moment.");
      }
      if (res.status === 401) throw new ServiceUnavailableException("Plivo refused the Auth ID / Auth Token. Check them on the server.");
      if (!res.ok) {
        this.log.warn(`Plivo answered ${res.status} for the call list`);
        throw new ServiceUnavailableException(`Plivo answered with an error (${res.status}).`);
      }
      const body = (await res.json()) as { objects?: PlivoCdr[]; meta?: { next?: string | null } };
      for (const row of body.objects ?? []) {
        const rec = toCallRecord(row);
        if (rec) calls.push(rec);
      }
      if (!body.meta?.next || !(body.objects?.length)) break;
    }
    return { calls, partial };
  }
}

export const describeWindow = (from?: Date, to?: Date) => (from && to ? `${formatDateIST(from)} to ${formatDateIST(to)}` : "");
