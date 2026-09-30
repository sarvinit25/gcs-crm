import { generatePortalAccessCode } from "./access-code.util";

describe("portal access code", () => {
  it("is 8 characters from an alphabet without look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      expect(generatePortalAccessCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("does not repeat in practice", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generatePortalAccessCode()));
    expect(codes.size).toBe(2000);
  });
});
