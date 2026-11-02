import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApplicationStatus, AuditAction, LeadStatus, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "../leads/leads.service";
import { ApplicationsService } from "../applications/applications.service";
import { SearchService } from "../search/search.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { istDayEnd, istParts } from "../common/date.util";
import type { AuthUser } from "../auth/auth.decorators";
import { redact } from "./redact";
import { checkQuery, MAX_ROWS, VIEW_CATALOG } from "./sql-guard";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ModelMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const MAX_ROUNDS = 5;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Search the CRM for people and files by name, phone number, email, lead number or application number. Returns matching leads, applications, partners and lenders, each with an id.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead",
      description: "Full details of one lead: contact, loan wanted, status, owner, follow-up notes, the answers they gave on the website form. Use the id from search, or the lead number.",
      parameters: { type: "object", properties: { id: { type: "string" }, lead_no: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_application",
      description: "Full details of one loan application (file): applicants, loan and lender, status, documents, sanction and disbursements. Use the id from search.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_query",
      description: `Answer any question about the CRM's data with one read-only SQL SELECT. Use it for counts, totals, lists, comparisons, rankings and anything over a period, such as "how many leads came from Google this month", "total disbursed by lender", "which advisor has the most open files". You only see what this person is allowed to see.
${VIEW_CATALOG}`,
      parameters: { type: "object", properties: { sql: { type: "string", description: "One SELECT statement over the ai_ views." } }, required: ["sql"] },
    },
  },
  {
    type: "function",
    function: {
      name: "overview",
      description: "Counts: leads by status, applications by status, and follow-ups due today, for the files this person can see.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "follow_ups_due",
      description: "Leads whose follow-up is due today or overdue, oldest first.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_leads",
      description: "The newest leads, optionally only those with one status (NEW, CONTACTED, QUALIFIED, CONVERTED, LOST).",
      parameters: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } },
    },
  },
] as const;

/**
 * A read-only chat for staff: they ask about a client or the pipeline and it answers from the CRM's own data.
 * It can only look things up through the same scoped services the screens use, so an advisor is never shown
 * another advisor's files, and identity and bank numbers are stripped before the model sees anything.
 */
