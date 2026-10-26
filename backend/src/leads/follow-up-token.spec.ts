import { checkFollowUpToken, issueFollowUpToken } from "./follow-up-token";

describe("lead follow-up pass", () => {
  const now = 1_700_000_000_000;
  it("accepts its own pass for the same lead, until it expires", () => {
    const token = issueFollowUpToken("lead1", "s3cret", now);
    expect(checkFollowUpToken("lead1", token, "s3cret", now + 60_000)).toBe(true);
    expect(checkFollowUpToken("lead1", token, "s3cret", now + 3 * 60 * 60 * 1000)).toBe(false);
  });
  it("refuses another lead, another secret, and a doctored or empty pass", () => {
    const token = issueFollowUpToken("lead1", "s3cret", now);
    expect(checkFollowUpToken("lead2", token, "s3cret", now)).toBe(false);
    expect(checkFollowUpToken("lead1", token, "other", now)).toBe(false);
    expect(checkFollowUpToken("lead1", token.replace(/.$/, "x"), "s3cret", now)).toBe(false);
    expect(checkFollowUpToken("lead1", "", "s3cret", now)).toBe(false);
    expect(checkFollowUpToken("lead1", "9999999999999.abc", "s3cret", now)).toBe(false);
  });
});
