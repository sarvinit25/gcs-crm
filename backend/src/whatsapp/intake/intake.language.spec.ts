import { detectLanguage, languageOfMessage } from "./intake.language";

describe("languageOfMessage", () => {
  it("tells the languages apart", () => {
    expect(languageOfMessage("mujhe home loan chahiye")).toBe("hinglish");
    expect(languageOfMessage("मुझे बिज़नेस लोन चाहिए")).toBe("hi");
    expect(languageOfMessage("मला शैक्षणिक कर्ज हवे आहे")).toBe("mr");
    expect(languageOfMessage("mala home loan pahije")).toBe("mr-roman");
    expect(languageOfMessage("I need a loan for my shop")).toBe("en");
  });
  it("says nothing about a very short English reply", () => {
    expect(languageOfMessage("ok")).toBeNull();
    expect(languageOfMessage("hi")).toBeNull();
  });
});

describe("detectLanguage", () => {
  it("uses the customer's latest typed message, and ignores taps", () => {
    const turns = [
      { role: "user", content: "mujhe home loan chahiye" },
      { role: "assistant", content: "Namaste!" },
      { role: "user", content: "(tapped) Up to 10 years" },
    ];
    expect(detectLanguage(turns)).toBe("hinglish");
  });
  it("defaults to English", () => {
    expect(detectLanguage([{ role: "user", content: "hi" }])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });
});
