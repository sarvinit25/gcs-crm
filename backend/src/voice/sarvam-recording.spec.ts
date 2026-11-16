import { callIds, recordingUrl } from "./sarvam-recording";

describe("Sarvam recording address", () => {
  it("reads the ids a real call carries", () => {
    expect(callIds({ app_id: "GCS-Loan-As-46d8885c-58dc", interaction_id: "20261116/bf50ecd0-14:51:17-aw1da2c6" })).toEqual({
      appId: "GCS-Loan-As-46d8885c-58dc",
      interactionId: "20261116/bf50ecd0-14:51:17-aw1da2c6",
    });
  });
  it("refuses a missing or odd id", () => {
    expect(callIds({ app_id: "x" })).toBeNull();
    expect(callIds({ app_id: "../x", interaction_id: "20261116/a" })).toBeNull();
    expect(callIds({ app_id: "x", interaction_id: "a/../../b?c=1" })).toBeNull();
    expect(callIds(null)).toBeNull();
  });
  it("builds the address with the call id's slash kept", () => {
    expect(recordingUrl({ orgId: "O", workspaceId: "W" }, "APP", "20261116/bf50:1")).toBe(
      "https://apps.sarvam.ai/api/analytics/v1/O/W/APP/recordings/20261116/bf50%3A1",
    );
  });
});
