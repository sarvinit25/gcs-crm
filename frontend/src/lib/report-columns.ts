/**
 * Column-picker logic for the "Customize report" dialog: grouping by section, searching, and the select
 * all / clear / per-section toggles. The column list itself comes from the server's catalogue.
 */

export type CatalogueColumn = {
  key: string;
  label: string;
  type: "text" | "amount" | "date" | "percent" | "number";
  section: string;
  standard?: boolean;
  commission?: boolean;
};
export type CatalogueSection = { id: string; label: string };
export type TypeCatalogue = {
  type: string;
  label: string;
  noun: string;
  sections: CatalogueSection[];
  columns: CatalogueColumn[];
  standardColumns: string[];
};
export type Catalogue = Record<string, TypeCatalogue>;

export type SectionGroup = { section: CatalogueSection; columns: CatalogueColumn[] };

/** Columns whose label (or section name) contains the search text, grouped under their sections; empty sections vanish. */
export function groupColumns(cat: TypeCatalogue, search: string): SectionGroup[] {
  const needle = search.trim().toLowerCase();
  return cat.sections
    .map((section) => ({
      section,
      columns: cat.columns.filter(
        (c) => c.section === section.id && (!needle || c.label.toLowerCase().includes(needle) || section.label.toLowerCase().includes(needle)),
      ),
    }))
    .filter((g) => g.columns.length > 0);
}

export type CheckState = "none" | "some" | "all";

export function sectionState(group: SectionGroup, selected: ReadonlySet<string>): CheckState {
  const n = group.columns.filter((c) => selected.has(c.key)).length;
  return n === 0 ? "none" : n === group.columns.length ? "all" : "some";
}

/** Flips one section: all selected → clears it, otherwise selects it all. Other sections are untouched. */
export function toggleSection(group: SectionGroup, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const all = sectionState(group, selected) === "all";
  for (const c of group.columns) {
    if (all) next.delete(c.key);
    else next.add(c.key);
  }
  return next;
}

export function toggleColumn(key: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export const selectAll = (cat: TypeCatalogue): Set<string> => new Set(cat.columns.map((c) => c.key));

/** The chosen keys in catalogue order (sections, then columns), which is the order of the export. */
export function orderedSelection(cat: TypeCatalogue, selected: ReadonlySet<string>): string[] {
  return cat.columns.filter((c) => selected.has(c.key)).map((c) => c.key);
}

/** Keeps only keys the catalogue still has — a saved template may name a column that has since gone. */
export function applyTemplate(cat: TypeCatalogue, keys: readonly string[]): Set<string> {
  const known = new Set(cat.columns.map((c) => c.key));
  return new Set(keys.filter((k) => known.has(k)));
}

export const selectionSummary = (selected: number, total: number) => `${selected} of ${total} columns selected`;
