import { Prisma, Role } from "@prisma/client";
import type { AuthUser } from "../auth/auth.decorators";
import { rangeFilter, type Range } from "../common/date.util";

export type ReportRange = { range?: string; from?: string; to?: string };

/** When a sanction counts: the date on the sanction letter, or when it was recorded if that was never keyed in. */
export function sanctionedInRange(range: Range): Prisma.SanctionWhereInput {
  const f = rangeFilter(range);
  return f ? { OR: [{ sanctionDate: f }, { sanctionDate: null, createdAt: f }] } : {};
}

/** Staff see only the leads assigned to them and the files they own; Admin and Manager see everything. */
export const leadScope = (user: AuthUser): Prisma.LeadWhereInput =>
  user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};

export const appScope = (user: AuthUser): Prisma.ApplicationWhereInput =>
  user.role === Role.ADVISOR ? { ownerId: user.id } : {};

/** The extra narrowing the filter bar and the lists offer, shared by every report. */
export type SourceFilters = {
  lenderId?: string;
  /** Lead source (the channel name); "none" means leads that have none. */
  channel?: string;
  /** Sourcing partner id; "none" means leads that came with no partner. */
  partnerId?: string;
  ownerId?: string;
};

const orNone = <T extends string>(value: T) => (value === "none" ? null : value);

/** Where-clause on the lead behind a record (channel and partner), or undefined when neither is set. */
export function leadSourceWhere(f: SourceFilters): Prisma.LeadWhereInput | undefined {
  if (!f.channel && !f.partnerId) return undefined;
  return {
    ...(f.channel && { channel: orNone(f.channel) }),
    ...(f.partnerId && { sourcingPartnerId: orNone(f.partnerId) }),
  };
}

/**
 * Narrowing for anything that hangs off a file (applications, sanctions, disbursals, commissions, logins).
 * Every field here is indexed: lenderId, ownerId, and the lead's channel / sourcingPartnerId.
 */
export function appFilterWhere(f: SourceFilters, user: AuthUser): Prisma.ApplicationWhereInput {
  const lead = leadSourceWhere(f);
  return {
    ...appScope(user),
    ...(f.lenderId && { lenderId: f.lenderId }),
    ...(f.ownerId && { ownerId: f.ownerId }),
    ...(lead && { lead }),
  };
}

/** Narrowing for leads and the things that hang off them (follow-ups). A lender only applies once a file exists. */
export function leadFilterWhere(f: SourceFilters, user: AuthUser): Prisma.LeadWhereInput {
  return {
    ...leadScope(user),
    ...leadSourceWhere(f),
    ...(f.ownerId && { assignedOfficerId: f.ownerId }),
    ...(f.lenderId && { application: { lenderId: f.lenderId } }),
  };
}
