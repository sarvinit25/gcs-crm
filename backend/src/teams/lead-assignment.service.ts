import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

type Db = PrismaService | PrismaClient | Prisma.TransactionClient;

/**
 * Decides who owns a new lead when nobody was named — the "Auto case assignment" and "Team routing"
 * switches on the Teams page. Returns null when neither applies, and the lead stays in the unassigned pool.
 */
@Injectable()
export class LeadAssignmentService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async pickOfficer(db: Db, lead: { sourcingPartnerId?: string | null }): Promise<string | null> {
    if (lead.sourcingPartnerId && this.settings.get<boolean>("teams.routeToTeamLead")) {
      const teamLead = await this.teamLeadFor(db, lead.sourcingPartnerId);
      if (teamLead) return teamLead;
    }
    if (this.settings.get<boolean>("teams.autoAssignCases")) return this.nextInTurn(db);
    return null;
  }

  /** The lead of the team that the partner's relationship manager works in, when that team is switched on. */
  private async teamLeadFor(db: Db, partnerId: string) {
    const partner = await db.sourcingPartner.findUnique({
      where: { id: partnerId },
      select: { manager: { select: { team: { select: { active: true, lead: { select: { id: true, active: true } } } } } } },
    });
    const team = partner?.manager?.team;
    return team?.active && team.lead?.active ? team.lead.id : null;
  }

  /**
   * Round-robin: the advisor who has waited longest for a lead. Advisors on an active team come first;
   * with none, any active advisor. The row lock makes two leads arriving together go to two people.
   */
  private async nextInTurn(db: Db) {
    for (const onTeam of [true, false]) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        UPDATE "User" SET "lastLeadAssignedAt" = now()
        WHERE id = (
          SELECT u.id FROM "User" u
          WHERE u.active AND u.role = ${Role.ADVISOR}::"Role"
            AND (${!onTeam} OR EXISTS (SELECT 1 FROM "Team" t WHERE t.id = u."teamId" AND t.active))
          ORDER BY u."lastLeadAssignedAt" ASC NULLS FIRST, u."createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      if (rows[0]) return rows[0].id;
    }
    return null;
  }
}
