// A trial run of Gia on WhatsApp, on this machine only. A pretend customer (played by OpenAI) chats with Gia through the
// CRM's own message handling, using the sandbox WhatsApp provider, so nothing reaches Meta or a real phone. At the end it
// prints what Gia wrote onto the lead. Needs a local database and OPENAI_API_KEY in backend/.env.
//
//   npx ts-node --compiler-options '{"module":"commonjs"}' prisma/whatsapp-intake-demo.ts [persona number 0-2]
import "reflect-metadata";
process.env.WHATSAPP_PROVIDER = "sandbox";
process.env.WHATSAPP_PHONE_NUMBER_ID = "demo-number";

import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { InboundService } from "../src/whatsapp/inbound.service";
import { WHATSAPP_PROVIDER, SandboxWhatsAppProvider } from "../src/whatsapp/whatsapp.provider";

const PERSONAS = [
  {
    phone: "9000000011",
    opening: "Hi, I need a loan for my school building",
    about:
      "You are Rajesh Patil, 48, who runs a CBSE school in Pune through a trust. You need about 2 crore rupees to build a new wing. The school has 450 students, has run for 8 years, owns its land and building, has audited accounts and ITR for 3 years, yearly fee income about 5 crore, surplus about 60 lakh. You can offer a commercial property worth about 9 crore, with no loan on it. You have one running term loan of 40 lakh from HDFC Bank with an EMI of 90000. You have never applied elsewhere for this and no credit worries. You write in simple English, one short line at a time.",
  },
  {
    phone: "9000000012",
    opening: "mujhe home loan chahiye",
    about:
      "You are Sunita Deshmukh, a salaried employee in Mumbai (Thane). You want a home loan of 60 lakh to buy a ready flat worth 85 lakh. Salary 1.1 lakh a month, 6 years with the same private company. You answer in Hinglish, one short line at a time, sometimes a bit vague.",
  },
  {
    phone: "9000000013",
    opening: "hello",
    about:
      "You are Amit, a shop owner in Navi Mumbai. First you ask what interest rate you will get and whether approval is sure, then try to send your PAN card number ABCDE1234F in the chat, then you want a loan of 15 lakh for business. You answer briefly in English.",
  },
  {
    phone: "9000000014",
    opening: "मला शैक्षणिक कर्ज हवे आहे",
    about:
      "You are Prakash Jadhav, who lives in Pune and writes in Marathi (Devanagari script). You want an education loan of about 12 lakh for your daughter's MBA in India. You are salaried, take-home 85000 a month. Answer in Marathi, one short line at a time, and tap the options when they fit.",
  },
  {
    phone: "9000000015",
    opening: "मुझे बिज़नेस लोन चाहिए",
    about:
      "You are Neha Sharma, who runs a boutique in Mumbai (Andheri) and writes in Hindi (Devanagari script). You want a business loan of about 20 lakh. Answer in Hindi, one short line at a time, and tap the options when they fit.",
  },
  {
    phone: "9000000016",
    opening: "hi",
    about:
      "You are Rohan Mehta in Mumbai, who wants a new car loan. When you are offered amount choices, pick 'Type the exact amount' and then type the amount in Hindi words exactly like: chabbis lakh. The car is a Kia with an on-road price of 43 lakh and you can put in about 17 lakh. You are salaried, take-home 65000. Reply briefly in English or Hinglish and tap options when they fit.",
  },
] as const;

async function pretendCustomer(persona: string, transcript: { who: "gia" | "me"; text: string }[], offered: string[]) {
  const choice = offered.length
    ? `\nThe assistant showed tap-to-choose options: ${offered.map((o) => `"${o}"`).join(", ")}. If one fits what you want, answer with EXACTLY that option's text and nothing else. If none fits, type your own short answer.`
    : "";
  const messages = [
    {
      role: "system",
      content: `${persona}\nYou are chatting with a loan company's WhatsApp assistant. Answer only what is asked, in character, in one or two short lines. If you do not know, make a sensible small answer. When the assistant says an expert will contact you, reply "ok thanks" and nothing more.${choice}`,
    },
    ...transcript.map((t) => ({ role: t.who === "me" ? "assistant" : "user", content: t.text })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", messages, max_completion_tokens: 120, temperature: 0.7 }),
  });
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || "ok thanks";
}

