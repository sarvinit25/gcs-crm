import { AlertsService } from "./alerts.service";

const build = (opts: { on?: boolean; enabled?: boolean } = {}) => {
  const mail = { enabled: opts.enabled ?? true, send: jest.fn().mockResolvedValue(true) };
  const values: Record<string, unknown> = { "alerts.stageEmails": ["connect@x.in"], "alerts.step.sanction": opts.on ?? true, "org.name": "GCS", "org.address": "", "org.phone": "", "org.email": "" };
  const settings = { get: (k: string) => values[k] };
  const service = new AlertsService(mail as never, settings as never, {} as never, { get: () => "" } as never);
  return { service, mail };
};

describe("step emails", () => {
  it("go to the shared mailbox and the file's owner, once each", async () => {
    const { service, mail } = build();
    await service.stepChanged("sanction", "A sanction was approved: GCS-1", [["File", "GCS-1"]], "/applications/1", { alsoTo: ["Owner@x.in", "connect@x.in"] });
    expect(mail.send.mock.calls[0]![0].to).toEqual(["connect@x.in", "owner@x.in"]);
    expect(mail.send.mock.calls[0]![0].html).toContain("/applications/1");
  });
  it("stay quiet when the step's switch is off or mail is not set up", async () => {
    await (async () => { const { service, mail } = build({ on: false }); await service.stepChanged("sanction", "x", [], "/a"); expect(mail.send).not.toHaveBeenCalled(); })();
    const { service, mail } = build({ enabled: false });
    await service.stepChanged("sanction", "x", [], "/a");
    expect(mail.send).not.toHaveBeenCalled();
  });
});