@Injectable()
export class AssistantService {
  private readonly log = new Logger(AssistantService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private leads: LeadsService,
    private applications: ApplicationsService,
    private search: SearchService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  get enabled() {
    return Boolean((this.config.get<string>("OPENAI_API_KEY") ?? "").trim());
  }

  async ask(history: ChatMessage[], user: AuthUser, ip?: string) {
    if (!this.enabled) {
      throw new ServiceUnavailableException("The AI assistant is not set up yet. Ask your admin to add the OpenAI key to the server.");
    }
    const turns = history
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }));
    const question = turns.at(-1);
    if (!question || question.role !== "user") throw new BadRequestException("Ask a question first.");

    // Every question is on record, so what staff ask the CRM can be reviewed like any other access.
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "AssistantQuestion",
      entityId: user.id,
      entityLabel: `${user.name} asked the AI assistant`,
      changes: { question: { from: null, to: question.content.slice(0, 300) } },
      ...(ip ? { ip } : {}),
    });

    const messages: ModelMessage[] = [{ role: "system", content: this.systemPrompt(user) }, ...turns];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const reply = await this.complete(messages);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) return { reply: (reply.content ?? "").trim() || "I could not find an answer to that." };

      messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: calls });
      for (const call of calls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: await this.runTool(call, user) });
      }
    }
    return { reply: "That needed too many steps. Try asking about one client or one thing at a time." };
  }

  private systemPrompt(user: AuthUser) {
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return [
      `You are the assistant inside the CRM of ${this.settings.get<string>("org.name")}, a loan DSA (loan consultancy) in India. You are talking to ${user.name}, who is ${user.role.toLowerCase()}.`,
      `Today is ${today}.`,
      "For a single client or file use search, get_lead or get_application. For anything counted, totalled, listed or compared across many records, or over a period, use run_query. If a query fails, read the error and try a corrected one. Say which period or filter you used.",
      "Answer only from what the tools return. Never guess a name, number, amount or status; if a tool finds nothing, say so plainly.",
      "You can only read. You cannot change, create, delete or send anything. If asked to, say that staff must do it in the CRM.",
      "Write amounts in rupees in the Indian style (for example ₹25,00,000). Keep answers short and plain, with short lists for several items. Mention lead numbers (like #12) and application numbers so staff can find the file.",
      "Do not give legal, tax or investment advice, and do not promise that any loan will be approved.",
      "Some details (PAN, Aadhaar, bank account numbers) are hidden from you on purpose. If asked for them, say they are kept out of the assistant and can be seen on the file.",
    ].join("\n");
  }

  private async complete(messages: ModelMessage[]): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
    const model = this.config.get<string>("AI_MODEL")?.trim() || "gpt-5-nano";
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.get<string>("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_completion_tokens: 4000,
          // The small reasoning models think at length by default; a short think is enough for a lookup and keeps it cheap.
          ...(/^(gpt-5|o\d)/.test(model) && { reasoning_effort: "low" }),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      this.log.error(`OpenAI request failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException("The assistant could not be reached just now. Please try again.");
    }
    if (!res.ok) {
      this.log.error(`OpenAI answered HTTP ${res.status}`);
      throw new ServiceUnavailableException(
        res.status === 401 ? "The assistant's key was refused. Ask your admin to check the OpenAI key." : "The assistant is busy or unavailable. Please try again in a moment.",
      );
    }
    const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] } | null;
    const message = json?.choices?.[0]?.message;
    return { content: message?.content ?? null, ...(message?.tool_calls && { tool_calls: message.tool_calls }) };
  }

  private async runTool(call: ToolCall, user: AuthUser): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: "Could not read the request." });
    }
    try {
      const data = await this.tool(call.function.name, args, user);
      return JSON.stringify(redact(data)).slice(0, 12_000);
    } catch (error) {
      // "Not found" for a file this person cannot see looks exactly like "not found": nothing leaks.
      return JSON.stringify({ error: (error as { status?: number }).status === 404 ? "Not found." : "That lookup failed." });
    }
  }

  private async tool(name: string, args: Record<string, unknown>, user: AuthUser): Promise<unknown> {
    const staff = user.role === Role.ADVISOR;
    const leadScope = staff ? { assignedOfficerId: user.id } : {};
    const appScope = staff ? { ownerId: user.id } : {};

    switch (name) {
      case "search": {
        const q = String(args["query"] ?? "").slice(0, 100);
        const { groups } = await this.search.search(q, 6, user);
        return groups
          .filter((g) => ["lead", "application", "partner", "lender"].some((t) => g.type.toLowerCase().includes(t)))
          .map((g) => ({ type: g.type, hits: g.hits.map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle, where: h.where })) }));
      }
      case "get_lead": {
        let id = typeof args["id"] === "string" ? args["id"] : "";
        if (!id && typeof args["lead_no"] === "number") {
          id = (await this.prisma.lead.findFirst({ where: { leadNo: args["lead_no"], ...leadScope }, select: { id: true } }))?.id ?? "";
        }
        if (!id) return { error: "Not found." };
        const lead = await this.leads.findOne(id, user);
        const { followUps, application, answers, missingForMeeting, ...rest } = lead as unknown as Record<string, unknown> & {
          followUps?: { note?: string; createdAt?: Date; user?: { name?: string } }[];
        };
        return {
          ...rest,
          answers,
          missingForMeeting,
          application,
          recentFollowUps: (followUps ?? []).slice(0, 6).map((f) => ({ when: f.createdAt, by: f.user?.name, note: f.note })),
        };
      }
      case "get_application": {
        const app = await this.applications.findOne(String(args["id"] ?? ""), user);
        return app;
      }
      case "run_query": {
        const checked = checkQuery(String(args["sql"] ?? ""));
        if ("error" in checked) return { error: checked.error };
        const officer = user.role === Role.ADVISOR ? user.id : "";
        try {
          const rows = await this.prisma.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
              await tx.$queryRaw`SELECT set_config('app.officer_id', ${officer}, true)`;
              await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 5000");
              return tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM (${checked.sql}) AS q LIMIT ${MAX_ROWS}`);
            },
            { timeout: 10_000 },
          );
          return { rowCount: rows.length, truncatedAt: rows.length === MAX_ROWS ? MAX_ROWS : undefined, rows };
        } catch (error) {
          // The database's message helps the model fix its query; keep it short and free of anything else.
          const text = (error as Error).message.split("\n").filter(Boolean).pop() ?? "The query failed.";
          return { error: text.slice(0, 200) };
        }
      }
      case "overview": {
        const [leadRows, appRows, due] = await Promise.all([
          this.prisma.lead.groupBy({ by: ["status"], where: { ...leadScope, archivedAt: null }, _count: true }),
          this.prisma.application.groupBy({ by: ["status"], where: { ...appScope, archivedAt: null }, _count: true }),
          this.prisma.lead.count({
            where: { ...leadScope, archivedAt: null, status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] }, nextFollowUpAt: { lte: istDayEnd(istParts(new Date())) } },
          }),
        ]);
        return {
          leadsByStatus: Object.fromEntries(leadRows.map((r) => [r.status, r._count])),
          applicationsByStatus: Object.fromEntries(appRows.map((r) => [r.status as ApplicationStatus, r._count])),
          followUpsDueTodayOrOverdue: due,
        };
      }
      case "follow_ups_due": {
        const rows = await this.prisma.lead.findMany({
          where: { ...leadScope, archivedAt: null, status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] }, nextFollowUpAt: { lte: istDayEnd(istParts(new Date())) } },
          orderBy: { nextFollowUpAt: "asc" },
          take: 15,
          select: { id: true, leadNo: true, name: true, phone: true, status: true, nextFollowUpAt: true, assignedOfficer: { select: { name: true } } },
        });
        return rows;
      }
      case "recent_leads": {
        const status = typeof args["status"] === "string" && (Object.values(LeadStatus) as string[]).includes(args["status"]) ? (args["status"] as LeadStatus) : undefined;
        const limit = Math.min(Math.max(Number(args["limit"]) || 10, 1), 15);
        return this.prisma.lead.findMany({
          where: { ...leadScope, archivedAt: null, ...(status && { status }) },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, leadNo: true, name: true, phone: true, city: true, status: true, source: true, createdAt: true, loanProduct: { select: { name: true } }, assignedOfficer: { select: { name: true } } },
        });
      }
      default:
        return { error: "Unknown lookup." };
    }
  }
}