async function main() {
  const persona = PERSONAS[Number(process.argv[2] ?? 0)] ?? PERSONAS[0];
  const db = new PrismaClient();
  await db.setting.upsert({ where: { key: "whatsapp.aiIntake" }, create: { key: "whatsapp.aiIntake", value: true }, update: { value: true } });
  await db.setting.upsert({ where: { key: "whatsapp.chatbotEnabled" }, create: { key: "whatsapp.chatbotEnabled", value: true }, update: { value: true } });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const inbound = app.get(InboundService);
  const provider = app.get<SandboxWhatsAppProvider>(WHATSAPP_PROVIDER);

  const transcript: { who: "gia" | "me"; text: string }[] = [];
  let customerSays: string = persona.opening;
  let offered: { id: string; title: string }[] = [];
  for (let turn = 0; turn < Number(process.env.DEMO_TURNS ?? 24); turn++) {
    // a typed message, unless it is exactly one of the options just offered: then it is a tap
    const tapped = offered.find((o) => o.title.toLowerCase() === customerSays.trim().toLowerCase());
    transcript.push({ who: "me", text: customerSays });
    if (process.env.DEMO_DOC_AT !== undefined && Number(process.env.DEMO_DOC_AT) === turn) customerSays = "[sends a PDF: salary-slip.pdf]";
    console.log(`\nCUSTOMER${tapped ? " (tapped)" : ""}: ${customerSays}`);
    const before = provider.sent.length;
    const sendDoc = process.env.DEMO_DOC_AT !== undefined && Number(process.env.DEMO_DOC_AT) === turn;
    const message = sendDoc
      ? { id: `demo.${persona.phone}.${turn}.${Date.now()}`, from: `91${persona.phone}`, type: "document", timestamp: String(Math.floor(Date.now() / 1000)), document: { id: "demo-media", filename: "salary-slip.pdf" } }
      : tapped
      ? { id: `demo.${persona.phone}.${turn}.${Date.now()}`, from: `91${persona.phone}`, type: "interactive", timestamp: String(Math.floor(Date.now() / 1000)), interactive: { list_reply: { id: tapped.id, title: tapped.title } } }
      : { id: `demo.${persona.phone}.${turn}.${Date.now()}`, from: `91${persona.phone}`, type: "text", timestamp: String(Math.floor(Date.now() / 1000)), text: { body: customerSays } };
    inbound.accept({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "demo-number" }, contacts: [{ wa_id: `91${persona.phone}`, profile: { name: "" } }], messages: [message] } }] }] });
    await inbound.idle();
    const sent = provider.sent.slice(before);
    if (!sent.length) {
      console.log("GIA: (no reply: a person takes over)");
      break;
    }
    offered = [];
    const lines: string[] = [];
    for (const m of sent) {
      if (m.kind === "interactive" && m.interactive) {
        const i = m.interactive;
        const titles = i.kind === "buttons" ? i.buttons : i.rows;
        offered = titles.map((t) => ({ id: t.id, title: t.title }));
        lines.push(`${i.body}\n      [${i.kind === "buttons" ? "BUTTONS" : `LIST: ${i.button}`}]  ${titles.map((t) => `( ${t.title} )`).join("  ")}`);
      } else if (m.kind === "text") lines.push(m.body ?? "");
    }
    const reply = lines.join("\n");
    console.log(`GIA: ${reply}`);
    transcript.push({ who: "gia", text: reply.split("\n")[0] ?? reply });
    if (!offered.length && /expert .*(contact|call|reach)|team member will|विशेषज्ञ|तज्ञ|एक्सपर्ट/i.test(reply) && turn > 5) break;
    customerSays = await pretendCustomer(persona.about, transcript, offered.map((o) => o.title));
  }

  const lead = await db.lead.findFirst({ where: { phone: persona.phone }, include: { loanProduct: true, answers: { orderBy: { createdAt: "asc" } } } });
  const convo = await db.whatsAppConversation.findUnique({ where: { phone: persona.phone } });
  console.log("\n================ WHAT GIA WROTE ON THE LEAD ================");
  console.log({ name: lead?.name, city: lead?.city, loan: lead?.loanProduct?.name, amount: lead?.amount?.toString(), needsHuman: convo?.needsHuman });
  console.log(`${lead?.answers.length ?? 0} answers saved:`);
  for (const a of lead?.answers ?? []) console.log(`  - ${a.label}: ${a.value}`);
  const identity = (lead?.answers ?? []).filter((a) => /\b(pan|aadhaar|aadhar|otp|password)\b|[A-Z]{5}\d{4}[A-Z]|\d{12}/i.test(`${a.label} ${a.value}`));
  console.log(`\nidentity numbers stored in answers: ${identity.length} (must be 0)`);

  if (process.argv.includes("--keep") === false && lead) {
    await db.lead.delete({ where: { id: lead.id } });
    if (convo) await db.whatsAppConversation.delete({ where: { id: convo.id } });
    console.log("(test lead and chat removed from the local database)");
  }
  await app.close();
  await db.$disconnect();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
