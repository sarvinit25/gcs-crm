// Types and small helpers shared by the staff CAM screen and the customer's link form.

export type FieldType = "text" | "longtext" | "number" | "money" | "percent" | "date" | "select" | "yesno" | "phone" | "email";
export type Cond = { path: string; in: string[] };
export type CamField = { key: string; label: string; type: FieldType; options?: string[]; hint?: string; core?: boolean; show?: Cond };
export type CamColumn = { key: string; label: string; type: "text" | "money" | "number" | "percent" | "select" | "yesno" | "date"; options?: string[] };
export type CamTable = { key: string; label: string; hint?: string; columns: CamColumn[]; maxRows: number; startRows?: number; show?: Cond };
export type CamSection = { id: string; title: string; intro?: string; customer: boolean; show?: Cond; fields: CamField[]; tables: CamTable[] };
export type CamData = Record<string, Record<string, unknown>>;

export const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Whether a question, table or section is showing, given the answers so far (the same rule the server uses). */
export function visible(cond: Cond | undefined, data: CamData): boolean {
  if (!cond) return true;
  const [section, key] = cond.path.split(".");
  const v = section && key ? data[section]?.[key] : undefined;
  return typeof v === "string" && cond.in.includes(v);
}

/** Answered visible questions over all visible questions, for a section. */
export function sectionProgress(s: CamSection, data: CamData): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const f of s.fields) if (visible(f.show, data)) { total += 1; if (!blank(data[s.id]?.[f.key])) done += 1; }
  for (const t of s.tables) if (visible(t.show, data)) { total += 1; if (!blank(data[s.id]?.[t.key])) done += 1; }
  return { done, total };
}
