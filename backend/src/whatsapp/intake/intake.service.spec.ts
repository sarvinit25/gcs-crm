import { scrub } from "./intake.service";

describe("scrub", () => {
  it("hides numbers a customer should never send, before anything goes to the AI", () => {
    expect(scrub("my pan is ABCDE1234F ok")).toBe("my pan is [PAN removed] ok");
    expect(scrub("aadhaar 1234 5678 9012")).toBe("aadhaar [ID number removed]");
    expect(scrub("otp is 482913")).toContain("[otp removed]");
    expect(scrub("my account number is 12345678901")).toBe("my [account number removed]");
    expect(scrub("card 4111111111111111")).not.toMatch(/4111/);
    expect(scrub("4111111111111111")).toBe("[number removed]");
  });
  it("leaves ordinary figures alone, such as an amount or a mobile number", () => {
    expect(scrub("I need 4000000 rupees for 15 years")).toBe("I need 4000000 rupees for 15 years");
    expect(scrub("I need 100000000 rupees")).toBe("I need 100000000 rupees");
    expect(scrub("my phone is 9820011177")).toBe("my phone is 9820011177");
  });
});

describe("stopping and resuming the questions", () => {
  const { STOP_ASKING, RESUME_ASKING } = jest.requireActual("./intake.service");
  it("hears that the customer is done with questions", () => {
    for (const t of ["I'll say other things later on call", "baaki call pe bata dunga", "no more questions please", "stop asking", "that's all", "कॉल पर बताऊंगा"]) expect(STOP_ASKING.test(t)).toBe(true);
  });
  it("does not mistake an ordinary answer for it", () => {
    for (const t of ["Mumbai", "salaried", "I need it later this year", "20 lakh", "within a month", "hi"]) expect(STOP_ASKING.test(t)).toBe(false);
  });
  it("only a clear yes brings the questions back, not a hello", () => {
    for (const t of ["continue", "yes", "haan chalo", "go ahead"]) expect(RESUME_ASKING.test(t)).toBe(true);
    for (const t of ["hi", "hello", "what is the rate", "ok thanks"]) expect(RESUME_ASKING.test(t)).toBe(false);
  });
});
