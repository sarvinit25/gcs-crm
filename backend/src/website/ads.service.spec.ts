import { adStatus } from "./ads.service";

describe("adStatus", () => {
  const ad = { paused: false, startsAt: new Date("2026-10-19T18:30:00.000Z"), endsAt: new Date("2026-10-31T18:29:59.999Z") }; // 20–31 Oct, India time

  it("is scheduled before the first day and ended after the last", () => {
    expect(adStatus(ad, new Date("2026-10-19T18:29:59.999Z"))).toBe("SCHEDULED");
    expect(adStatus(ad, new Date("2026-10-31T18:30:00.000Z"))).toBe("ENDED");
  });

  it("is live from the first minute of the first day to the last minute of the last", () => {
    expect(adStatus(ad, new Date("2026-10-19T18:30:00.000Z"))).toBe("LIVE");
    expect(adStatus(ad, new Date("2026-10-31T18:29:59.999Z"))).toBe("LIVE");
  });

  it("paused beats every date", () => {
    expect(adStatus({ ...ad, paused: true }, new Date("2026-10-25T00:00:00.000Z"))).toBe("PAUSED");
  });
});
