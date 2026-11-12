import { customerThankYou, type Org } from "./email-templates";

const org: Org = { name: "GCS", address: "Mumbai", phone: "8828001700", whatsapp: "8828003900", email: "a@b.in", websiteUrl: "https://example.test" };

describe("the buttons in the customer's thank-you email", () => {
  it("calls the call number and opens WhatsApp on the WhatsApp number", () => {
    const html = customerThankYou(org, "Asha", "9876543210");
    expect(html).toContain("tel:+918828001700");
    expect(html).toContain("wa.me/918828003900");
    expect(html).not.toContain("wa.me/918828001700");
    expect(html).not.toContain("tel:+918828003900");
  });
  it("falls back to the call number for WhatsApp when no WhatsApp number is set", () => {
    const html = customerThankYou({ ...org, whatsapp: undefined }, "Asha", "9876543210");
    expect(html).toContain("wa.me/918828001700");
  });
});
