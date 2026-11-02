import { normalisePhone } from "../common/phone.util";

/** The key a number is stored under: ten digits for India, otherwise whatever digits were given. */
export const contactKey = (value: unknown) => normalisePhone(value) ?? "";

/** What Meta wants in the "to" field: country code and number, digits only. */
export const toWaId = (phone: string) => (/^\d{10}$/.test(phone) ? `91${phone}` : phone.replace(/\D/g, ""));

/** Meta allows free-form replies for 24 hours after the customer's last message. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const windowOpen = (lastInboundAt: Date | null | undefined, now: Date = new Date()) =>
  Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS);
