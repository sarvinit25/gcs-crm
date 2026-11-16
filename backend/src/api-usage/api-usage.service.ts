import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PlivoClient } from "../telephony/plivo.client";
import { classifyCall, estimateUsd, istMonthStart, tokensFrom } from "./usage-tracker";

const PLIVO_LOW_USD = 3;

type Period = { calls: number; failed: number; tokensIn: number; tokensOut: number; estUsd: number | null; operations: Record<string, number> };

/**
 * Keeps a count of every request the CRM makes to an outside service (OpenAI, MSG91, Plivo, WhatsApp) by watching
 * the server's web requests in one place, so a new call anywhere is counted without extra code. Nothing about the
 * request or the answer is stored except the service, what it was for, whether it worked, and the tokens used.
 */
@Injectable()
export class ApiUsageService implements OnModuleInit {
  private readonly log = new Logger("ApiUsage");
  private balance: { at: number; usd: number | null } | null = null;

  private plivoSpend: { at: number; thisMonth: number | null; lastMonth: number | null } | null = null;

  constructor(
    private prisma: PrismaService,
    private plivo: PlivoClient,
  ) {}

  onModuleInit() {
    const g = globalThis as typeof globalThis & { __usageWatching?: boolean };
    if (g.__usageWatching) return;
    g.__usageWatching = true;
    const original = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const kind = classifyCall(url, method);
      if (!kind) return original(input, init);
      let res: Response;
      try {
        res = await original(input, init);
      } catch (err) {
        void this.record(kind.service, kind.operation, false, null, null);
        throw err;
      }
      void this.afterResponse(kind.service, kind.operation, res);
      return res;
    };
  }

  private async afterResponse(service: string, operation: string, res: Response) {
    let tokens: ReturnType<typeof tokensFrom> | null = null;
    if (service === "OpenAI" && res.ok) {
      try {
        tokens = tokensFrom(await res.clone().json());
      } catch {
        /* an answer we cannot read is still counted, just without tokens */
      }
    }
    await this.record(service, operation, res.ok, res.status, tokens);
  }

  private async record(service: string, operation: string, ok: boolean, status: number | null, tokens: ReturnType<typeof tokensFrom> | null) {
    try {
      await this.prisma.apiUsage.create({ data: { service, operation, ok, status, model: tokens?.model ?? null, tokensIn: tokens?.tokensIn ?? null, tokensOut: tokens?.tokensOut ?? null } });
    } catch (err) {
      this.log.warn(`Could not record usage: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  /** What is left on the Plivo account, in US dollars; null when there is no Plivo login or Plivo cannot be reached. Looked up at most every 5 minutes. */
  private async plivoBalance(): Promise<number | null> {
    if (this.balance && Date.now() - this.balance.at < 5 * 60_000) return this.balance.usd;
    const id = process.env.PLIVO_AUTH_ID;
    const token = process.env.PLIVO_AUTH_TOKEN;
    let usd: number | null = null;
    if (id && token) {
      try {
        const r = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(id)}/`, { headers: { authorization: `Basic ${Buffer.from(`${id}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const n = Number(((await r.json()) as { cash_credits?: string }).cash_credits);
          usd = Number.isFinite(n) ? n : null;
        }
      } catch {
        usd = null;
      }
    }
    this.balance = { at: Date.now(), usd };
    return usd;
  }

  /** What Plivo charged for calls this month and last, in US dollars, from its own call records. Null when it cannot be read. Looked up at most every 10 minutes. */
  private async plivoSpent(now: Date): Promise<{ thisMonth: number | null; lastMonth: number | null }> {
    if (this.plivoSpend && Date.now() - this.plivoSpend.at < 10 * 60_000) return this.plivoSpend;
    const sum = async (from: Date, to: Date) => {
      try {
        const { calls } = await this.plivo.calls(from, to);
        return Math.round(calls.reduce((s, c) => s + c.cost, 0) * 100) / 100;
      } catch {
        return null;
      }
    };
    const thisStart = istMonthStart(now);
    const [thisMonth, lastMonth] = this.plivo.configured ? await Promise.all([sum(thisStart, now), sum(istMonthStart(now, 1), thisStart)]) : [null, null];
    this.plivoSpend = { at: Date.now(), thisMonth, lastMonth };
    return this.plivoSpend;
  }

  private openaiSpend: { at: number; thisMonth: number | null; lastMonth: number | null } | null = null;

  /** What OpenAI itself says we were charged this month and last, in US dollars. It needs a key allowed to read usage (the "api.usage.read" permission); with an ordinary key this is null and our own estimate is shown instead. Looked up at most every 10 minutes. */
  private async openaiBilled(now: Date): Promise<{ thisMonth: number | null; lastMonth: number | null }> {
    if (this.openaiSpend && Date.now() - this.openaiSpend.at < 10 * 60_000) return this.openaiSpend;
    const key = process.env.OPENAI_API_KEY?.trim();
    const sum = async (from: Date, to: Date) => {
      if (!key) return null;
      try {
        let total = 0;
        let page: string | null = null;
        for (let i = 0; i < 5; i++) {
          const url = new URL("https://api.openai.com/v1/organization/costs");
          url.searchParams.set("start_time", String(Math.floor(from.getTime() / 1000)));
          url.searchParams.set("end_time", String(Math.floor(to.getTime() / 1000)));
          url.searchParams.set("bucket_width", "1d");
          url.searchParams.set("limit", "31");
          if (page) url.searchParams.set("page", page);
          const r = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
          if (!r.ok) return null;
          const j = (await r.json()) as { data?: { results?: { amount?: { value?: number } }[] }[]; has_more?: boolean; next_page?: string };
          for (const b of j.data ?? []) for (const x of b.results ?? []) total += Number(x.amount?.value ?? 0);
          if (!j.has_more || !j.next_page) break;
          page = j.next_page;
        }
        return Math.round(total * 100) / 100;
      } catch {
        return null;
      }
    };
    const thisStart = istMonthStart(now);
    const [thisMonth, lastMonth] = key ? await Promise.all([sum(thisStart, now), sum(istMonthStart(now, 1), thisStart)]) : [null, null];
    this.openaiSpend = { at: Date.now(), thisMonth, lastMonth };
    return this.openaiSpend;
  }

  private async period(from: Date, to: Date) {
    const rows = await this.prisma.apiUsage.groupBy({ by: ["service", "operation", "ok", "model"], where: { at: { gte: from, lt: to } }, _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true } });
    const by = new Map<string, Period>();
    for (const r of rows) {
      const p = by.get(r.service) ?? { calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, estUsd: null, operations: {} };
      const n = r._count._all;
      p.calls += n;
      if (!r.ok) p.failed += n;
      p.operations[r.operation] = (p.operations[r.operation] ?? 0) + n;
      const ti = r._sum.tokensIn ?? 0;
      const to2 = r._sum.tokensOut ?? 0;
      p.tokensIn += ti;
      p.tokensOut += to2;
      if (r.service === "OpenAI" && (ti || to2)) {
        const est = estimateUsd(r.model, ti, to2);
        if (est !== null) p.estUsd = (p.estUsd ?? 0) + est;
      }
      by.set(r.service, p);
    }
    return by;
  }

  async summary(now = new Date()) {
    const thisStart = istMonthStart(now);
    const lastStart = istMonthStart(now, 1);
    const [thisMonth, lastMonth, first, plivoUsd, plivoSpent, openaiBilled] = await Promise.all([
      this.period(thisStart, new Date(now.getTime() + 1000)),
      this.period(lastStart, thisStart),
      this.prisma.apiUsage.findFirst({ orderBy: { at: "asc" }, select: { at: true } }),
      this.plivoBalance(),
      this.plivoSpent(now),
      this.openaiBilled(now),
    ]);

    // Counts we can read from our own records, which reach back further than the call counter
    const range = (from: Date, to: Date) => ({ gte: from, lt: to });
    const voice = async (from: Date, to: Date) => {
      const [calls, sum] = await Promise.all([
        this.prisma.voiceCall.count({ where: { receivedAt: range(from, to) } }),
        this.prisma.voiceCall.aggregate({ where: { receivedAt: range(from, to) }, _sum: { durationSec: true } }),
      ]);
      return { calls, minutes: Math.round(((sum._sum.durationSec ?? 0) / 60) * 10) / 10 };
    };
    const whatsapp = (from: Date, to: Date) => this.prisma.whatsAppMessage.count({ where: { direction: "OUT", createdAt: range(from, to) } });
    const end = new Date(now.getTime() + 1000);
    const [voiceThis, voiceLast, waThis, waLast] = await Promise.all([voice(thisStart, end), voice(lastStart, thisStart), whatsapp(thisStart, end), whatsapp(lastStart, thisStart)]);

    const names = [...new Set([...thisMonth.keys(), ...lastMonth.keys(), "OpenAI", "Plivo", "WhatsApp (Meta)"])];
    const empty: Period = { calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, estUsd: null, operations: {} };
    const services = names.map((name) => ({ name, thisMonth: thisMonth.get(name) ?? empty, lastMonth: lastMonth.get(name) ?? empty }));

    const alerts: string[] = [];
    if (plivoUsd !== null && plivoUsd < PLIVO_LOW_USD) alerts.push(`Plivo balance is low: about $${plivoUsd.toFixed(2)} left.`);
    for (const s of services) {
      if (s.thisMonth.calls >= 5 && s.thisMonth.failed / s.thisMonth.calls >= 0.2) alerts.push(`${s.name}: ${s.thisMonth.failed} of ${s.thisMonth.calls} requests failed this month. Check its key and balance.`);
      if (s.lastMonth.calls >= 20 && s.thisMonth.calls > s.lastMonth.calls * 2) alerts.push(`${s.name}: this month's use is already more than double last month's.`);
    }

    // What we pay per unit is not something the services tell us, so the rates are set on the server (₹ per minute, ₹ per message).
    const rate = (k: string) => {
      const v = Number(process.env[k]);
      return Number.isFinite(v) && v > 0 ? v : null;
    };
    const sarvamRate = rate("RATE_SARVAM_INR_PER_MIN");
    const waRate = rate("RATE_WHATSAPP_INR_PER_MESSAGE");
    const spend = (mins: number, msgs: number) => ({
      sarvamInr: sarvamRate === null ? null : Math.round(mins * sarvamRate),
      whatsappInr: waRate === null ? null : Math.round(msgs * waRate),
    });

    const openai = services.find((s) => s.name === "OpenAI");
    const balances = [
      { service: "Plivo", balance: plivoUsd === null ? null : `$${plivoUsd.toFixed(2)}`, usedThisMonth: plivoSpent.thisMonth === null ? null : `$${plivoSpent.thisMonth.toFixed(2)}`, usedLastMonth: plivoSpent.lastMonth === null ? null : `$${plivoSpent.lastMonth.toFixed(2)}`, note: plivoUsd === null ? "Plivo could not be reached." : "Live from Plivo. Used = what Plivo charged for calls." },
      { service: "OpenAI", balance: null, usedThisMonth: openaiBilled.thisMonth !== null ? `$${openaiBilled.thisMonth.toFixed(2)} (from OpenAI)` : openai?.thisMonth.estUsd == null ? null : `about $${openai.thisMonth.estUsd.toFixed(2)}`, usedLastMonth: openaiBilled.lastMonth !== null ? `$${openaiBilled.lastMonth.toFixed(2)} (from OpenAI)` : openai?.lastMonth.estUsd == null ? null : `about $${openai.lastMonth.estUsd.toFixed(2)}`, note: openaiBilled.thisMonth !== null ? "Used = what OpenAI says we were charged. The balance is only on its billing page (Settings, Billing)." : "The balance is only on OpenAI's billing page (Settings, Billing). Used = our own estimate from tokens; give the key the Usage read permission to show OpenAI's real figure." },
      { service: "WhatsApp (Meta)", balance: null, usedThisMonth: `${waThis} messages${waRate === null ? "" : `, about ₹${Math.round(waThis * waRate)}`}`, usedLastMonth: `${waLast} messages${waRate === null ? "" : `, about ₹${Math.round(waLast * waRate)}`}`, note: "Meta shows the balance in Business settings, Payments. It is not available through the API." },
      { service: "Sarvam (voice)", balance: null, usedThisMonth: `${voiceThis.minutes} min${sarvamRate === null ? "" : `, about ₹${Math.round(voiceThis.minutes * sarvamRate)}`}`, usedLastMonth: `${voiceLast.minutes} min${sarvamRate === null ? "" : `, about ₹${Math.round(voiceLast.minutes * sarvamRate)}`}`, note: "The balance is in Sarvam's dashboard. Used = minutes of the calls we received." },
    ];

    return {
      generatedAt: now.toISOString(),
      balances,
      rates: { sarvamInrPerMin: sarvamRate, whatsappInrPerMessage: waRate },
      spend: { thisMonth: spend(voiceThis.minutes, waThis), lastMonth: spend(voiceLast.minutes, waLast) },
      trackingSince: first?.at.toISOString() ?? null,
      months: { thisMonth: thisStart.toISOString(), lastMonth: lastStart.toISOString() },
      services,
      plivo: { balanceUsd: plivoUsd, configured: Boolean(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN) },
      voice: { thisMonth: voiceThis, lastMonth: voiceLast },
      whatsapp: { thisMonth: waThis, lastMonth: waLast },
      alerts,
    };
  }
}
