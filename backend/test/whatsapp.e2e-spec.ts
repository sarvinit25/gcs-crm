import { createHmac } from "crypto";
import { INestApplication } from "@nestjs/common";
import { MetaTemplateStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";
import { InboundService } from "../src/whatsapp/inbound.service";
import { BriefsService } from "../src/whatsapp/briefs.service";
import { ProviderError, type ConnectionInfo, type WhatsAppProvider } from "../src/whatsapp/whatsapp.provider";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
const STAFF = { email: "wa.staff.e2e@example.com", password: "StaffPass#12345", phone: "9000055501" };
const OTHER = { email: "wa.other.e2e@example.com", password: "StaffPass#12345", phone: "9000055502" };
const SECRET = "app-secret-for-tests";

class FakeProvider implements WhatsAppProvider {
  kind = "meta" as const;
  configured = true;
  requiresApproval = false;
  sent: { to: string; kind: "text" | "template"; body?: string; name?: string; params?: string[] }[] = [];
  submitStatus: MetaTemplateStatus = MetaTemplateStatus.PENDING;
  remote: { name: string; status: MetaTemplateStatus; reason?: string }[] = [];
  failWith?: string;
  private n = 0;

  private check() {
    if (this.failWith) throw new ProviderError(this.failWith, 131030);
  }
  async sendText(to: string, body: string) {
    this.check();
    this.sent.push({ to, kind: "text", body });
    return { waMessageId: `wamid.fake${++this.n}` };
  }
  async sendInteractive(to: string, c: { body: string }) {
    this.check();
    this.sent.push({ to, kind: "text", body: c.body });
    return { waMessageId: `wamid.fake${++this.n}` };
  }
  async downloadMedia(): Promise<{ data: Buffer; mimeType: string }> {
    throw new ProviderError("no media in tests");
  }
  async showTyping() {
    // nothing to show in tests
  }
  async sendTemplate(to: string, name: string, _l: string, params: string[]) {
    this.check();
    this.sent.push({ to, kind: "template", name, params });
    return { waMessageId: `wamid.fake${++this.n}` };
  }
  async submitTemplate() {
    return { status: this.submitStatus };
  }
  async listTemplates() {
    return this.remote;
  }
  async connection(): Promise<ConnectionInfo> {
    return { state: "connected", provider: "meta", phoneNumber: "+91 98765 43210", verifiedName: "GCS", quality: "GREEN" };
  }
  texts() {
    return this.sent.filter((s) => s.kind === "text").map((s) => s.body ?? "");
  }
}

describe("WhatsApp inbox and notifications", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let inbound: InboundService;
  let briefs: BriefsService;
  let provider: FakeProvider;
  let admin: string;
  let staff: string;
  let staffId: string;
  let otherId: string;
  let productId: string;
  let msgCounter = 0;
  /** How many of the person's own turns the assistant was shown, per call — to prove the chat is remembered. */
  const turnsShown: number[] = [];
  const historiesShown: string[][] = [];

  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(t ? as(t) : {}).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const put = (path: string, t: string, body: object) => http.put(`${API}${path}`).set(as(t)).send(body);
  const setting = (key: string, value: unknown) => put(`/settings/${key}`, admin, { value });

  /** What Meta posts for one customer message — signed, exactly as Meta would. */
  async function customerSays(from: string, text: string | null, opts: { type?: string; id?: string; name?: string } = {}) {
    const id = opts.id ?? `wamid.in${++msgCounter}`;
    const message = { id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: opts.type ?? "text", ...(text !== null && { text: { body: text } }) };
    return metaCall({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, contacts: [{ wa_id: from, profile: { name: opts.name ?? "" } }], messages: [message] } }] }],
    });
  }

  async function metaCall(payload: object) {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
    const res = await http.post(`${API}/public/whatsapp/webhook`).set("content-type", "application/json").set("x-hub-signature-256", sig).send(raw);
    await inbound.idle();
    return res;
  }

  async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, label: string) {
    for (let i = 0; i < 40; i++) {
      const v = await read();
      if (done(v)) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  const logs = (where: object = {}) => prisma.notificationLog.findMany({ where, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID";

    provider = new FakeProvider();
    // A stand-in for the AI assistant: it answers as the person asking, and records how much of the chat it was shown.
    const assistant = {
      async ask(history: { role: string; content: string }[], user: { name: string }) {
        turnsShown.push(history.filter((m) => m.role === "user").length);
        historiesShown.push(history.map((m) => m.content));
        const last = history[history.length - 1].content;
        // `reply` is what the person reads; `raw` is what may be shown to the AI again.
        return { reply: `Assistant answer for ${user.name}: ${last}`, raw: `RAW answer to: ${last}` };
      },
    };
    app = await createTestApp({ assistant, whatsappProvider: provider });
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    inbound = app.get(InboundService);
    briefs = app.get(BriefsService);

    admin = (await post("/auth/login", undefined, ADMIN)).body.accessToken;
    const mk = async (name: string, u: { email: string; phone: string; password: string }) =>
      (await post("/team", admin, { name, email: u.email, phone: u.phone, role: "ADVISOR", password: u.password })).body.id as string;
    staffId = await mk("Asha Staff", STAFF);
    otherId = await mk("Omkar Other", OTHER);
    staff = await signIn(post, STAFF.email, STAFF.password);
    productId = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
    // Which templates are approved depends on who seeded them first; these tests start from a known state.
    await prisma.notificationTemplate.updateMany({ data: { metaStatus: "APPROVED", metaReason: null } });
  });

  afterAll(async () => {
    for (const key of ["whatsapp.customerMessagesEnabled", "whatsapp.employeeAlertsEnabled", "whatsapp.briefsEnabled", "whatsapp.briefRecipients", "whatsapp.chatbotEnabled"]) {
      await http.delete(`${API}/settings/${key}`).set(as(admin));
    }
    await app?.close();
  });

  describe("Meta's webhook", () => {
    it("answers the handshake only for the right token", async () => {
      const ok = await http.get(`${API}/public/whatsapp/webhook`).query({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" });
      expect(ok.status).toBe(200);
      expect(ok.text).toBe("12345");
      expect((await http.get(`${API}/public/whatsapp/webhook`).query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1" })).status).toBe(403);
      expect((await http.get(`${API}/public/whatsapp/webhook`)).status).toBe(403);
    });

    it("refuses anything not signed with the app secret", async () => {
      const raw = JSON.stringify({ entry: [] });
      expect((await http.post(`${API}/public/whatsapp/webhook`).set("content-type", "application/json").send(raw)).status).toBe(403);
      expect(
        (await http.post(`${API}/public/whatsapp/webhook`).set("content-type", "application/json").set("x-hub-signature-256", "sha256=" + "0".repeat(64)).send(raw)).status,
      ).toBe(403);
      expect((await metaCall({ entry: [] })).status).toBe(200);
    });

    it("ignores calls meant for another number", async () => {
      const before = await prisma.whatsAppConversation.count();
      await metaCall({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: "SOMEONE-ELSE" }, messages: [{ id: "wamid.x", from: "919000055599", type: "text", text: { body: "hi" } }] } }] }],
      });
      expect(await prisma.whatsAppConversation.count()).toBe(before);
    });
  });

  describe("a customer writes in", () => {
    const phone = "9000055510";

    it("a stranger saying hello becomes a lead and gets the welcome", async () => {
      provider.sent.length = 0;
      expect((await customerSays(`91${phone}`, "Hello!", { name: "Meena Joshi" })).status).toBe(200);

      const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone } });
      expect(conversation.kind).toBe("CUSTOMER");
      expect(conversation.leadId).toBeTruthy();
      expect(conversation.unreadCount).toBe(1);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: conversation.leadId! } });
      expect(lead.name).toBe("Meena Joshi");
      expect(lead.source).toBe("whatsapp");

      expect(provider.sent[0].to).toBe(`91${phone}`);
      expect(provider.texts()[0]).toMatch(/Welcome to .*status.*agent/s);
      const thread = await prisma.whatsAppMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
      expect(thread.map((m) => `${m.direction}/${m.sender}`)).toEqual(["IN/CUSTOMER", "OUT/BOT"]);
    });

    it("apply walks the customer through the loan profile and stores only allowed answers", async () => {
      const p = "9000055590";
      await customerSays(`91${p}`, "hi", { name: "Profile Tester" });
      provider.sent.length = 0;
      await customerSays(`91${p}`, "apply");
      expect(provider.texts()[0]).toMatch(/Home Loan \(HL\)/);
      const conv = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: p } });
      expect(conv.profileState).toBe("active");

      provider.sent.length = 0;
      await customerSays(`91${p}`, "maybe something");
      expect(provider.texts()[0]).toMatch(/pick one of the options/);

      for (const reply of ["lap", "1.5 cr", "business expansion", "41", "business owner"]) await customerSays(`91${p}`, reply);
      const rows = await prisma.leadAnswer.findMany({ where: { leadId: conv.leadId!, key: { startsWith: "lp-" } } });
      const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(v).toMatchObject({ "lp-loan-product": "Loan Against Property (LAP)", "lp-loan-amount": "15000000", "lp-purpose": "Business Expansion", "lp-age": "41", "lp-profile": "Business Owner" });
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: conv.leadId! } });
      expect(Number(lead.amount)).toBe(15000000);

      provider.sent.length = 0;
      await customerSays(`91${p}`, "stop");
      expect(provider.texts()[0]).toMatch(/saved/);
      expect((await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: p } })).profileState).toBeNull();
      provider.sent.length = 0;
      await customerSays(`91${p}`, "apply");
      expect(provider.texts()[0]).toMatch(/co-applicant/i); // resumes where it left off
    });

    it("a message Meta delivers twice is handled once", async () => {
      provider.sent.length = 0;
      await customerSays(`91${phone}`, "hi", { id: "wamid.dup1" });
      await customerSays(`91${phone}`, "hi", { id: "wamid.dup1" });
      expect(provider.texts()).toHaveLength(1);
      expect(await prisma.whatsAppMessage.count({ where: { waMessageId: "wamid.dup1" } })).toBe(1);
    });

    it("'status' tells them the stage of their own file, and nothing else", async () => {
      const sPhone = "9000055511";
      const created = await post("/applications", admin, {
        loanProductId: productId,
        requestedAmount: 900000,
        applicants: [{ name: "Status Seeker", phone: sPhone, isPrimary: true }],
      });
      const applicationNo = (await get(`/applications/${created.body.id}`, admin)).body.applicationNo;
      provider.sent.length = 0;
      await customerSays(`91${sPhone}`, "STATUS");
      expect(provider.texts()[0]).toContain(applicationNo);
      expect(provider.texts()[0]).toMatch(/Draft/);
      expect(provider.texts()[0]).not.toMatch(/900000|9,00,000/);
      const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: sPhone } });
      expect(conversation.applicationId).toBe(created.body.id);
    });

    it("anything else is for a person: flagged once, answered once", async () => {
      const p = "9000055512";
      provider.sent.length = 0;
      await customerSays(`91${p}`, "I want to know my EMI for 20 lakh");
      expect((await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: p } })).needsHuman).toBe(true);
      expect(provider.texts()).toHaveLength(1);
      expect(provider.texts()[0]).toMatch(/team member will reply/);

      await customerSays(`91${p}`, "hello? anyone?");
      expect(provider.texts()).toHaveLength(1); // the bot stays quiet once a person is asked for
    });

    it("a message WhatsApp could not pass on is shown as such with Meta's reason, and the customer is asked to resend it", async () => {
      const p = "9000077701";
      provider.sent.length = 0;
      await metaCall({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, contacts: [{ wa_id: `91${p}`, profile: { name: "" } }], messages: [{ id: `wamid.in${++msgCounter}`, from: `91${p}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "unsupported", errors: [{ code: 131051, title: "Message type is not currently supported" }] }] } }] }],
      });
      const conv = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: p }, include: { messages: true } });
      const msg = conv.messages.find((m) => m.type === "unsupported")!;
      expect(msg.body).toMatch(/did not pass on \(131051 Message type is not currently supported\)/);
      expect(conv.needsHuman).toBe(true);
      expect(provider.texts()).toHaveLength(1);
      expect(provider.texts()[0]).toMatch(/send it as a normal photo or PDF/);
    });

    it("a voice note or a video shows what it is instead of a blank line", async () => {
      const p = "9000077702";
      for (const [type, label] of [["audio", "Voice message"], ["video", "Video"], ["location", "Location"]] as const) {
        await metaCall({
          object: "whatsapp_business_account",
          entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, contacts: [{ wa_id: `91${p}`, profile: { name: "" } }], messages: [{ id: `wamid.in${++msgCounter}`, from: `91${p}`, timestamp: String(Math.floor(Date.now() / 1000)), type }] } }] }],
        });
        const conv = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: p }, include: { messages: true } });
        expect(conv.messages.find((m) => m.type === type)!.body).toContain(label);
      }
    });

    it("'agent' and documents both raise a hand", async () => {
      const a = "9000055513";
      await customerSays(`91${a}`, "agent please");
      expect((await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: a } })).needsHuman).toBe(true);

      const d = "9000055514";
      provider.sent.length = 0;
      await customerSays(`91${d}`, null, { type: "document" });
      const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: d } });
      expect(conversation.needsHuman).toBe(true);
      const stored = await prisma.whatsAppMessage.findFirstOrThrow({ where: { conversationId: conversation.id, direction: "IN" } });
      expect(stored).toMatchObject({ type: "document", body: "📎 File" });
      expect(provider.texts()[0]).toMatch(/received it/);
    });

    it("the chatbot can be switched off, leaving everything to people", async () => {
      await setting("whatsapp.chatbotEnabled", false);
      provider.sent.length = 0;
      await customerSays("919000055515", "hello");
      expect(provider.sent).toHaveLength(0);
      expect(await prisma.whatsAppConversation.count({ where: { phone: "9000055515" } })).toBe(1);
      await http.delete(`${API}/settings/whatsapp.chatbotEnabled`).set(as(admin));
    });

    it("delivery receipts move a message forward and never back", async () => {
      const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone } });
      const out = await prisma.whatsAppMessage.findFirstOrThrow({ where: { conversationId: conversation.id, direction: "OUT" } });
      const status = (s: string) =>
        metaCall({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, statuses: [{ id: out.waMessageId, status: s }] } }] }] });
      await status("delivered");
      expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: out.id } })).status).toBe("DELIVERED");
      await status("read");
      await status("delivered");
      expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: out.id } })).status).toBe("READ");
    });
  });

  describe("a team member writes in", () => {
    it("gets the assistant, as themselves — and the chat is not kept in the inbox", async () => {
      provider.sent.length = 0;
      await customerSays(`91${STAFF.phone}`, "How many active files?");
      expect(provider.texts()[0]).toBe("Assistant answer for Asha Staff: How many active files?");
      expect(await prisma.whatsAppConversation.count({ where: { phone: STAFF.phone } })).toBe(0);
    });

    it("has help and reset commands, and unreadable media is declined politely", async () => {
      provider.sent.length = 0;
      await customerSays(`91${STAFF.phone}`, "help");
      expect(provider.texts()[0]).toMatch(/reset.*clear/s);
      await customerSays(`91${STAFF.phone}`, "reset");
      expect(provider.texts()[1]).toMatch(/starting fresh/);
      await customerSays(`91${STAFF.phone}`, null, { type: "image" });
      expect(provider.texts()[2]).toMatch(/only read text/);
    });

    it("remembers the conversation, until it is reset", async () => {
      await customerSays(`91${STAFF.phone}`, "reset");
      turnsShown.length = 0;
      historiesShown.length = 0;
      provider.sent.length = 0;
      await customerSays(`91${STAFF.phone}`, "first question");
      await customerSays(`91${STAFF.phone}`, "and a follow-up");
      expect(turnsShown).toEqual([1, 2]);
      expect(provider.texts()[1]).toBe("Assistant answer for Asha Staff: and a follow-up");
      // The AI is shown its own earlier answer in the placeholder form, never the version the person read.
      expect(historiesShown[1]).toEqual(["first question", "RAW answer to: first question", "and a follow-up"]);

      await customerSays(`91${STAFF.phone}`, "clear");
      await customerSays(`91${STAFF.phone}`, "a new topic");
      expect(turnsShown).toEqual([1, 2, 1]);
    });
  });

  describe("the inbox", () => {
    let mine: string; // a thread on the staff member's own lead
    let theirs: string; // a thread on someone else's lead

    beforeAll(async () => {
      const lead = async (name: string, phone: string, officer: string) =>
        (await post("/leads", admin, { name, phone, source: "e2e", assignedOfficerId: officer })).body.id as string;
      const myLead = await lead("Mine Mhatre", "9000055520", staffId);
      const theirLead = await lead("Theirs Tambe", "9000055521", otherId);
      await customerSays("919000055520", "Hi, any update?");
      await customerSays("919000055521", "Hi, any update?");
      mine = (await prisma.whatsAppConversation.findFirstOrThrow({ where: { leadId: myLead } })).id;
      theirs = (await prisma.whatsAppConversation.findFirstOrThrow({ where: { leadId: theirLead } })).id;
    });

    it("Admin sees every thread, Staff only those on their own leads and files", async () => {
      const adminIds = ((await get("/whatsapp/conversations", admin)).body.items as { id: string }[]).map((c) => c.id);
      expect(adminIds).toEqual(expect.arrayContaining([mine, theirs]));
      const staffIds = ((await get("/whatsapp/conversations", staff)).body.items as { id: string }[]).map((c) => c.id);
      expect(staffIds).toContain(mine);
      expect(staffIds).not.toContain(theirs);
      expect((await get(`/whatsapp/conversations/${theirs}`, staff)).status).toBe(404);
      expect((await post(`/whatsapp/conversations/${theirs}/messages`, staff, { text: "hello" })).status).toBe(404);
    });

    it("searches by name or number, and filters to those needing a person", async () => {
      expect(((await get("/whatsapp/conversations?search=Mhatre", admin)).body.items as unknown[]).length).toBe(1);
      expect(((await get("/whatsapp/conversations?search=90000555", admin)).body.items as unknown[]).length).toBeGreaterThan(1);
      const needs = await get("/whatsapp/conversations?needsHuman=true", admin);
      expect((needs.body.items as { needsHuman: boolean }[]).every((c) => c.needsHuman)).toBe(true);
      expect(needs.body.needsHuman).toBeGreaterThan(0);
    });

    it("everyone replying can see the customer templates, but only admins manage them", async () => {
      const res = await get("/whatsapp/conversations/templates", staff);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((t: { recipient: string; active: boolean }) => t.recipient === "CUSTOMER" && t.active)).toBe(true);
      expect((await get("/notifications/templates", staff)).status).toBe(403);
    });

    it("opening a thread marks it read, and shows it in order", async () => {
      expect((await get("/whatsapp/conversations/unread", staff)).body.unread).toBeGreaterThan(0);
      const opened = await get(`/whatsapp/conversations/${mine}`, staff);
      expect(opened.body.conversation.unreadCount).toBe(0);
      expect(opened.body.conversation.windowOpen).toBe(true);
      expect(opened.body.messages[0].body).toBe("Hi, any update?");
    });

    it("a person replies in the open 24-hour window, and the customer's phone gets it", async () => {
      provider.sent.length = 0;
      const res = await post(`/whatsapp/conversations/${mine}/messages`, staff, { text: "Yes — your file is moving." });
      expect(res.status).toBe(201);
      expect(res.body.sender).toBe("STAFF");
      expect(res.body.sentById).toBe(staffId);
      expect(provider.sent[0]).toMatchObject({ to: "919000055520", kind: "text", body: "Yes — your file is moving." });
    });

    it("outside the window only a template will do — and the error says why", async () => {
      await prisma.whatsAppConversation.update({ where: { id: mine }, data: { lastInboundAt: new Date(Date.now() - 30 * 3600_000) } });
      const blocked = await post(`/whatsapp/conversations/${mine}/messages`, staff, { text: "Hello again" });
      expect(blocked.status).toBe(400);
      expect(blocked.body.message).toMatch(/24 hours/);

      const template = (await get("/notifications/templates", admin)).body.find((t: { trigger: string; recipient: string }) => t.trigger === "LEAD_CREATED" && t.recipient === "CUSTOMER");
      provider.sent.length = 0;
      const sent = await post(`/whatsapp/conversations/${mine}/messages`, staff, { templateId: template.id, variables: { loanType: "Home Loan" } });
      expect(sent.status).toBe(201);
      expect(sent.body.type).toBe("template");
      expect(sent.body.body).toMatch(/Hello Mine Mhatre.*Home Loan/);
      expect(provider.sent[0]).toMatchObject({ kind: "template", name: template.code });
    });

    it("a template with a blank to fill in, or not yet approved by Meta, is refused", async () => {
      const template = (await get("/notifications/templates", admin)).body.find((t: { trigger: string; recipient: string }) => t.trigger === "LEAD_CREATED" && t.recipient === "CUSTOMER");
      const blank = await post(`/whatsapp/conversations/${mine}/messages`, staff, { templateId: template.id });
      expect(blank.status).toBe(400);
      expect(blank.body.message).toMatch(/loanType/);

      provider.requiresApproval = true;
      await prisma.notificationTemplate.update({ where: { id: template.id }, data: { metaStatus: "NOT_SUBMITTED" } });
      const unapproved = await post(`/whatsapp/conversations/${mine}/messages`, staff, { templateId: template.id, variables: { loanType: "Home Loan" } });
      provider.requiresApproval = false;
      await prisma.notificationTemplate.update({ where: { id: template.id }, data: { metaStatus: "APPROVED" } });
      expect(unapproved.status).toBe(400);
      expect(unapproved.body.message).toMatch(/approved by Meta/);
    });

    it("a send Meta refuses comes back as a clear error, and nothing is recorded", async () => {
      await prisma.whatsAppConversation.update({ where: { id: mine }, data: { lastInboundAt: new Date() } });
      const before = await prisma.whatsAppMessage.count({ where: { conversationId: mine } });
      provider.failWith = "Message undeliverable";
      const res = await post(`/whatsapp/conversations/${mine}/messages`, staff, { text: "will fail" });
      provider.failWith = undefined;
      expect(res.status).toBe(502);
      expect(res.body.message).toMatch(/undeliverable/);
      expect(await prisma.whatsAppMessage.count({ where: { conversationId: mine } })).toBe(before);
    });

    it("sends only one of text or template, and never an empty message", async () => {
      expect((await post(`/whatsapp/conversations/${mine}/messages`, staff, {})).status).toBe(400);
      expect((await post(`/whatsapp/conversations/${mine}/messages`, staff, { text: "x", templateId: "y" })).status).toBe(400);
    });

    it("starts a new chat with a template; Staff may only start one with their own customers", async () => {
      const template = (await get("/notifications/templates", admin)).body.find((t: { trigger: string; recipient: string }) => t.trigger === "LEAD_CREATED" && t.recipient === "CUSTOMER");
      provider.sent.length = 0;
      const started = await post("/whatsapp/conversations", admin, { phone: "+91 90000 55530", name: "Brand New", templateId: template.id, variables: { loanType: "Car Loan" } });
      expect(started.status).toBe(201);
      expect(provider.sent[0].to).toBe("919000055530");
      expect((await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: started.body.conversationId } })).phone).toBe("9000055530");

      const refused = await post("/whatsapp/conversations", staff, { phone: "9000055531", templateId: template.id, variables: { loanType: "Car Loan" } });
      expect(refused.status).toBe(403);
      const own = await post("/whatsapp/conversations", staff, { phone: "9000055520", templateId: template.id, variables: { loanType: "Car Loan" } });
      expect(own.status).toBe(201);
    });

    it("anyone can mark a thread as needing a person, or hand it back to the bot", async () => {
      expect((await patch(`/whatsapp/conversations/${mine}`, staff, { needsHuman: true })).body.needsHuman).toBe(true);
      expect((await patch(`/whatsapp/conversations/${mine}`, staff, { needsHuman: false })).body.needsHuman).toBe(false);
      expect((await patch(`/whatsapp/conversations/${theirs}`, staff, { needsHuman: true })).status).toBe(404);
    });
  });

  describe("notification templates", () => {
    it("starts with the standard set, for admins only", async () => {
      const list = await get("/notifications/templates", admin);
      expect(list.body).toHaveLength(12);
      expect(list.body.every((t: { code: string }) => /^[a-z0-9_]+$/.test(t.code))).toBe(true);
      expect((await get("/notifications/templates", staff)).status).toBe(403);
      const meta = (await get("/notifications/templates/meta", admin)).body;
      expect(meta.triggers.map((t: { value: string }) => t.value)).toContain("MORNING_BRIEF");
    });

    it("catches wording Meta would reject, and a second template for the same event", async () => {
      const dup = await post("/notifications/templates", admin, { name: "Another", trigger: "LEAD_CREATED", recipient: "CUSTOMER", body: "Hello {{name}}, thanks." });
      expect(dup.status).toBe(409);
      const bad = await post("/notifications/templates", admin, { name: "Bad", trigger: "MORNING_BRIEF", recipient: "CUSTOMER", body: "Hi there." });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toMatch(/can't be sent to customers/);
      const unknownVar = await patch(`/notifications/templates/${(await get("/notifications/templates", admin)).body[0].id}`, admin, { body: "Hello {{nope}}, thanks." });
      expect(unknownVar.status).toBe(400);
      expect(unknownVar.body.message).toMatch(/\{\{nope\}\} isn't available/);
    });

    it("rewording an approved template makes it a new one for Meta to review", async () => {
      provider.requiresApproval = true;
      const target = (await get("/notifications/templates", admin)).body.find((t: { trigger: string; recipient: string }) => t.trigger === "DISBURSAL_COMPLETED" && t.recipient === "EMPLOYEE");
      await prisma.notificationTemplate.update({ where: { id: target.id }, data: { metaStatus: "APPROVED" } });
      const edited = await patch(`/notifications/templates/${target.id}`, admin, { body: "Payout of {{amount}} recorded for {{name}} on {{applicationNo}}. Well done." });
      provider.requiresApproval = false;
      expect(edited.body.metaStatus).toBe("NOT_SUBMITTED");
      expect(edited.body.code).not.toBe(target.code);
      expect(edited.body.code).toMatch(/_v2$/);
    });

    it("sends to Meta, then reads back the verdict", async () => {
      provider.requiresApproval = true;
      const target = (await get("/notifications/templates", admin)).body.find((t: { trigger: string; recipient: string }) => t.trigger === "FILE_REJECTED" && t.recipient === "CUSTOMER");
      // Meta won't be asked about a template it has already approved.
      expect((await post(`/notifications/templates/${target.id}/submit`, admin)).status).toBe(400);
      await prisma.notificationTemplate.update({ where: { id: target.id }, data: { metaStatus: "NOT_SUBMITTED" } });
      const submitted = await post(`/notifications/templates/${target.id}/submit`, admin);
      expect(submitted.body.metaStatus).toBe("PENDING");

      provider.remote = [{ name: target.code, status: "REJECTED", reason: "INVALID_FORMAT" }];
      const refreshed = await post("/notifications/templates/refresh", admin);
      expect(refreshed.body.updated).toBe(1);
      const after = (await get("/notifications/templates", admin)).body.find((t: { id: string }) => t.id === target.id);
      expect(after.metaStatus).toBe("REJECTED");
      expect(after.metaReason).toBe("INVALID_FORMAT");
      provider.requiresApproval = false;
      provider.remote = [];
    });

    it("can restore the standard wording, and delete one", async () => {
      const list = (await get("/notifications/templates", admin)).body as { id: string; trigger: string; recipient: string; body: string }[];
      const target = list.find((t) => t.trigger === "SANCTION_APPROVED" && t.recipient === "EMPLOYEE")!;
      await patch(`/notifications/templates/${target.id}`, admin, { body: "Custom wording for {{name}} and {{amount}} done." });
      const reset = await post("/notifications/templates/reset-defaults", admin);
      expect(reset.body.restored).toBeGreaterThanOrEqual(1);
      expect(((await get("/notifications/templates", admin)).body as { id: string; body: string }[]).find((t) => t.id === target.id)!.body).toBe(target.body);

      const gone = list.find((t) => t.trigger === "EVENING_BRIEF")!;
      expect((await http.delete(`${API}/notifications/templates/${gone.id}`).set(as(admin))).status).toBe(200);
      expect((await post("/notifications/templates/reset-defaults", admin)).body.created).toBe(1);
    });
  });

  describe("automatic notifications", () => {
    afterEach(async () => {
      provider.requiresApproval = false;
      await http.delete(`${API}/settings/whatsapp.customerMessagesEnabled`).set(as(admin));
      await http.delete(`${API}/settings/whatsapp.employeeAlertsEnabled`).set(as(admin));
    });

    it("customer messages are off until an admin turns them on — and the log says so", async () => {
      provider.sent.length = 0;
      const lead = await post("/leads", admin, { name: "Quiet Quadri", phone: "9000055540", source: "e2e", assignedOfficerId: staffId });
      const rows = await waitFor(() => logs({ entityId: lead.body.id }), (r) => r.length >= 2, "two log rows");
      const customer = rows.find((r) => r.recipient === "CUSTOMER")!;
      expect(customer.status).toBe("SKIPPED");
      expect(customer.reason).toMatch(/switched off/);
      expect(provider.sent.filter((s) => s.to === "919000055540")).toHaveLength(0);
    });

    it("the officer is alerted about a lead assigned to them", async () => {
      provider.sent.length = 0;
      const lead = await post("/leads", admin, { name: "Alert Apte", phone: "9000055541", source: "website", productSlug: undefined, assignedOfficerId: staffId });
      const rows = await waitFor(() => logs({ entityId: lead.body.id, recipient: "EMPLOYEE" }), (r) => r.length === 1, "the officer alert");
      expect(rows[0].status).toBe("SENT");
      const sent = provider.sent.find((s) => s.to === `91${STAFF.phone}`)!;
      expect(sent.kind).toBe("template");
      expect(sent.params).toEqual(expect.arrayContaining(["Alert Apte", "9000055541"]));
    });

    it("once turned on, the customer gets the template and sees it in their thread", async () => {
      await setting("whatsapp.customerMessagesEnabled", true);
      provider.sent.length = 0;
      const lead = await post("/leads", admin, { name: "Happy Hegde", phone: "9000055542", source: "e2e", assignedOfficerId: staffId });
      await waitFor(() => logs({ entityId: lead.body.id, recipient: "CUSTOMER" }), (r) => r.length === 1, "the customer message");
      const sent = provider.sent.find((s) => s.to === "919000055542")!;
      expect(sent.params![0]).toBe("Happy Hegde");
      const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { phone: "9000055542" } });
      const thread = await prisma.whatsAppMessage.findMany({ where: { conversationId: conversation.id } });
      expect(thread).toHaveLength(1);
      expect(thread[0]).toMatchObject({ sender: "SYSTEM", type: "template", direction: "OUT" });
      expect(thread[0].body).toMatch(/Hello Happy Hegde/);
    });

    it("a template Meta hasn't approved is skipped, with the reason", async () => {
      await setting("whatsapp.customerMessagesEnabled", true);
      provider.requiresApproval = true;
      const template = await prisma.notificationTemplate.findUniqueOrThrow({ where: { trigger_recipient: { trigger: "LEAD_CREATED", recipient: "CUSTOMER" } } });
      await prisma.notificationTemplate.update({ where: { id: template.id }, data: { metaStatus: "PENDING" } });
      provider.sent.length = 0;
      const lead = await post("/leads", admin, { name: "Waiting Wagle", phone: "9000055543", source: "e2e" });
      const rows = await waitFor(() => logs({ entityId: lead.body.id, recipient: "CUSTOMER" }), (r) => r.length === 1, "the skip");
      await prisma.notificationTemplate.update({ where: { id: template.id }, data: { metaStatus: "APPROVED" } });
      expect(rows[0].status).toBe("SKIPPED");
      expect(rows[0].reason).toMatch(/approved by Meta/);
      expect(provider.sent).toHaveLength(0);
    });

    it("a failed send is logged as a failure, with Meta's reason, and never breaks the save", async () => {
      await setting("whatsapp.customerMessagesEnabled", true);
      provider.failWith = "Recipient not on WhatsApp";
      const lead = await post("/leads", admin, { name: "Failing Fernandes", phone: "9000055544", source: "e2e" });
      expect(lead.status).toBe(201);
      const rows = await waitFor(() => logs({ entityId: lead.body.id, recipient: "CUSTOMER" }), (r) => r.length === 1, "the failure");
      provider.failWith = undefined;
      expect(rows[0].status).toBe("FAILED");
      expect(rows[0].reason).toMatch(/not on WhatsApp/);
    });

    it("file stage, sanction and payout each tell the customer and the officer", async () => {
      await setting("whatsapp.customerMessagesEnabled", true);
      const created = await post("/applications", admin, {
        loanProductId: productId,
        requestedAmount: 1000000,
        ownerId: staffId,
        applicants: [{ name: "Flow Fadnis", phone: "9000055545", isPrimary: true }],
      });
      const id = created.body.id as string;
      provider.sent.length = 0;

      await patch(`/applications/${id}`, admin, { status: "UNDER_REVIEW" });
      await waitFor(() => logs({ entityId: id, trigger: "FILE_STAGE_CHANGED" }), (r) => r.length === 2, "stage messages");
      const stageToCustomer = provider.sent.find((s) => s.to === "919000055545")!;
      expect(stageToCustomer.params).toContain("Under review");

      await put(`/applications/${id}/sanction`, admin, { financialStatus: "APPROVED", sanctionedAmount: 800000 });
      await waitFor(() => logs({ entityId: id, trigger: "SANCTION_APPROVED" }), (r) => r.length === 2, "sanction messages");
      expect(provider.sent.find((s) => s.params?.includes("₹8,00,000") && s.to === "919000055545")).toBeTruthy();
      // Saving the sanction again, unchanged, must not tell anyone twice.
      await put(`/applications/${id}/sanction`, admin, { financialStatus: "APPROVED", sanctionedAmount: 800000 });
      await new Promise((r) => setTimeout(r, 300));
      expect(await logs({ entityId: id, trigger: "SANCTION_APPROVED" })).toHaveLength(2);

      await post(`/applications/${id}/disbursements`, admin, { amount: 300000, disbursedAt: new Date().toISOString() });
      await waitFor(() => logs({ entityId: id, trigger: "DISBURSAL_COMPLETED" }), (r) => r.length === 2, "payout messages");
      expect(provider.sent.find((s) => s.params?.includes("₹3,00,000") && s.to === "919000055545")).toBeTruthy();

      await patch(`/applications/${id}`, admin, { status: "REJECTED" });
      await waitFor(() => logs({ entityId: id, trigger: "FILE_REJECTED" }), (r) => r.length === 2, "rejection messages");
      // Rejection is its own message — not also a "stage changed" one.
      expect(await logs({ entityId: id, trigger: "FILE_STAGE_CHANGED" })).toHaveLength(2);
    });

    it("the log is for Admin and Manager, filterable, with counts", async () => {
      expect((await get("/notifications/logs", staff)).status).toBe(403);
      const all = await get("/notifications/logs", admin);
      expect(all.body.total).toBeGreaterThan(5);
      expect(all.body.counts.SENT).toBeGreaterThan(0);
      expect(all.body.counts.SKIPPED).toBeGreaterThan(0);
      const failed = await get("/notifications/logs?status=FAILED", admin);
      expect((failed.body.items as { status: string }[]).every((l) => l.status === "FAILED")).toBe(true);
      const byPhone = await get("/notifications/logs?search=9000055545", admin);
      expect((byPhone.body.items as { toPhone: string }[]).every((l) => l.toPhone === "9000055545")).toBe(true);
    });
  });

  describe("daily briefs", () => {
    const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00+05:30`);

    beforeAll(async () => {
      await setting("whatsapp.briefRecipients", ["9000055599"]);
      await setting("whatsapp.morningBriefTime", "09:00");
      await setting("whatsapp.eveningBriefTime", "18:30");
    });
    afterAll(async () => {
      await http.delete(`${API}/settings/whatsapp.morningBriefTime`).set(as(admin));
      await http.delete(`${API}/settings/whatsapp.eveningBriefTime`).set(as(admin));
    });

    it("'send now' sends the morning brief to the listed number, with real figures", async () => {
      provider.sent.length = 0;
      await post("/whatsapp/setup/briefs", admin, { kind: "morning" });
      const sent = provider.sent.find((s) => s.to === "919000055599")!;
      expect(sent.kind).toBe("template");
      // date, activeFiles, followUpsDue, newLeadsYesterday, company
      expect(sent.params).toHaveLength(5);
      expect(Number(sent.params![1])).toBeGreaterThan(0);
    });

    it("goes out once a day, at its time — not before, not twice", async () => {
      await setting("whatsapp.briefsEnabled", true);
      provider.sent.length = 0;
      await briefs.tick(at("08:59"));
      expect(provider.sent).toHaveLength(0);

      await briefs.tick(at("09:01"));
      expect(provider.sent.filter((s) => s.to === "919000055599")).toHaveLength(1);
      await briefs.tick(at("09:02"));
      await briefs.tick(at("09:30"));
      expect(provider.sent.filter((s) => s.to === "919000055599")).toHaveLength(1);

      await briefs.tick(at("18:31"));
      expect(provider.sent.filter((s) => s.to === "919000055599")).toHaveLength(2);
      // Hours later the window has passed: a missed brief isn't sent at midnight.
      await briefs.tick(new Date(`2026-11-06T00:30:00+05:30`));
      expect(provider.sent.filter((s) => s.to === "919000055599")).toHaveLength(2);
    });

    it("stays silent when the briefs are switched off", async () => {
      await setting("whatsapp.briefsEnabled", false);
      provider.sent.length = 0;
      await briefs.tick(at("09:05"));
      await briefs.tick(new Date("2026-11-07T09:05:00+05:30"));
      expect(provider.sent).toHaveLength(0);
    });
  });

  describe("setup", () => {
    it("shows the connection and what is configured, never the secrets themselves", async () => {
      const res = await get("/whatsapp/setup/status", admin);
      expect(res.status).toBe(200);
      expect(res.body.connection).toMatchObject({ state: "connected", verifiedName: "GCS" });
      expect(res.body.credentials.appSecret).toBe(true);
      expect(res.body.webhookPath).toBe("/crm/api/public/whatsapp/webhook");
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect(JSON.stringify(res.body)).not.toContain("verify-me");
      expect((await get("/whatsapp/setup/status", staff)).status).toBe(403);
    });

    it("sends a test template to a number", async () => {
      const template = (await get("/notifications/templates", admin)).body[0];
      provider.sent.length = 0;
      const res = await post("/whatsapp/setup/test", admin, { to: "98205 92765", templateId: template.id });
      expect(res.status).toBe(201);
      expect(provider.sent[0]).toMatchObject({ to: "919820592765", kind: "template", name: template.code });
      provider.failWith = "Not allowed";
      expect((await post("/whatsapp/setup/test", admin, { to: "9820592765", templateId: template.id })).status).toBe(400);
      provider.failWith = undefined;
    });
  });
});
