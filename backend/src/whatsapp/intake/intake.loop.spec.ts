import { WhatsAppDirection } from "@prisma/client";
import { IntakeService } from "./intake.service";
import { answerKey, loanFor, nextQuestions, type Answers } from "./intake.engine";

// The chat that went wrong: the customer answered "Rent" to a question that needs an amount, and was asked it three more times.
const SLUG = "balance-transfer";

function setup(userSays: () => string, aiValue: () => string = userSays, lastOnly = false) {
  const loan = loanFor(SLUG)!;
  // everything before "other monthly income" is already answered
  const answers: Answers = {};
  let openKey = "otherIncome";
  for (;;) {
    const q = nextQuestions(SLUG, answers, 1);
    const f = q.fields[0]!;
    if (lastOnly ? q.remaining <= 1 : f.key === "otherIncome") { openKey = f.key; break; }
    answers[f.key] = f.kind === "choice" ? f.options![0]! : f.kind === "amount" ? "₹100000" : f.kind === "percent" ? "10%" : "x";
  }
  const rows = new Map<string, { key: string; label: string; value: string }>();
  for (const [k, v] of Object.entries(answers)) {
    const f = loan.fields.find((x) => x.key === k)!;
    rows.set(answerKey(f.label), { key: answerKey(f.label), label: f.label, value: v });
  }
  rows.set(answerKey("You are"), { key: answerKey("You are"), label: "You are", value: "Proprietor" });
  rows.set(answerKey("Agreed to answer more questions"), { key: answerKey("Agreed to answer more questions"), label: "x", value: "Yes" });

  const updates: unknown[] = [];
  const prisma = {
    lead: {
      findUnique: async () => ({ name: "Mahesh Ghadge", city: "Mumbai", amount: 20000000, loanProduct: { slug: SLUG, name: "Balance Transfer" }, answers: [...rows.values()] }),
      update: async (a: unknown) => { updates.push(a); return {}; },
    },
    loanProduct: { findUnique: async () => ({ id: "p" }) },
    leadAnswer: {
      upsert: async ({ create }: { create: { key: string; label: string; value: string } }) => { rows.set(create.key, create); return create; },
      findUnique: async ({ where }: { where: { leadId_key: { key: string } } }) => rows.get(where.leadId_key.key) ?? null,
    },
    whatsAppMessage: {
      findMany: async () => [{ direction: WhatsAppDirection.OUT, type: "text", body: "Other regular monthly income?" }, { direction: WhatsAppDirection.IN, type: "text", body: userSays() }].reverse(),
      findFirst: async () => ({ body: userSays() }),
    },
  };
  const tasks: string[] = [];
  const answerKeyWanted = openKey;
  (global as { fetch: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { messages: { role: string; content: string }[]; response_format?: unknown };
    const system = body.messages[0]!.content;
    const reading = system.startsWith("You read a customer's");
    if (!reading) tasks.push(body.messages[body.messages.length - 1]!.content);
    const content = reading ? JSON.stringify({ answers: [{ key: answerKeyWanted, value: aiValue() }] }) : body.response_format ? JSON.stringify({ body: "Next question.", option_titles: [], menu_label: "Choose" }) : "Reply text.";
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  });
  const settings = { get: (k: string) => (k === "whatsapp.aiIntake" ? true : "Growth Capital Services") };
  const config = { get: () => "key" };
  const svc = new IntakeService(prisma as never, settings as never, config as never);
  return { svc, rows, tasks, updates };
}

describe("a question the customer keeps answering without a usable figure", () => {
  it("explains once what is needed, then skips it for the expert instead of asking again and again", async () => {
    let said = "Rent";
    const { svc, rows, tasks } = setup(() => said);
    const chat = { id: "c", leadId: "l", name: "Mahesh" };

    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/could not be used/);
    expect(tasks.at(-1)).toMatch(/example answer/);
    expect(rows.has(answerKey("Other regular monthly income (rent, interest, etc.)"))).toBe(false);

    await svc.reply(chat);
    const skipped = rows.get(answerKey("Other regular monthly income (rent, interest, etc.)"));
    expect(skipped?.value).toMatch(/Not given on WhatsApp/);
    expect(tasks.at(-1)).toMatch(/our expert can take that on the call/);
    expect(tasks.at(-1)).not.toMatch(/Other regular monthly income/); // it moved on to the next question
    said = "";
  });

  it("takes a real figure the first time", async () => {
    const { svc, rows } = setup(() => "55000");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(rows.get(answerKey("Other regular monthly income (rent, interest, etc.)"))?.value).toBe("₹55,000");
  });

  it("keeps going past 20 answers: the form is not cut short", async () => {
    const { svc, tasks } = setup(() => "55000");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(tasks.at(-1)).not.toMatch(/expert from our team will contact them soon/);
    expect(tasks.at(-1)).toMatch(/Ask exactly this ONE question/);
  });
});

describe("saying 'not sure'", () => {
  it("is noted for the expert and the chat moves on without pressing", async () => {
    const { svc, rows, tasks } = setup(() => "not sure");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(rows.get(answerKey("Other regular monthly income (rent, interest, etc.)"))?.value).toMatch(/Not sure/);
    expect(tasks.at(-1)).toMatch(/our expert can take that on the call/);
    expect(tasks.at(-1)).not.toMatch(/could not be used/);
  });
});

describe("the AI must not invent a figure", () => {
  it("'Rent' with no number is not turned into 0: the customer is asked for the figure", async () => {
    const { svc, rows, tasks } = setup(() => "Rent", () => "0");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(rows.has(answerKey("Other regular monthly income (rent, interest, etc.)"))).toBe(false);
    expect(tasks.at(-1)).toMatch(/could not be used/);
  });
  it("a real 'none' is still taken as 0", async () => {
    const { svc, rows } = setup(() => "none", () => "0");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(rows.get(answerKey("Other regular monthly income (rent, interest, etc.)"))?.value).toBe("₹0");
  });
});

describe("carrying on after a break or a reminder", () => {
  it("'continue' just carries on with the open question, it is not an answer to it", async () => {
    const { svc, rows, tasks } = setup(() => "continue");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(tasks.at(-1)).not.toMatch(/could not be used/);
    expect(tasks.at(-1)).toMatch(/Ask exactly this ONE question/);
    expect(rows.has(answerKey("Other regular monthly income (rent, interest, etc.)"))).toBe(false);
  });
});

describe("what the chat tells the lead", () => {
  it("sets the lead's employment type from who the customer is, so it lands in the right working list", async () => {
    const { svc, updates } = setup(() => "55000");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(JSON.stringify(updates)).toMatch(/SELF_EMPLOYED/);
  });
});

describe("the end of the questions", () => {
  it("answering the very last question shows the summary and the document checklist, not a 'late addition' note", async () => {
    const { svc, tasks } = setup(() => "No", () => "No", true);
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    const t = tasks.at(-1)!;
    expect(t).toMatch(/short confirmation of what has been noted/);
    expect(t).toMatch(/\/checklists\/balance-transfer-checklist\.pdf/);
    expect(t).not.toMatch(/added a detail after the questions were over/);
  });
});
