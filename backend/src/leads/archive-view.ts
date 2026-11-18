/** The small calculations behind the Archived leads section; pure, so they are easy to check. */

const DAY_MS = 86_400_000;

/** Whole days a lead took from coming in to being archived (0 for the same day; never negative). */
export function daysInPipeline(createdAt: Date, archivedAt: Date): number {
  return Math.max(0, Math.floor((archivedAt.getTime() - createdAt.getTime()) / DAY_MS));
}

/** The average of those, rounded to a whole day; 0 when there is nothing archived. */
export function averageDays(rows: { createdAt: Date; archivedAt: Date | null }[]): number {
  const days = rows.filter((r) => r.archivedAt).map((r) => daysInPipeline(r.createdAt, r.archivedAt!));
  return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
}

/**
 * Who archived each lead: the newest "archived" entry in the audit log for it. A lead archived, restored and archived
 * again is credited to whoever did it last. Leads with no entry (archived before the log existed) are simply absent.
 */
export function archivedByMap(entries: { entityId: string; actorName: string; createdAt: Date }[]): Map<string, string> {
  const newest = new Map<string, { actorName: string; at: number }>();
  for (const e of entries) {
    const at = e.createdAt.getTime();
    const seen = newest.get(e.entityId);
    if (!seen || at > seen.at) newest.set(e.entityId, { actorName: e.actorName, at });
  }
  return new Map([...newest].map(([id, v]) => [id, v.actorName]));
}

/** Lost reasons by how often they were given, biggest first; a lead lost with no reason counts as "No reason recorded". */
export function lostReasons(rows: { lostReason: string | null }[], max = 6): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const reason = r.lostReason?.trim() || "No reason recorded";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, max);
}
