import { baseModel, classifyCall, estimateUsd, istMonthStart, tokensFrom } from "./usage-tracker";

describe("classifyCall", () => {
  it("names the outside service and what the request was for", () => {
    expect(classifyCall("https://api.openai.com/v1/chat/completions", "POST")).toEqual({ service: "OpenAI", operation: "chat" });
    expect(classifyCall("https://api.openai.com/v1/responses", "POST")).toEqual({ service: "OpenAI", operation: "reading documents" });
    expect(classifyCall("https://api.plivo.com/v1/Account/X/Call/", "POST")).toEqual({ service: "Plivo", operation: "call placed" });
    expect(classifyCall("https://api.plivo.com/v1/Account/X/Call/", "GET")).toEqual({ service: "Plivo", operation: "call records" });
    expect(classifyCall("https://graph.facebook.com/v23.0/123/messages", "POST")).toEqual({ service: "WhatsApp (Meta)", operation: "message sent" });
  });
  it("ignores everything else, including our own addresses and bad input", () => {
    expect(classifyCall("https://challenges.cloudflare.com/turnstile/v0/siteverify", "POST")).toBeNull();
    expect(classifyCall("http://127.0.0.1:4000/crm/api/health")).toBeNull();
    expect(classifyCall("not a url")).toBeNull();
  });
});

describe("tokensFrom", () => {
  it("reads both OpenAI answer shapes", () => {
    expect(tokensFrom({ model: "gpt-5-nano-2025-08-07", usage: { prompt_tokens: 100, completion_tokens: 20 } })).toEqual({ model: "gpt-5-nano-2025-08-07", tokensIn: 100, tokensOut: 20 });
    expect(tokensFrom({ usage: { input_tokens: 7, output_tokens: 3 } })).toMatchObject({ tokensIn: 7, tokensOut: 3 });
    expect(tokensFrom(null)).toEqual({ model: null, tokensIn: null, tokensOut: null });
  });
});

describe("cost estimate", () => {
  it("prices a known model and leaves an unknown one blank", () => {
    expect(baseModel("gpt-5-nano-2025-08-07")).toBe("gpt-5-nano");
    expect(estimateUsd("gpt-5-nano-2025-08-07", 1_000_000, 1_000_000)).toBeCloseTo(0.45, 5);
    expect(estimateUsd("some-new-model", 1000, 1000)).toBeNull();
  });
});

describe("istMonthStart", () => {
  it("starts the month at midnight India time", () => {
    // 15 Nov 2026 10:00 UTC is 15 Nov in India; the month began 1 Nov 00:00 IST = 31 Oct 18:30 UTC
    expect(istMonthStart(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(istMonthStart(new Date("2026-11-15T10:00:00Z"), 1).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    // 30 Nov 20:00 UTC is already 1 Dec in India
    expect(istMonthStart(new Date("2026-11-30T20:00:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });
});
