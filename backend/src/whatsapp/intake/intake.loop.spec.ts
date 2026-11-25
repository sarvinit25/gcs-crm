import { WhatsAppDirection } from "@prisma/client";
import { IntakeService } from "./intake.service";
import { answerKey, loanFor, nextQuestions, type Answers } from "./intake.engine";

// The chat that went wrong: the customer answered "Rent" to a question that needs an amount, and was asked it three more times.
const SLUG = "balance-transfer";

function setup(userSays: () => string, aiValue: () => string = userSays, lastOnly = false, firstMessage = false, done = false, opts: { extraction?: () => unknown; stopAt?: string } = {}) {
  const loan = loanFor(SLUG)!;
  // everything before "other monthly income" is already answered
  const answers: Answers = {};
  let openKey = opts.stopAt ?? "otherIncome";
  for (;;) {
    const q = nextQuestions(SLUG, answers, 1);
    const f = q.fields[0];
    if (!f) break; // everything answered
    if (!done && (lastOnly ? q.remaining <= 1 : f.key === (opts.stopAt ?? "otherIncome"))) { openKey = f.key; break; }
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
    whatsAppConversation: { update: jest.fn(async () => ({})) },
    whatsAppMessage: {
      findMany: async () => (firstMessage ? [{ direction: WhatsAppDirection.IN, type: "text", body: userSays() }] : [{ direction: WhatsAppDirection.OUT, type: "text", body: "Other regular monthly income?" }, { direction: WhatsAppDirection.IN, type: "text", body: userSays() }].reverse()),
      findFirst: async () => ({ body: userSays() }),
    },
  };
  const tasks: string[] = [];
  const answerKeyWanted = openKey;
  (global as { fetch: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { messages: { role: string; content: string }[]; response_format?: unknown };
    const system = body.messages[0]!.content;
    if (system.startsWith("You decide whether")) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ slug: "new-car-loan" }) } }] }) };
    const reading = system.startsWith("You read a customer's");
    if (!reading) tasks.push(body.messages[body.messages.length - 1]!.content);
    const content = reading ? JSON.stringify(opts.extraction ? opts.extraction() : { answers: [{ key: answerKeyWanted, value: aiValue(), evidence: userSays() }] }) : body.response_format ? JSON.stringify({ body: "Next question.", option_titles: [], menu_label: "Choose" }) : "Reply text.";
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  });
  const settings = { get: (k: string) => (k === "whatsapp.aiIntake" ? true : "Growth Capital Services") };
  const config = { get: () => "key" };
  const leads = { startAnotherEnquiry: jest.fn(async () => ({ id: "l2", leadNo: 2 })), refreshSegment: async () => undefined };
  const svc = new IntakeService(prisma as never, settings as never, config as never, leads as never);
  return { svc, rows, tasks, updates, leads, prisma };
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
    const { svc, tasks } = setup(() => "Any time", () => "Any time", true);
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    const t = tasks.at(-1)!;
    expect(t).toMatch(/short confirmation of what has been noted/);
    expect(t).toMatch(/\/checklists\/balance-transfer-checklist\.pdf/);
    expect(t).not.toMatch(/added a detail after the questions were over/);
  });
});

