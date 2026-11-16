import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

/** Only a plain web address is ever offered as a recording link. */
const recordingOf = (payload: unknown): string | null => {
  const v = payload && typeof payload === "object" ? (payload as Record<string, unknown>).recording_url : null;
  return typeof v === "string" && /^https:\/\/\S+$/i.test(v) ? v : null;
};

/** Staff view of the calls the AI phone agent made or took: what was said, what came of it, and the lead it made. */
@Controller("voice-calls")
@Roles(Role.ADMIN, Role.MANAGER)
export class VoiceCallsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query("search") search?: string, @Query("outcome") outcome?: string, @Query("page") page?: string) {
    const pageSize = 25;
    const p = Math.max(1, Number(page) || 1);
    const term = search?.trim().replace(/\D/g, "") ? search!.trim().replace(/\D/g, "").slice(-10) : "";
    const where = {
      ...(outcome ? { outcome } : {}),
      ...(term ? { phone: { contains: term } } : search?.trim() ? { OR: [{ summary: { contains: search.trim(), mode: "insensitive" as const } }, { transcript: { contains: search.trim(), mode: "insensitive" as const } }] } : {}),
    };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.voiceCall.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (p - 1) * pageSize, take: pageSize, select: { id: true, receivedAt: true, phone: true, status: true, durationSec: true, outcome: true, leadId: true, summary: true, payload: true } }),
      this.prisma.voiceCall.count({ where }),
      this.prisma.voiceCall.groupBy({ by: ["outcome"], _count: { _all: true } }),
    ]);
    const leads = await this.prisma.lead.findMany({ where: { id: { in: rows.map((r) => r.leadId).filter((x): x is string => Boolean(x)) } }, select: { id: true, leadNo: true, name: true } });
    const byId = new Map(leads.map((l) => [l.id, l]));
    return {
      items: rows.map(({ payload, ...r }) => ({ ...r, hasRecording: Boolean(recordingOf(payload)), lead: r.leadId ? (byId.get(r.leadId) ?? null) : null })),
      total, page: p, pageSize,
      counts: Object.fromEntries(grouped.map((g) => [g.outcome, g._count._all])),
    };
  }

  @Get(":id")
  async one(@Param("id") id: string) {
    const call = await this.prisma.voiceCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException("Call not found");
    const lead = call.leadId ? await this.prisma.lead.findUnique({ where: { id: call.leadId }, select: { id: true, leadNo: true, name: true } }) : null;
    const { payload, ...rest } = call;
    return { ...rest, lead, recordingUrl: recordingOf(payload) };
  }
}
