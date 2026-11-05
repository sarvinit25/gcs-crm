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
] as const;

async function pretendCustomer(persona: string, transcript: { who: "gia" | "me"; text: string }[]) {
  const messages = [
    {
      role: "system",
      content: `${persona}\nYou are chatting with a loan company's WhatsApp assistant. Answer only what is asked, in character, in one or two short lines. If you do not know, make a sensible small answer. When the assistant says an expert will contact you, reply "ok thanks" and nothing more.`,
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
  for (let turn = 0; turn < Number(process.env.DEMO_TURNS ?? 24); turn++) {
    transcript.push({ who: "me", text: customerSays });
    console.log(`\nCUSTOMER: ${customerSays}`);
    const before = provider.sent.length;
    inbound.accept({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "demo-number" },
                contacts: [{ wa_id: `91${persona.phone}`, profile: { name: "" } }],
                messages: [{ id: `demo.${persona.phone}.${turn}.${Date.now()}`, from: `91${persona.phone}`, type: "text", timestamp: String(Math.floor(Date.now() / 1000)), text: { body: customerSays } }],
              },
            },
          ],
        },
      ],
    });
    await inbound.idle();
    const reply = provider.sent.slice(before).filter((s) => s.kind === "text").map((s) => s.body).join("\n");
    if (!reply) {
      console.log("GIA: (no reply: a person takes over)");
      break;
    }
    console.log(`GIA: ${reply}`);
    transcript.push({ who: "gia", text: reply });
    if (/expert .*(contact|call|reach)|team member will/i.test(reply) && turn > 5) break;
    customerSays = await pretendCustomer(persona.about, transcript);
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