describe("the way Ria speaks", () => {
  it("opens with the prescribed welcome, word for word", async () => {
    const { svc, tasks } = setup(() => "hi", () => "x", false, true);
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    const t = tasks.at(-1)!;
    expect(t).toMatch(/Hello! Welcome to Growth Capital Services\./);
    expect(t).toMatch(/I'm Ria, your AI Loan Assistant\./);
    expect(t).toMatch(/network of 75\+ Banks and NBFCs/);
    expect(t).toMatch(/Which type of financial assistance are you looking for\?/);
  });
  it("introduces each new part of the form with a 'Now, let's understand' lead-in", async () => {
    const { svc, tasks } = setup(() => "55000");
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(tasks.at(-1)).toMatch(/starts a new part of the form/);
    expect(tasks.at(-1)).toMatch(/Now, let's understand/);
  });
});

describe("a second loan for the same customer", () => {
  it("starts a separate enquiry that carries what we know, and the chat moves to it", async () => {
    const { svc, leads, prisma, tasks } = setup(() => "I also need a car loan", () => "x", false, false, true);
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(leads.startAnotherEnquiry).toHaveBeenCalledWith("l", "new-car-loan", expect.any(Array));
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { leadId: "l2" } });
    expect(tasks.at(-1)).toMatch(/separate enquiry has been started/);
  });
  it("does nothing for a message that is not asking for another loan", async () => {
    // the mocked AI would answer "car loan" to anything it is asked, so only the guard on the message keeps this out
    const { svc, leads } = setup(() => "please call me tomorrow evening", () => "x", false, false, true);
    await svc.reply({ id: "c", leadId: "l", name: "Mahesh" });
    expect(leads.startAnotherEnquiry).not.toHaveBeenCalled();
  });
});

// What went wrong in a real chat: a correction taken for "Not sure", the correction lost, and facts thrown away.
describe("listening to what the customer actually says", () => {
  const keyOf = (labelStart: string) => loanFor(SLUG)!.fields.find((f) => f.label.startsWith(labelStart))!.key;
  const chat = { id: "c", leadId: "l", name: "Mahesh" };
  const INCOME = answerKey("Other regular monthly income (rent, interest, etc.)");

  it("never takes a correction for the answer to the open question, and applies the correction", async () => {
    const propKey = keyOf("Approximate market value today");
    const { svc, rows, tasks } = setup(() => "Correction: My property is worth ₹2.5 crore, not ₹2 crore.", undefined, false, false, false, {
      extraction: () => ({ answers: [{ key: "otherIncome", value: "Not sure", evidence: "Not sure" }], corrections: [{ key: propKey, value: "25000000", evidence: "My property is worth ₹2.5 crore" }] }),
    });
    await svc.reply(chat);
    expect(rows.has(INCOME)).toBe(false); // "Not sure" was never said
    expect(rows.get(answerKey("Approximate market value today"))?.value).toBe("₹2,50,00,000");
    expect(tasks.at(-1)).toMatch(/corrected an earlier answer/);
    expect(tasks.at(-1)).toMatch(/Ask exactly this ONE question/); // the open question is not forgotten
  });

  it("needs the customer's own words to back an answer given in a long message", async () => {
    const { svc, rows } = setup(() => "I have been thinking about it and it is around fifty thousand now", undefined, false, false, false, {
      extraction: () => ({ answers: [{ key: "otherIncome", value: "50000", evidence: "nothing of the kind was said" }] }),
    });
    await svc.reply(chat);
    expect(rows.has(INCOME)).toBe(false);
  });

  it("takes a short reply as its own evidence", async () => {
    const { svc, rows } = setup(() => "55000", undefined, false, false, false, { extraction: () => ({ answers: [{ key: "otherIncome", value: "55000" }] }) });
    await svc.reply(chat);
    expect(rows.get(INCOME)?.value).toBe("₹55,000");
  });

  it("keeps a fact the customer volunteers when it clearly belongs to a question still ahead", async () => {
    const cibil = keyOf("Roughly what is your CIBIL");
    const { svc, rows } = setup(() => "My CIBIL is 650 and I paid late twice", undefined, false, false, false, {
      extraction: () => ({ answers: [{ key: cibil, value: "650 to 699", evidence: "My CIBIL is 650" }] }),
    });
    await svc.reply(chat);
    expect(rows.get(answerKey("Roughly what is your CIBIL score?"))?.value).toBe("650 to 699");
  });

  it("does not take a volunteered figure for a question it does not belong to", async () => {
    const cibil = keyOf("Roughly what is your CIBIL");
    const { svc, rows } = setup(() => "I earn 80000 every month and that is steady", undefined, false, false, false, {
      extraction: () => ({ answers: [{ key: cibil, value: "750 or above", evidence: "I earn 80000 every month" }] }),
    });
    await svc.reply(chat);
    expect(rows.has(answerKey("Roughly what is your CIBIL score?"))).toBe(false);
  });

  it("turns 'same' for a place into the place they gave before, never the word itself", async () => {
    const { svc, rows } = setup(() => "same", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [{ key: "propertyArea", value: "same", evidence: "same" }] }) });
    rows.set(answerKey("Location"), { key: answerKey("Location"), label: "Location", value: "Andheri West" });
    await svc.reply(chat);
    expect(rows.get(answerKey("Location of the property"))?.value).toBe("Andheri West");
  });

  it("falls back to the city when no other place was given, and still never writes 'same'", async () => {
    const { svc, rows } = setup(() => "Same as above", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [{ key: "propertyArea", value: "Same as above", evidence: "Same as above" }] }) });
    // the earlier place question was skipped, so there is no place to point at: the city they gave is the nearest thing
    rows.set(answerKey("Location"), { key: answerKey("Location"), label: "Location", value: "Not sure (the expert will confirm)" });
    await svc.reply(chat);
    expect(rows.get(answerKey("Location of the property"))?.value).toBe("Mumbai");
  });

  it("does the same when the AI hands nothing back and the short reply is taken as the answer", async () => {
    const { svc, rows } = setup(() => "same", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [] }) });
    rows.set(answerKey("Location"), { key: answerKey("Location"), label: "Location", value: "Powai" });
    await svc.reply(chat);
    expect(rows.get(answerKey("Location of the property"))?.value).toBe("Powai");
  });

  it("notes a question like 'which bank is best' for the expert and does not answer it", async () => {
    const { svc, rows, tasks } = setup(() => "Which would be the best bank for my loan can you just tell me that", undefined, false, false, false, {
      extraction: () => ({ answers: [], their_question: "which bank is best" }),
    });
    await svc.reply(chat);
    expect(rows.get(answerKey("Questions for the expert"))?.value).toMatch(/best bank/);
    expect(tasks.at(-1)).toMatch(/do NOT name any bank/);
    expect(tasks.at(-1)).toMatch(/still open/);
  });

  it("keeps something the customer mentions that no question took, and says it was noted", async () => {
    const { svc, rows, tasks } = setup(() => "I earn about 80000 and my shop is in Thane", undefined, false, false, false, { extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(rows.get(answerKey("Also said in the chat"))?.value).toMatch(/80000/);
    expect(tasks.at(-1)).toMatch(/has been noted for the expert/);
  });
});

