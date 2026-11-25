import { WhatsAppDirection } from "@prisma/client";
import { IntakeService } from "./intake.service";
import { INTAKE_GUIDE } from "./intake-guide";
import { answerKey, loanFor } from "./intake.engine";

// A small pretend lead and chat, to see what the assistant makes of what the customer writes.
type Lead = { name: string; city: string | null; amount: number | null; loan: string | null };

function chat(opts: { lead: Lead; rows?: Record<string, string>; said: string; first?: boolean; extraction?: unknown; earlier?: { direction: WhatsAppDirection; body: string }[] }) {
  const lead = { ...opts.lead };
  const rows = new Map<string, { key: string; label: string; value: string }>();
  for (const [label, value] of Object.entries(opts.rows ?? {})) rows.set(answerKey(label), { key: answerKey(label), label, value });
  const updates: Record<string, unknown>[] = [];
  const reading: string[] = [];
  const writer: string[] = [];

  const prisma = {
    lead: {
      findUnique: async () => ({ name: lead.name, city: lead.city, amount: lead.amount, loanProduct: lead.loan ? { slug: lead.loan, name: loanFor(lead.loan)!.title } : null, answers: [...rows.values()] }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        if (typeof data.name === "string") lead.name = data.name;
        if (typeof data.city === "string") lead.city = data.city;
        if (typeof data.amount === "number") lead.amount = data.amount;
        const connect = (data.loanProduct as { connect?: { id: string } } | undefined)?.connect;
        if (connect) lead.loan = connect.id.replace(/^p-/, "");
        return {};
      },
    },
    loanProduct: { findUnique: async ({ where }: { where: { slug: string } }) => ({ id: `p-${where.slug}` }) },
    leadAnswer: {
      upsert: async ({ create }: { create: { key: string; label: string; value: string } }) => { rows.set(create.key, create); return create; },
      findUnique: async ({ where }: { where: { leadId_key: { key: string } } }) => rows.get(where.leadId_key.key) ?? null,
    },
    whatsAppConversation: { update: jest.fn(async () => ({})) },
    whatsAppMessage: {
      // newest first, as the service asks for them
      findMany: async () => [{ direction: WhatsAppDirection.IN, type: "text", body: opts.said }, ...[...(opts.earlier ?? [])].reverse().map((m) => ({ ...m, type: "text" }))],
      findFirst: async () => ({ body: opts.said, createdAt: new Date() }),
    },
  };
  (global as { fetch: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { messages: { role: string; content: string }[]; response_format?: unknown };
    const system = body.messages[0]!.content;
    if (system.startsWith("You decide whether")) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ slug: null }) } }] }) };
    const isReading = system.startsWith("You read a customer's");
    if (isReading) reading.push(system);
    else writer.push(body.messages.map((m) => m.content).join("\n"));
    const content = isReading ? JSON.stringify(opts.extraction ?? {}) : body.response_format ? JSON.stringify({ body: "Next question.", option_titles: [], menu_label: "Choose" }) : "Reply text.";
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  });
  const settings = { get: (k: string) => (k === "whatsapp.aiIntake" ? true : "Growth Capital Services") };
  const leads = { startAnotherEnquiry: jest.fn(), refreshSegment: async () => undefined };
  const svc = new IntakeService(prisma as never, settings as never, { get: () => "key" } as never, leads as never);
  return { svc, lead, rows, updates, reading, writer, convo: { id: "c", leadId: "l", name: lead.name } };
}

const BLANK: Lead = { name: "WhatsApp enquiry", city: null, amount: null, loan: null };
const KNOWN: Lead = { name: "Mahesh Ghadge", city: "Mumbai", amount: 4_000_000, loan: "home-loan" };

describe("understanding a need without the product's name", () => {
  it.each([
    ["I want to buy a flat in Thane", "home-loan"],
    ["need money against my shop", "loan-against-property"],
    ["my daughter is going abroad to do her masters", "education-loan"],
    ["mujhe ghar kharidna hai", "home-loan"],
  ])("picks the loan for %j even when the AI does not", async (said, slug) => {
    const t = chat({ lead: BLANK, said, first: true, extraction: {} });
    await t.svc.reply(t.convo);
    expect(t.updates.some((d) => (d.loanProduct as { connect?: { id: string } } | undefined)?.connect?.id === `p-${slug}`)).toBe(true);
    expect(t.lead.loan).toBe(slug);
  });

  it("leaves the loan open, to be asked, when the need could be several loans", async () => {
    const t = chat({ lead: BLANK, said: "I need a loan for my business", first: true, extraction: {} });
    await t.svc.reply(t.convo);
    expect(t.lead.loan).toBeNull();
  });

  it("tells the AI what each loan is for, so it can match by meaning too", async () => {
    const t = chat({ lead: BLANK, said: "hello, I want some funding", first: true });
    await t.svc.reply(t.convo);
    expect(t.reading[0]).toContain("home-loan = Home Loan: buying, building");
    expect(t.reading[0]).toContain("what they need");
  });

  it("goes on to that loan's own questions once the need is known, not back to 'which loan?'", async () => {
    const t = chat({ lead: { ...BLANK, name: "Mahesh Ghadge", city: "Mumbai", amount: 4_000_000 }, rows: { "You are": "Salaried", "Agreed to answer more questions": "Yes" }, said: "I want to buy a flat", extraction: {} });
    await t.svc.reply(t.convo);
    expect(t.lead.loan).toBe("home-loan");
    expect(t.writer.at(-1)).not.toMatch(/Which loan they need/);
    expect(t.writer.at(-1)).toMatch(/Ask exactly this ONE question/);
  });
});

