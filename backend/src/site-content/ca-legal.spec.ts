import { BadRequestException } from "@nestjs/common";
import { SITE_CONTENT_KEYS, assertCaLegal } from "./site-content.controller";

const built = ["income-tax-return-filing", "gst-registration"];
const service = (over: Record<string, unknown> = {}) => ({
  slug: "rera-complaints",
  division: "Legal Services",
  category: "RERA",
  title: "RERA complaints",
  summary: "Help filing a complaint with MahaRERA.",
  ...over,
});
const refuses = (value: unknown, words: RegExp) => {
  expect(() => assertCaLegal(value, built)).toThrow(BadRequestException);
  expect(() => assertCaLegal(value, built)).toThrow(words);
};

describe("CA & Legal settings", () => {
  it("is a section staff can save", () => {
    expect(SITE_CONTENT_KEYS).toContain("caLegal");
  });

  it("accepts nothing set, hidden services, menu lines and an added service", () => {
    expect(() => assertCaLegal({}, built)).not.toThrow();
    expect(() =>
      assertCaLegal(
        {
          custom: [service({ whoNeedsIt: "Flat buyers", process: ["Share papers", "We draft"], documents: ["Agreement"], icon: "legal" })],
          hidden: ["gst-registration"],
          blurbs: { "Tax & Income Tax": "ITR, tax planning, TDS", RERA: "Builder disputes" },
        },
        built,
      ),
    ).not.toThrow();
  });

  it("refuses anything that is not one of the three settings", () => {
    refuses([], /set of settings/);
    refuses({ banner: "x" }, /Unknown CA & Legal setting/);
  });

  it("will not let an added service take a built-in address, or two share one", () => {
    refuses({ custom: [service({ slug: "gst-registration" })] }, /already a built-in/);
    refuses({ custom: [service(), service()] }, /share the address/);
  });

  it("checks each added service", () => {
    refuses({ custom: [service({ slug: "Bad Slug!" })] }, /lowercase letters/);
    refuses({ custom: [service({ division: "Marketing" })] }, /CA Services or Legal Services/);
    refuses({ custom: [service({ category: "" })] }, /category/);
    refuses({ custom: [service({ title: "x" })] }, /title/);
    refuses({ custom: [service({ summary: "" })] }, /short description/);
    refuses({ custom: [service({ process: Array.from({ length: 31 }, () => "step") })] }, /up to 30 lines/);
    refuses({ custom: [service({ documents: [123] })] }, /short text/);
    refuses({ custom: [service({ icon: "../x" })] }, /icon/);
  });

  it("checks hidden services and menu lines", () => {
    refuses({ hidden: ["Not A Slug"] }, /service addresses/);
    refuses({ hidden: "gst-registration" }, /service addresses/);
    refuses({ blurbs: { RERA: "x".repeat(121) } }, /up to 120 characters/);
    refuses({ blurbs: ["x"] }, /per category/);
  });
});
