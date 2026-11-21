import { callNote, caLegalOf, followUpReason, VoiceService } from "./voice.service";
import { readCall } from "./voice-payload";

const campaignStyle = {
  interaction_id: "int_123",
  status: "completed",
  duration: 94,
  from: "+91 98205 92765",
  transcript: [
    { role: "agent", text: "Namaste, Growth Capital Services." },
    { role: "user", text: "Mujhe loan chahiye." },
  ],
  final_agent_variables: { customer_name: "Ravi Kumar", city: "Pune", loan_amount: "20 lakh", loan_type: "Loan against property" },
  summary: "Wants a loan against property in Pune.",
};

describe("readCall", () => {
  it("reads the details out of a campaign-style message", () => {
    expect(readCall(campaignStyle)).toMatchObject({
      callId: "int_123",
      phone: "9820592765",
      name: "Ravi Kumar",
      city: "Pune",
      amount: 2_000_000,
      loanType: "Loan against property",
      durationSec: 94,
      connected: true,
    });
    expect(readCall(campaignStyle).transcript).toContain("user: Mujhe loan chahiye.");
  });

  it("understands lakh, crore and plain amounts", () => {
    const amount = (v: unknown) => readCall({ loan_amount: v }).amount;
    expect([amount("5 lakh"), amount("1.5 crore"), amount("7,50,000"), amount(300000)]).toEqual([500_000, 15_000_000, 750_000, 300_000]);
  });

  it("does not treat a landline or a short number as a mobile", () => {
    expect(readCall({ from: "022 6987 0988" }).phone).toBeNull();
    expect(readCall({ from: "12345" }).phone).toBeNull();
  });

  it("marks a call that never connected", () => {
    expect(readCall({ status: "no-answer", from: "9820592765", duration: 0 }).connected).toBe(false);
    expect(readCall({ status: "completed", from: "9820592765" }).connected).toBe(false);
  });

  it("prefers the top-level field over a nested one, and survives junk", () => {
    expect(readCall({ name: "Top", data: { name: "Nested" } }).name).toBe("Top");
    expect(() => readCall(null)).not.toThrow();
    expect(() => readCall("text")).not.toThrow();
  });
});

describe("callNote", () => {
  it("leads with the summary", () => {
    const note = callNote(readCall(campaignStyle), new Date("2026-11-13T10:05:00Z"));
    expect(note).toContain("2026-11-13 10:05 UTC, 94s");
    expect(note).toContain("Wants a loan against property in Pune.");
  });
});