describe("remembering what was already said", () => {
  it("shows the AI everything known about the customer, so nothing is asked again", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "ok" });
    await t.svc.reply(t.convo);
    expect(t.reading[0]).toContain("Already known about the customer");
    expect(t.reading[0]).toContain('"name":"Mahesh Ghadge"');
    expect(t.reading[0]).toContain('"city":"Mumbai"');
    expect(t.reading[0]).toContain('"loan":"Home Loan"');
    expect(t.reading[0]).toContain("₹40,00,000");
    expect(t.reading[0]).toContain('"applicant":"Salaried"');
  });
});

describe("changing something told earlier", () => {
  const SAID = { Mumbai: "Actually my city is Pune, please change it" };
  it("changes the city on the lead", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: SAID.Mumbai, extraction: { corrections: [{ key: "city", value: "Pune", evidence: "my city is Pune" }] } });
    await t.svc.reply(t.convo);
    expect(t.lead.city).toBe("Pune");
    expect(t.writer.at(-1)).toContain("city: Pune");
  });
  it("changes the amount, from the figure they wrote", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "make it 50 lakh instead", extraction: { corrections: [{ key: "loan_amount", value: "5000000", evidence: "make it 50 lakh" }] } });
    await t.svc.reply(t.convo);
    expect(t.lead.amount).toBe(5_000_000);
  });
  it("changes the name", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "sorry, my name is Mahesh Ghadge Patil", extraction: { corrections: [{ key: "name", value: "Mahesh Ghadge Patil", evidence: "my name is Mahesh Ghadge Patil" }] } });
    await t.svc.reply(t.convo);
    expect(t.lead.name).toBe("Mahesh Ghadge Patil");
  });
  it("changes what they are", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "actually I am a Proprietor", extraction: { corrections: [{ key: "applicant", value: "Proprietor", evidence: "I am a Proprietor" }] } });
    await t.svc.reply(t.convo);
    expect(t.rows.get(answerKey("You are"))?.value).toBe("Proprietor");
  });
  it("does not change anything just because the AI says so: they must say it is a change", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "I live in Pune", extraction: { corrections: [{ key: "city", value: "Pune", evidence: "I live in Pune" }] } });
    await t.svc.reply(t.convo);
    expect(t.lead.city).toBe("Mumbai");
  });
  it("does not take words the customer never wrote, or 'same', as a new value", async () => {
    const a = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "actually it is Pune", extraction: { corrections: [{ key: "city", value: "Goa", evidence: "it is Goa" }] } });
    await a.svc.reply(a.convo);
    expect(a.lead.city).toBe("Mumbai");
    const b = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "actually same", extraction: { corrections: [{ key: "city", value: "same", evidence: "same" }] } });
    await b.svc.reply(b.convo);
    expect(b.lead.city).toBe("Mumbai");
  });
});

describe("the language the customer writes in", () => {
  it("is kept on the lead", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried" }, said: "mujhe ghar ke liye loan chahiye, mera naam Mahesh hai" });
    await t.svc.reply(t.convo);
    expect(t.rows.get(answerKey("Preferred language"))?.value).toBe("Hindi (written in English letters)");
  });
  it("is not undone by a short English reply", async () => {
    const t = chat({ lead: KNOWN, rows: { "You are": "Salaried", "Preferred language": "Marathi" }, said: "ok" });
    await t.svc.reply(t.convo);
    expect(t.rows.get(answerKey("Preferred language"))?.value).toBe("Marathi");
  });
});

describe("ratios worked out from what they said", () => {
  const slug = Object.keys(INTAKE_GUIDE).find((s) => ["propertyValue", "existingEmi", "netSalary"].every((k) => INTAKE_GUIDE[s]!.fields.some((f) => f.key === k)))!;
  const label = (key: string) => INTAKE_GUIDE[slug]!.fields.find((f) => f.key === key)!.label;
  it("works out the loan against the value, and the EMIs against income", async () => {
    const t = chat({
      lead: { ...KNOWN, loan: slug, amount: 4_000_000 },
      rows: { "You are": "Salaried", "Agreed to answer more questions": "Yes", [label("propertyValue")]: "₹80,00,000", [label("existingEmi")]: "₹20,000", [label("netSalary")]: "₹1,00,000" },
      said: "ok",
    });
    await t.svc.reply(t.convo);
    expect(t.rows.get(answerKey("Loan to value (worked out)"))?.value).toMatch(/^50% \(loan ₹40,00,000 on a value of ₹80,00,000/);
    expect(t.rows.get(answerKey("Existing EMIs against income (worked out)"))?.value).toMatch(/^20% \(₹20,000 a month on an income of ₹1,00,000\)/);
  });
  it("gives no ratio when a figure is missing, and never divides by nothing", async () => {
    const t = chat({ lead: { ...KNOWN, loan: slug, amount: 4_000_000 }, rows: { "You are": "Salaried", "Agreed to answer more questions": "Yes", [label("existingEmi")]: "₹20,000" }, said: "ok" });
    await t.svc.reply(t.convo);
    expect(t.rows.has(answerKey("Loan to value (worked out)"))).toBe(false);
    expect(t.rows.has(answerKey("Existing EMIs against income (worked out)"))).toBe(false);
  });
});