// The replies that made no sense in a real chat: whose question it is, what it follows up on, and what was already said.
describe("replies that make sense", () => {
  const chat = { id: "c", leadId: "l", name: "Mahesh" };

  it("tells the writer that the other earner's questions are about that person, not the customer", async () => {
    const { svc, tasks } = setup(() => "x", undefined, false, false, false, { stopAt: "extraEarnerIncome", extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/This question is about the other earning member/);
    expect(tasks.at(-1)).toMatch(/never say "you" for that person/);
  });

  it("gives a follow-up question the question it follows up on, with the customer's answer", async () => {
    const { svc, tasks } = setup(() => "x", undefined, false, false, false, { stopAt: "existingEmi", extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/It follows up on "Do you have any other running loans or credit cards, apart from this one\?", which the customer answered "Yes"/);
  });

  it("gives the writer the facts already given as background only, and tells it to ask just the one question", async () => {
    const { svc, tasks } = setup(() => "x", undefined, false, false, false, { extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/Background, for your information only: facts the customer has already given/);
    expect(tasks.at(-1)).toMatch(/Your message must contain ONLY the one question above/);
  });

  it("asks 'lakh or crore?' when a bare 1 is given for an amount, instead of a muddled reply", async () => {
    const { svc, rows, tasks } = setup(() => "1", undefined, false, false, false, { extraction: () => ({ answers: [{ key: "otherIncome", value: "1", evidence: "1" }] }) });
    await svc.reply(chat);
    expect(rows.has(answerKey("Other regular monthly income (rent, interest, etc.)"))).toBe(false);
    expect(tasks.at(-1)).toMatch(/too small to be rupees/);
    expect(tasks.at(-1)).toMatch(/lakh or crore/);
  });

  it("does not take a short message for a choice it does not say", async () => {
    const { svc, rows } = setup(() => "LAP top-up loan", undefined, false, false, false, { stopAt: "hasLoans", extraction: () => ({ answers: [{ key: "hasLoans", value: "Yes" }] }) });
    await svc.reply(chat);
    expect(rows.has(answerKey("Do you have any other running loans or credit cards, apart from this one?"))).toBe(false);
  });

  it("reads what the customer said before the long questions began, so it is not asked again", async () => {
    const { svc, rows } = setup(() => "Hi I am Vinit from mumbai and my property is a commercial shop in Ghatkopar", undefined, false, false, false, {
      stopAt: "propertyArea",
      extraction: () => ({ answers: [{ key: "propertyArea", value: "Ghatkopar", evidence: "Ghatkopar" }] }),
    });
    await svc.reply(chat, "more|yes");
    expect(rows.get(answerKey("Location of the property"))?.value).toBe("Ghatkopar");
  });

  it("does not ask 'do you receive rent?' once the rent has been given", async () => {
    const { svc, rows, tasks } = setup(() => "ok", undefined, false, false, false, { stopAt: "hasRentalIncome", extraction: () => ({ answers: [] }) });
    rows.set(answerKey("Rent you receive every month"), { key: answerKey("Rent you receive every month"), label: "Rent you receive every month", value: "₹60,000" });
    await svc.reply(chat);
    expect(rows.get(answerKey("Do you receive any rent?"))?.value).toBe("Yes");
    expect(tasks.at(-1)).not.toMatch(/Ask exactly this ONE question:\s*Do you receive any rent/);
  });
});

describe("not inventing corrections or losing free-text answers", () => {
  const chat = { id: "c", leadId: "l", name: "Mahesh" };
  const salaryKey = loanFor(SLUG)!.fields.find((f) => f.label === "Monthly take-home salary")!.key;
  const SALARY = answerKey("Monthly take-home salary");

  it("never treats a plain answer as a correction, even if the AI offers one", async () => {
    const { svc, rows } = setup(() => "60000", undefined, false, false, false, {
      extraction: () => ({ answers: [{ key: "otherIncome", value: "60000", evidence: "60000" }], corrections: [{ key: salaryKey, value: "60000", evidence: "60000" }] }),
    });
    await svc.reply(chat);
    expect(rows.get(answerKey("Other regular monthly income (rent, interest, etc.)"))?.value).toBe("₹60,000");
    expect(rows.get(SALARY)?.value).toBe("₹100000"); // the salary is untouched
  });

  it("saves a short reply to a free-text question as the answer even when the AI hands nothing back", async () => {
    const { svc, rows } = setup(() => "Last 6 months, insufficient funds.", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(rows.get(answerKey("Location of the property"))?.value).toBe("Last 6 months, insufficient funds.");
  });

  it("does not take a question or a long statement for a free-text answer", async () => {
    const q = setup(() => "Which bank is best?", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [], their_question: "which bank" }) });
    await q.svc.reply(chat);
    expect(q.rows.has(answerKey("Location of the property"))).toBe(false);
  });

  it("says whose figure it is when echoing back an amount about someone else", async () => {
    const { svc, tasks } = setup(() => "50000", undefined, false, false, false, { stopAt: "extraEarnerIncome", extraction: () => ({ answers: [{ key: "extraEarnerIncome", value: "50000", evidence: "50000" }] }) });
    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/this is about the other earning member of the family whose income is counted, not the customer/);
  });

  it("asks a free-text question again in plain words, without borrowing an amount example from another kind of question", async () => {
    const { svc, tasks } = setup(() => "ok thanks", undefined, false, false, false, { stopAt: "propertyArea", extraction: () => ({ answers: [] }) });
    await svc.reply(chat);
    expect(tasks.at(-1)).toMatch(/Ask the SAME question again in other plain words/);
    expect(tasks.at(-1)).not.toMatch(/example answer \(for an amount/);
  });
});
