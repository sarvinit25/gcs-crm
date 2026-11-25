import type { ApplicationChecklist } from "./types";

export type ChecklistItem = ApplicationChecklist["items"][number];

/**
 * Groups the list by category, in the order each category first appears. Inside a category the lines still to collect come
 * first and the received ones sink to the bottom; lines of the same kind keep their own order.
 */
export function groupChecklist(items: ChecklistItem[]): [string, ChecklistItem[]][] {
  const groups = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }
  return [...groups.entries()].map(([category, lines]) => [
    category,
    [...lines.filter((l) => l.status !== "GIVEN"), ...lines.filter((l) => l.status === "GIVEN")],
  ]);
}

/** The list as it will look once one line is ticked or un-ticked, so the screen can change before the server answers. */
export function withMark(list: ApplicationChecklist, id: string, given: boolean): ApplicationChecklist {
  const items = list.items.map((i) => (i.id === id ? { ...i, status: given ? ("GIVEN" as const) : ("PENDING" as const) } : i));
  return { ...list, items, given: items.filter((i) => i.status === "GIVEN").length };
}
