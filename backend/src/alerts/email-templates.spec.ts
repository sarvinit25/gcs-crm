import { customerThankYou, type Org } from "./email-templates";

const org: Org = { name: "GCS", address: "Mumbai", phone: "8828001700", email: "a@b.in", websiteUrl: "https://example.test" };

describe("the buttons in the customer's thank-you email", () => {
  it("both open the 1700 number: people who tap it are reached by a person, not the 3900 bot number", () => {
    const html = customerThankYou(org, "Asha", "9876543210");
    expect(html).toContain("tel:+918828001700");
    expect(html).toContain("wa.me/918828001700");
    expect(html).not.toContain("8828003900");
  });
});
