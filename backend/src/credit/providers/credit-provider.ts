import { createHash } from "node:crypto";

export type BureauRequest = { name: string; pan: string; dateOfBirth: string; phone: string };
export type BureauResult = { score: number | null; reportDate: string; reference: string };

/**
 * What the CRM needs from a credit bureau. A real provider (CIBIL directly, or an authorised
 * aggregator) is a class implementing this; nothing else in the CRM changes when one is added.
 */
export interface CreditBureauProvider {
  /** LIVE results are real and update the applicant; SIMULATED ones are for testing and never do. */
  readonly kind: "LIVE" | "SIMULATED";
  fetch(request: BureauRequest): Promise<BureauResult>;
}

/**
 * A stand-in for demonstrations and tests. The "score" is made up from the PAN so the same PAN always
 * gives the same number — it has nothing to do with the person's real credit history. Refused in production.
 */
export class SandboxProvider implements CreditBureauProvider {
  readonly kind = "SIMULATED" as const;

  async fetch(request: BureauRequest): Promise<BureauResult> {
    const digest = createHash("sha256").update(request.pan.toUpperCase()).digest();
    const score = 560 + (digest.readUInt16BE(0) % 281); // 560–840
    return {
      score,
      reportDate: new Date().toISOString().slice(0, 10),
      reference: `SIM-${digest.toString("hex").slice(0, 10).toUpperCase()}`,
    };
  }
}
