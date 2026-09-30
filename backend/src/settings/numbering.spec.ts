import { SettingsService } from "./settings.service";

/** Application numbers are permanent references, so their format is worth pinning down. */
function service(overrides: Record<string, unknown> = {}) {
  const svc = new SettingsService({} as never, {} as never);
  for (const [k, v] of Object.entries(overrides)) (svc as unknown as { cache: Map<string, unknown> }).cache.set(k, v);
  return svc;
}

describe("applicationNo", () => {
  const created = new Date("2026-09-30T10:00:00+05:30");

  it("uses the calendar year by default and pads the sequence", () => {
    expect(service().applicationNo(42, created)).toBe("GCS-2026-0042");
  });

  it("keeps growing past the padding width", () => {
    expect(service().applicationNo(12345, created)).toBe("GCS-2026-12345");
  });

  it("can use the financial year", () => {
    const s = service({ "numbering.financialYear": true });
    expect(s.applicationNo(7, created)).toBe("GCS-2026-27-0007");
    // January 2027 still belongs to FY 2026-27.
    expect(s.applicationNo(8, new Date("2027-01-10T10:00:00+05:30"))).toBe("GCS-2026-27-0008");
  });

  it("numbers a file raised just after midnight IST into the right year", () => {
    // 31 Dec 18:45 UTC is already 1 Jan in Mumbai.
    expect(service().applicationNo(1, new Date("2026-12-31T18:45:00Z"))).toBe("GCS-2027-0001");
  });

  it("omits the year when switched off", () => {
    expect(service({ "numbering.includeYear": false }).applicationNo(3, created)).toBe("GCS-0003");
  });
});
