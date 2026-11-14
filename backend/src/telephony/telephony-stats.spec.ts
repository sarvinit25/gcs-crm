import { parsePlivoTime, plivoStamp, toCallRecord } from "./plivo.client";
import { summarise, type CallRecord } from "./telephony-stats";

const call = (over: Partial<CallRecord>): CallRecord => ({
  direction: "outbound",
  customerNumber: "919800000001",
  at: new Date("2026-11-02T06:00:00Z"), // 11:30 in Mumbai
  seconds: 60,
  hangupCause: "Normal Hangup",
  cost: 1,
  ...over,
});

describe("summarise", () => {
  it("is all zeros, with no chart rows, when there were no calls", () => {
    const s = summarise([]);
    expect(s.totals).toMatchObject({ calls: 0, answered: 0, answerRate: 0, avgSeconds: 0, cost: 0 });
    expect(s.series).toEqual([]);
    expect(s.topNumbers).toEqual([]);
  });

  it("counts a call as answered only when someone was connected, and averages talk time over those", () => {
    const s = summarise([call({ seconds: 120 }), call({ seconds: 60 }), call({ seconds: 0, hangupCause: "No Answer" })]);
    expect(s.totals).toMatchObject({ calls: 3, answered: 2, unanswered: 1, answerRate: 67, totalSeconds: 180, avgSeconds: 90 });
    expect(s.byOutcome[0]).toEqual({ cause: "Normal Hangup", calls: 2 });
  });

  it("can treat very short connections as missed", () => {
    const calls = [call({ seconds: 3 }), call({ seconds: 45 })];
    expect(summarise(calls).totals.answered).toBe(2);
    expect(summarise(calls, { minSeconds: 10 }).totals).toMatchObject({ answered: 1, unanswered: 1, answerRate: 50, avgSeconds: 45 });
  });

  it("splits inbound from outbound", () => {
    const s = summarise([call({}), call({ direction: "inbound", seconds: 0 })]);
    expect(s.byDirection).toEqual([
      { direction: "outbound", calls: 1, answered: 1, seconds: 60 },
      { direction: "inbound", calls: 1, answered: 0, seconds: 0 },
    ]);
  });

  it("fills quiet days with zeros and uses India days, not UTC", () => {
    const s = summarise([
      call({ at: new Date("2026-10-31T20:00:00Z") }), // already 1 Nov in Mumbai
      call({ at: new Date("2026-11-03T06:00:00Z") }),
    ]);
    expect(s.grain).toBe("day");
    expect(s.series.map((r) => [r.key, r.calls])).toEqual([
      ["2026-11-01", 1],
      ["2026-11-02", 0],
      ["2026-11-03", 1],
    ]);
    expect(s.series[0].label).toBe("01 Nov");
  });

  it("switches to months for a long window, across a year boundary", () => {
    const s = summarise([call({ at: new Date("2026-11-05T06:00:00Z") }), call({ at: new Date("2027-02-05T06:00:00Z") })]);
    expect(s.grain).toBe("month");
    expect(s.series.map((r) => r.key)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("reports the busiest hours in India time", () => {
    const s = summarise([call({}), call({ at: new Date("2026-11-02T06:10:00Z") })]);
    expect(s.byHour[11]).toEqual({ hour: 11, calls: 2, answered: 2 });
  });

  it("ranks the numbers called most and keeps only the top few", () => {
    const calls = [call({ customerNumber: "1" }), call({ customerNumber: "2" }), call({ customerNumber: "2" })];
    expect(summarise(calls, { topNumbers: 1 }).topNumbers).toEqual([{ number: "2", calls: 2, answered: 2, seconds: 120 }]);
  });
});

describe("Plivo records", () => {
  it("reads the offset Plivo writes, and treats a bare stamp as India time", () => {
    expect(parsePlivoTime("2026-11-09 14:03:11+05:30")?.toISOString()).toBe("2026-11-09T08:33:11.000Z");
    expect(parsePlivoTime("2026-11-09 14:03:11")?.toISOString()).toBe("2026-11-09T08:33:11.000Z");
    expect(parsePlivoTime("nonsense")).toBeNull();
  });

  it("writes filter stamps in India time", () => {
    expect(plivoStamp(new Date("2026-11-09T18:30:00Z"))).toBe("2026-11-10 00:00:00");
  });

  it("takes the customer's number from the right side of the call", () => {
    const base = { initiation_time: "2026-11-09 10:00:00+05:30", call_duration: "30", total_amount: "0.5" };
    expect(toCallRecord({ ...base, call_direction: "outbound", from_number: "912269870988", to_number: "+91 98000 00001" })).toMatchObject({
      direction: "outbound",
      customerNumber: "+919800000001",
      seconds: 30,
      cost: 0.5,
    });
    expect(toCallRecord({ ...base, call_direction: "inbound", from_number: "919811111111", to_number: "912269870988" })?.customerNumber).toBe("919811111111");
    expect(toCallRecord({ call_direction: "inbound" })).toBeNull();
  });
});
