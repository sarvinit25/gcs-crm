import { testimonialAlert } from "../alerts/email-templates";
import { TestimonialsService } from "./testimonials.service";

const good = { name: "Asha Kulkarni", quote: "They sorted out my home loan in two weeks and explained every step clearly.", rating: "5", consentWords: "true", signedName: "Asha Kulkarni", city: "Pune", product: "Home Loan", role: "Teacher", contact: "9000000001" };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

function build(waiting = 0) {
  const prisma = { testimonialSubmission: { count: jest.fn().mockResolvedValue(waiting), create: jest.fn().mockResolvedValue({}) } };
  const alerts = { newTestimonial: jest.fn().mockResolvedValue(undefined) };
  const service = new TestimonialsService(prisma as never, {} as never, alerts as never);
  return { service, prisma, alerts };
}

describe("telling the team about a testimonial", () => {
  it("emails once for a real submission, with what the team needs to see", async () => {
    const { service, alerts, prisma } = build();
    expect(await service.submit(good, undefined, "1.2.3.4")).toEqual({ ok: true });
    expect(prisma.testimonialSubmission.create).toHaveBeenCalledTimes(1);
    expect(alerts.newTestimonial).toHaveBeenCalledTimes(1);
    expect(alerts.newTestimonial).toHaveBeenCalledWith(expect.objectContaining({ name: "Asha Kulkarni", rating: 5, city: "Pune", hasPhoto: false, photoOk: false, quote: good.quote }));
  });

  it("says whether a photo came and whether they agreed to its use", async () => {
    const { service, alerts } = build();
    await service.submit({ ...good, consentPhoto: "true" }, { buffer: PNG, size: PNG.length }, "1.2.3.4");
    expect(alerts.newTestimonial).toHaveBeenLastCalledWith(expect.objectContaining({ hasPhoto: true, photoOk: true }));
    await service.submit({ ...good, consentPhoto: "false" }, { buffer: PNG, size: PNG.length }, "1.2.3.4");
    expect(alerts.newTestimonial).toHaveBeenLastCalledWith(expect.objectContaining({ hasPhoto: true, photoOk: false }));
  });

  it("stays silent for a bot, a refused submission, or a full queue", async () => {
    const { service, alerts, prisma } = build();
    expect(await service.submit({ ...good, website: "http://bot.example" }, undefined, "1.2.3.4")).toEqual({ ok: true });
    await expect(service.submit({ ...good, consentWords: "" }, undefined, "1.2.3.4")).rejects.toThrow();
    await expect(service.submit({ ...good }, { buffer: Buffer.from("<html>not a photo</html>" + " ".repeat(20)), size: 40 }, "1.2.3.4")).rejects.toThrow();
    const full = build(200);
    await expect(full.service.submit(good, undefined, "1.2.3.4")).rejects.toThrow();
    expect(alerts.newTestimonial).not.toHaveBeenCalled();
    expect(full.alerts.newTestimonial).not.toHaveBeenCalled();
    expect(prisma.testimonialSubmission.create).not.toHaveBeenCalled();
  });

  it("counts what is waiting for the menu badge", async () => {
    expect(await build(3).service.pendingCount()).toEqual({ pending: 3 });
  });
});

describe("the email itself", () => {
  const org = { name: "Growth Capital Services", address: "Mumbai", phone: "8828001700", email: "connect.gcs@growthcapitalservices.in", websiteUrl: "https://growthcapitalservices.in" };
  it("shows the client's words and a button to the review screen, and says nothing is published", () => {
    const html = testimonialAlert(org, [["Name", "Asha Kulkarni"], ["Rating", "5 out of 5"], ["Photo", "No photo"]], "They were quick and kind.", "https://crm.example/crm/website");
    expect(html).toContain("Asha Kulkarni sent their experience");
    expect(html).toContain("They were quick and kind.");
    expect(html).toContain("https://crm.example/crm/website");
    expect(html).toContain("Nothing is on the website yet");
  });
  it("cannot be turned into a web page by what a client types", () => {
    const html = testimonialAlert(org, [["Name", '<img src=x onerror=alert(1)>'], ["City", "Pune"]], '<script>alert("x")</script>', "https://crm.example/crm/website");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});