describe("VoiceService", () => {
  function build(over: { existing?: boolean; intake?: unknown } = {}) {
    const prisma = {
      voiceCall: {
        findUnique: jest.fn().mockResolvedValue(over.existing ? { id: "x" } : null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const leads = { intake: jest.fn().mockResolvedValue(over.intake ?? { id: "L1", leadNo: 1, isNew: true }) };
    return { prisma, leads, service: new VoiceService(prisma as never, leads as never) };
  }

  it("turns a connected call into a lead tagged ai-telecaller and keeps the raw message", async () => {
    const { service, leads, prisma } = build();
    expect(await service.accept(campaignStyle)).toEqual({ outcome: "LEAD_CREATED", leadId: "L1" });
    expect(leads.intake.mock.calls[0][0]).toMatchObject({ name: "Ravi Kumar", phone: "9820592765", city: "Pune", source: "ai-telecaller", amount: 2_000_000 });
    expect(prisma.voiceCall.create.mock.calls[0][0].data).toMatchObject({ callId: "int_123", outcome: "LEAD_CREATED", leadId: "L1", payload: campaignStyle });
  });

  it("calls an existing lead updated, not created", async () => {
    const { service } = build({ intake: { id: "L9", leadNo: 9 } });
    expect((await service.accept(campaignStyle)).outcome).toBe("LEAD_UPDATED");
  });

  it("names an unnamed caller 'Phone enquiry'", async () => {
    const { service, leads } = build();
    await service.accept({ interaction_id: "a", from: "9820592765", duration: 30, summary: "Asked about rates" });
    expect(leads.intake.mock.calls[0][0].name).toBe("Phone enquiry");
  });

  it("keeps the call but makes no lead when it never connected or has no mobile number", async () => {
    const a = build();
    expect((await a.service.accept({ interaction_id: "b", status: "no-answer", from: "9820592765" })).outcome).toBe("NO_LEAD");
    const b = build();
    expect((await b.service.accept({ interaction_id: "c", duration: 40, from: "02269870988" })).outcome).toBe("NO_LEAD");
    expect(a.leads.intake).not.toHaveBeenCalled();
    expect(b.leads.intake).not.toHaveBeenCalled();
    expect(b.prisma.voiceCall.create).toHaveBeenCalled();
  });

  it("ignores a call it has already seen", async () => {
    const { service, leads, prisma } = build({ existing: true });
    expect((await service.accept(campaignStyle)).outcome).toBe("DUPLICATE");
    expect(leads.intake).not.toHaveBeenCalled();
    expect(prisma.voiceCall.create).not.toHaveBeenCalled();
  });

  it("records an error instead of losing the call when the lead cannot be made", async () => {
    const { service, leads, prisma } = build();
    leads.intake.mockRejectedValue(new Error("db down"));
    expect((await service.accept(campaignStyle)).outcome).toBe("ERROR");
    expect(prisma.voiceCall.create.mock.calls[0][0].data).toMatchObject({ outcome: "ERROR", error: "db down" });
  });
});

describe("readExtra (the second-form details)", () => {
  const { readExtra } = jest.requireActual("./voice-payload") as typeof import("./voice-payload");

  it("reads income, work, EMIs and the callback request from the agent's structured fields", () => {
    const x = readExtra({ data: { employment_type: "salaried", monthly_income_inr: "85,000", employer_or_company: "Acme", years_in_current_job: 4, existing_emi_total_inr: 12000, cibil_score: 745, email: "A@B.com", outcome: "human_callback_requested", callback_time_preference: "evening" } });
    expect(x).toMatchObject({ employmentType: "SALARIED", monthlyIncome: 85000, employer: "Acme", yearsInJob: 4, existingEmi: 12000, cibil: 745, email: "a@b.com", humanCallback: true, doNotCall: false, callbackTime: "evening" });
  });

  it("drops a CIBIL score that cannot be real and a bad email, and spots do-not-call", () => {
    const x = readExtra({ cibil_score: 12, email: "nope", do_not_call: true });
    expect(x.cibil).toBeNull();
    expect(x.email).toBeNull();
    expect(x.doNotCall).toBe(true);
  });

  it("calls a self-employed person self-employed, not a business owner", () => {
    expect(readExtra({ employment_type: "self_employed" }).employmentType).toBe("SELF_EMPLOYED");
    expect(readExtra({ employment_type: "business_owner" }).employmentType).toBe("BUSINESS");
  });
});

describe("callNote with the extra details", () => {
  it("puts a do-not-call and the figures the person gave into the note", () => {
    const { readCall } = jest.requireActual("./voice-payload") as typeof import("./voice-payload");
    const note = callNote(readCall({ name: "Asha", phone: "9876543210", transcript: "hello", do_not_call: true, monthly_income_inr: 60000, cibil_score: 710 }));
    expect(note).toContain("DO NOT CALL");
    expect(note).toContain("Monthly income: 60000");
    expect(note).toContain("CIBIL (as told): 710");
  });
});

describe("Sarvam's real end-of-call message", () => {
  const real = {
    agent_phone_number: "+912269870988",
    user_phone_number: "+918928218139",
    duration: 51.4,
    interaction_id: "20261115/bf50ecd0-15:40:05-aw15154e",
    final_agent_variables: { call_summary: "Vineet from Mumbai requested a home loan of 40 lakhs.", user_name: "Manan" },
    interaction_transcript: [{ role: "agent", en_text: "Hello, I am Jia", indic_text: "नमस्ते" }, { role: "user", en_text: "I need a home loan", indic_text: "होम लोन" }],
  };

  it("takes the caller from user_phone_number (not our own agent number), the transcript from en_text, and the summary", () => {
    const c = readCall(real);
    expect(c.phone).toBe("8928218139");
    expect(c.connected).toBe(true);
    expect(c.transcript).toContain("user: I need a home loan");
    expect(c.summary).toContain("home loan of 40 lakhs");
    expect(c.name).toBe("Manan");
  });

  it("prefers the name the agent collected over the name the call was dialled with", () => {
    expect(readCall({ ...real, output_agent_variables: { full_name: "Vineet Sarnaik" } }).name).toBe("Vineet Sarnaik");
  });
});

describe("loan type and amount when the agent only sends a summary", () => {
  const { loanSlug, amountIn } = jest.requireActual("./voice-payload") as typeof import("./voice-payload");
  it("maps what was said to our loan products", () => {
    expect(loanSlug("home loan")).toBe("home-loan");
    expect(loanSlug("LAP")).toBe("loan-against-property");
    expect(loanSlug(null, "wants a loan against his shop")).toBe("loan-against-property");
    expect(loanSlug("used car")).toBe("used-car-loan");
    expect(loanSlug("something odd")).toBeNull();
  });
  it("finds the amount in the summary", () => {
    expect(amountIn("requested a home loan of 40 lakhs")).toBe(4000000);
    expect(amountIn("needs 1.5 crore")).toBe(15000000);
    expect(amountIn("no figure")).toBeNull();
    expect(readCall({ user_phone_number: "+918928218139", duration: 30, final_agent_variables: { call_summary: "Needs a home loan of 40 lakhs in Mumbai." } }).amount).toBe(4000000);
  });
});

describe("the name the caller said", () => {
  it("takes it from the caller's own lines, ahead of the name the call was dialled with", () => {
    const base = { user_phone_number: "+918928218139", duration: 50, final_agent_variables: { user_name: "Manan" } };
    const said = [{ role: "agent", en_text: "Hello, I am Jiya" }, { role: "user", en_text: "My name is Vineet. I need a loan of 40 lakhs." }];
    expect(readCall({ ...base, interaction_transcript: said }).name).toBe("Vineet");
    expect(readCall({ ...base }).name).toBe("Manan");
    expect(readCall({ ...base, interaction_transcript: said, output_agent_variables: { full_name: "Vineet Sarnaik" } }).name).toBe("Vineet Sarnaik");
  });
  it("does not take the agent's own name or a job as the caller's name", () => {
    const c = readCall({ user_phone_number: "+918928218139", duration: 20, interaction_transcript: [{ role: "agent", en_text: "I am Jiya" }, { role: "user", en_text: "I am self-employed" }] });
    expect(c.name).toBeNull();
  });
});


describe("CA and legal enquiries on a call", () => {
  const call = (extra: Record<string, unknown>, summary = "") => readCall({ user_phone_number: "9820012345", duration: 60, interaction_transcript: [], call_summary: summary, ...extra });
  it("is read when the agent reports it", () => {
    const c = call({ service_interest: "CA and legal", ca_legal_service: "GST registration", ca_legal_need: "GST registration for a shop in Thane", callback_time_preference: "evening" });
    expect(c.extra).toMatchObject({ serviceInterest: "ca_legal", caLegalService: "GST registration", caLegalNeed: "GST registration for a shop in Thane" });
    expect(caLegalOf(c)).toEqual({ services: ["GST & Compliance"], need: "GST registration for a shop in Thane" });
  });
  it("is spotted from the summary when the agent forgot to say so", () => {
    expect(caLegalOf(call({}, "The caller wants an ITR filed for last year and asked about charges."))?.services).toEqual(["Tax & Income Tax"]);
  });
  it("is not invented for an ordinary loan call", () => {
    expect(caLegalOf(call({ service_interest: "loan" }, "Wants a home loan of 40 lakh in Pune."))).toBeNull();
    expect(call({ service_interest: "loan" }).extra.serviceInterest).toBe("loan");
    expect(call({ service_interest: "both" }).extra.serviceInterest).toBe("both");
    expect(call({ service_interest: "something else" }).extra.serviceInterest).toBeNull();
    expect(call({ service_interest: "loan and GST filing" }).extra.serviceInterest).toBe("both");
  });
  it("is written on the lead's note for the CA and legal team", () => {
    const note = callNote(call({ service_interest: "ca_legal", ca_legal_need: "rent agreement for a flat" }, "Needs a rent agreement."));
    expect(note).toMatch(/CA & LEGAL: the caller asked about Legal Drafting \(rent agreement for a flat\)/);
  });
});

describe("who needs a call back after a call", () => {
  const c = (extra: Record<string, unknown>, summary = "") => readCall({ user_phone_number: "9820012345", duration: 60, interaction_transcript: [], call_summary: summary, ...extra });
  it("asks for a call back when the caller wants a person or named a time", () => {
    expect(followUpReason(c({ outcome: "human_callback_requested" }))).toBe("human-callback");
    expect(followUpReason(c({ callback_time_preference: "evening" }))).toBe("callback-later");
    expect(followUpReason(c({ outcome: "callback_later" }))).toBe("callback-later");
  });
  it("flags CA and legal enquiries and plain collected details", () => {
    expect(followUpReason(c({ service_interest: "ca_legal", ca_legal_service: "GST registration" }))).toBe("ca-legal");
    expect(followUpReason(c({ outcome: "details_collected" }))).toBe("details-collected");
  });
  it("stays quiet for not interested, wrong number and do not call", () => {
    expect(followUpReason(c({ outcome: "not_interested" }))).toBeNull();
    expect(followUpReason(c({ outcome: "wrong_number" }))).toBeNull();
    expect(followUpReason(c({ outcome: "do_not_call", callback_time_preference: "evening" }))).toBeNull();
  });
});
