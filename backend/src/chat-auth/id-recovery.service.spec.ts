import { IdRecoveryService } from "./id-recovery.service";

type Partner = { code: string; active: boolean; email: string | null } | null;

function make({ smsReady, partner }: { smsReady: boolean; partner: Partner }) {
  let stored: { id: string; codeHash: string; attempts: number } | null = null;
  const prisma = {
    idRecoveryOtp: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(async ({ data }: { data: { codeHash: string } }) => {
        stored = { id: "otp1", codeHash: data.codeHash, attempts: 0 };
        return { id: "otp1" };
      }),
      findFirst: jest.fn().mockImplementation(async () => (stored ? { ...stored } : null)),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    sourcingPartner: {
      findUnique: jest.fn().mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
        partner ? Object.fromEntries(Object.keys(select).map((k) => [k, (partner as Record<string, unknown>)[k]])) : null,
      ),
    },
    application: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const sender = { smsReady, smsIdReady: smsReady, send: jest.fn().mockResolvedValue(true), sendGcsId: jest.fn().mockResolvedValue(true) };
  const alerts = { idRecoveryCodeEmail: jest.fn().mockResolvedValue(true), gcsIdEmail: jest.fn().mockResolvedValue(true) };
  const config = { get: (k: string) => (k === "JWT_SECRET" ? "x".repeat(40) : undefined) };
  const svc = new IdRecoveryService(prisma as never, sender as never, alerts as never, config as never);
  return { svc, sender, alerts, prisma };
}

const known: Partner = { code: "GCS-BSA-001", active: true, email: "partner@example.in" };
const dto = { kind: "partner" as const, phone: "9876500022" };

describe("IdRecoveryService with no SMS number", () => {
  it("emails the code to the address on file, and says codes go by email", async () => {
    const { svc, sender, alerts } = make({ smsReady: false, partner: known });
    const out = await svc.sendCode(dto);
    expect(alerts.idRecoveryCodeEmail).toHaveBeenCalledWith("partner@example.in", expect.stringMatching(/^\d{6}$/), expect.any(Number), "partner");
    expect(sender.send).not.toHaveBeenCalled();
    expect(out).toMatchObject({ sent: true, via: "email" });
  });

  it("answers the same, and sends nothing, when the number has no email or is not a partner", async () => {
    const noEmail = make({ smsReady: false, partner: { ...known, email: null } });
    const unknown = make({ smsReady: false, partner: null });
    const a = await noEmail.svc.sendCode(dto);
    const b = await unknown.svc.sendCode(dto);
    expect(noEmail.alerts.idRecoveryCodeEmail).not.toHaveBeenCalled();
    expect(unknown.alerts.idRecoveryCodeEmail).not.toHaveBeenCalled();
    expect({ ...a, resendAfterSeconds: 0 }).toEqual({ ...b, resendAfterSeconds: 0 });
  });

  it("emails the GCS ID, only to the address on file, once the code is right", async () => {
    const { svc, alerts, sender } = make({ smsReady: false, partner: known });
    await svc.sendCode(dto);
    const code = alerts.idRecoveryCodeEmail.mock.calls[0]![1] as string;
    const out = await svc.verify({ ...dto, code });
    expect(alerts.gcsIdEmail).toHaveBeenCalledWith("partner@example.in", "partner", ["GCS-BSA-001"]);
    expect(sender.sendGcsId).not.toHaveBeenCalled();
    expect(out).toMatchObject({ sent: true, via: "email" });
  });
});

describe("IdRecoveryService with an SMS number", () => {
  it("still texts the code and the ID", async () => {
    const { svc, sender, alerts } = make({ smsReady: true, partner: known });
    await svc.sendCode(dto);
    expect(sender.send).toHaveBeenCalled();
    expect(alerts.idRecoveryCodeEmail).not.toHaveBeenCalled();
    const code = sender.send.mock.calls[0]![1] as string;
    const out = await svc.verify({ ...dto, code });
    expect(sender.sendGcsId).toHaveBeenCalledWith("9876500022", "GCS-BSA-001");
    expect(out).toMatchObject({ sent: true, via: "sms" });
  });
});
