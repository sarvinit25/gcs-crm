import { MailService } from "./mail.service";

const settings = (over: Record<string, string> = {}) => ({
  get: (k: string) =>
    ({ ZOHO_CLIENT_ID: "id", ZOHO_CLIENT_SECRET: "secret", ZOHO_REFRESH_TOKEN: "refresh", ZOHO_ACCOUNT_ID: "123", ZOHO_FROM_ADDRESS: "a@b.in", ...over })[k],
});
const make = (over?: Record<string, string>) => new MailService(settings(over) as never);

describe("MailService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is off when a setting is missing or the region is not a Zoho one", () => {
    expect(make({ ZOHO_CLIENT_ID: "" }).enabled).toBe(false);
    expect(make({ ZOHO_REGION: "mars" }).enabled).toBe(false);
    expect(make().enabled).toBe(true);
    for (const region of ["in", "com", "eu", "au", "jp", "ca", "sa"]) expect(make({ ZOHO_REGION: region }).enabled).toBe(true);
  });

  it("uses the region's own Zoho address", async () => {
    const urls: string[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      return String(url).includes("oauth") ? ({ ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) } as Response) : ({ ok: true, status: 200 } as Response);
    });
    expect(await make({ ZOHO_REGION: "au" }).send({ to: "x@y.in", subject: "s", text: "t" })).toBe(true);
    expect(urls[0]).toContain("accounts.zoho.com.au");
    expect(urls[1]).toContain("mail.zoho.com.au");
  });

  it("says in plain words why Zoho refused, without repeating any secret", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_code" }) }) as Response);
    const mail = make();
    expect(await mail.send({ to: "x@y.in", subject: "s", text: "t" })).toBe(false);
    expect(mail.lastError).toMatch(/refresh token/i);
    expect(mail.lastError).not.toMatch(/secret|refresh"|123/);
  });

  it("explains a refused send", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (url) =>
      String(url).includes("oauth")
        ? ({ ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response)
        : ({ ok: false, status: 404, text: async () => "" } as Response),
    );
    const mail = make();
    expect(await mail.send({ to: "x@y.in", subject: "s", text: "t" })).toBe(false);
    expect(mail.lastError).toMatch(/ZOHO_ACCOUNT_ID/);
  });
});
