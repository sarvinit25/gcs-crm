import { welcomeEmail } from "./welcome-email";

describe("the welcome email for a new team member", () => {
  const mail = welcomeEmail({ name: "Mahesh Ghadge", email: "m@example.com", role: "ADMIN" as never, password: "Tiger-Lotus-4821", loginUrl: "https://crm.example.in/crm/login" });
  it("carries the sign-in link, email, password and role in both versions", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("https://crm.example.in/crm/login");
      expect(body).toContain("m@example.com");
      expect(body).toContain("Tiger-Lotus-4821");
      expect(body).toContain("Super Admin");
    }
    expect(mail.html).toContain("Hello Mahesh");
    expect(mail.subject).toMatch(/CRM account/);
  });
  it("cannot be broken by markup in a name", () => {
    const m = welcomeEmail({ name: "<script>x</script> A", email: "a@b.in", role: "ADVISOR" as never, password: "p<w>", loginUrl: "https://x.in" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("p&lt;w&gt;");
  });
});
