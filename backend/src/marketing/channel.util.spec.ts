import { channelFromUtm, cleanLandingPage, cleanTag, DEFAULT_CHANNELS } from "./channel.util";

describe("channelFromUtm", () => {
  it.each([
    ["google", "cpc", "Google Search Ads"],
    ["Google", "PPC", "Google Search Ads"],
    ["google", "paid_search", "Google Search Ads"],
    ["google", "display", "Google Display"],
    ["google", "video", "YouTube Ads"],
    ["google", "pmax", "Performance Max / Demand Gen"],
    ["google", "organic", "SEO / Organic search"],
    ["facebook", "cpc", "Meta Ads (Facebook)"],
    ["fb", "paid-social", "Meta Ads (Facebook)"],
    ["meta", "paid", "Meta Ads (Facebook)"],
    ["instagram", "cpc", "Meta Ads (Instagram)"],
    ["ig", "paid", "Meta Ads (Instagram)"],
    ["instagram", "social", "Social media (organic)"],
    ["facebook", "post", "Social media (organic)"],
    ["linkedin", "cpc", "LinkedIn Ads"],
    ["linkedin", "social", "Social media (organic)"],
    ["bing", "cpc", "Microsoft Ads"],
    ["youtube", "cpv", "YouTube Ads"],
    ["twitter", "cpc", "X (Twitter) Ads"],
    ["x", "paid", "X (Twitter) Ads"],
    ["whatsapp", "share", "WhatsApp"],
    ["newsletter", "email", "Email"],
    ["mailchimp", undefined, "Email"],
    ["direct", "none", "Website (direct)"],
    ["partner-site", "referral", "Referral"],
  ])("%s / %s → %s", (source, medium, expected) => expect(channelFromUtm(source, medium)).toBe(expected));

  it("says nothing for tags it does not recognise or when there are none", () => {
    expect(channelFromUtm()).toBeNull();
    expect(channelFromUtm("", "")).toBeNull();
    expect(channelFromUtm("some-blog", "banner-swap")).toBeNull();
    expect(channelFromUtm("google", "weird")).toBeNull();
    // "meta" inside another word is not Meta
    expect(channelFromUtm("metaverse-news", "cpc")).toBeNull();
  });

  it("only ever names a channel that is on the default list", () => {
    const names = new Set(DEFAULT_CHANNELS);
    for (const [s, m] of [["google", "cpc"], ["google", "display"], ["fb", "paid"], ["ig", "paid"], ["linkedin", "cpc"], ["bing", "cpc"], ["x", "paid"], ["whatsapp", "x"], ["email", "email"], ["direct", "none"]] as const) {
      expect(names.has(channelFromUtm(s, m) as string)).toBe(true);
    }
  });
});

describe("DEFAULT_CHANNELS", () => {
  it("has no duplicates and covers digital, offline and relationship sources", () => {
    expect(new Set(DEFAULT_CHANNELS).size).toBe(DEFAULT_CHANNELS.length);
    for (const c of ["Google Search Ads", "Meta Ads (Instagram)", "WhatsApp", "Hoardings", "Society activation", "Roadshow", "Referral", "Walk-in"]) {
      expect(DEFAULT_CHANNELS).toContain(c);
    }
  });
});

describe("tag cleaning", () => {
  it("trims, caps and strips control characters from a tag", () => {
    expect(cleanTag("  diwali-sale \n")).toBe("diwali-sale");
    expect(cleanTag("a\u0000b\u0007c")).toBe("abc");
    expect(cleanTag("x".repeat(500))).toHaveLength(120);
    expect(cleanTag("   ")).toBeUndefined();
    expect(cleanTag(42)).toBeUndefined();
  });

  it("keeps only the path of a landing page — never the query, which can hold personal details", () => {
    expect(cleanLandingPage("https://growthcapitalservices.in/loans/business?phone=9876543210&utm_source=g#top")).toBe("/loans/business");
    expect(cleanLandingPage("/lp/home-loan?x=1")).toBe("/lp/home-loan");
    expect(cleanLandingPage("lp/home-loan")).toBe("/lp/home-loan");
    expect(cleanLandingPage("https://example.com")).toBe("/");
    expect(cleanLandingPage("")).toBeUndefined();
    expect(cleanLandingPage("http://")).toBeUndefined();
    expect(cleanLandingPage(undefined)).toBeUndefined();
  });
});

describe("tracking-link presets offered in the CRM", () => {
  // Mirrors TRACKING_PRESETS in frontend/src/lib/marketing.ts — a link built there must be credited to the channel it names.
  it.each([
    ["Google Search Ads", "google", "cpc"],
    ["Google Display", "google", "display"],
    ["YouTube Ads", "youtube", "video"],
    ["Meta Ads (Facebook)", "facebook", "paid_social"],
    ["Meta Ads (Instagram)", "instagram", "paid_social"],
    ["LinkedIn Ads", "linkedin", "paid_social"],
    ["Microsoft Ads", "bing", "cpc"],
    ["WhatsApp", "whatsapp", "share"],
    ["Email", "newsletter", "email"],
  ])("%s ← utm_source=%s&utm_medium=%s", (channel, source, medium) => {
    expect(channelFromUtm(source, medium)).toBe(channel);
    expect(DEFAULT_CHANNELS).toContain(channel);
  });
});
