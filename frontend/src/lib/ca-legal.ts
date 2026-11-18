// The CA & Legal module's rules, kept apart from the screen so they are easy to test. The website reads what this saves
// (section "caLegal"): services staff added, services to hide, and the line under each category in its header menu.

export type Division = "CA Services" | "Legal Services";
export const DIVISIONS: Division[] = ["CA Services", "Legal Services"];

/** The categories the website's header menu already has, with the line it shows under each (mirrors the website). */
export const BUILT_IN_CATEGORIES: { division: Division; category: string; desc: string }[] = [
  { division: "CA Services", category: "Tax & Income Tax", desc: "ITR, tax planning, TDS" },
  { division: "CA Services", category: "GST & Compliance", desc: "Registration, returns, notices" },
  { division: "CA Services", category: "Accounting & Audit", desc: "Bookkeeping, tax audit" },
  { division: "CA Services", category: "Business Registration", desc: "Company, MSME, Shop Act, PAN" },
  { division: "Legal Services", category: "Legal Drafting", desc: "Agreements, affidavits, notices" },
  { division: "Legal Services", category: "Property Legal Services", desc: "Title checks, deeds, POA" },
  { division: "Legal Services", category: "Housing Society Services", desc: "Share transfer, society NOC" },
  { division: "Legal Services", category: "SRA / MHADA / MMRDA", desc: "Flat transfer documentation" },
  { division: "Legal Services", category: "Redevelopment", desc: "Society redevelopment papers" },
  { division: "Legal Services", category: "NRI & Family Property Services", desc: "NRI property, wills, succession" },
];

/** The pictures a service can have; the website turns the name into the icon. */
export const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "agreement", label: "Agreement" },
  { value: "legal", label: "Scales (legal)" },
  { value: "tax", label: "Receipt (tax)" },
  { value: "percent", label: "Percent (GST)" },
  { value: "accounts", label: "Calculator (accounts)" },
  { value: "registration", label: "Badge (registration)" },
  { value: "business", label: "Building (business)" },
  { value: "property", label: "House (property)" },
  { value: "government", label: "Government building" },
  { value: "construction", label: "Hard hat (construction)" },
  { value: "nri", label: "Globe (NRI)" },
  { value: "family", label: "People (family)" },
  { value: "advisory", label: "Briefcase (advisory)" },
  { value: "protection", label: "Shield" },
];

export type CustomService = {
  slug: string;
  division: Division;
  category: string;
  title: string;
  summary: string;
  whoNeedsIt?: string;
  process?: string[];
  documents?: string[];
  icon?: string;
};

export type CaLegalSettings = {
  custom?: CustomService[];
  hidden?: string[];
  blurbs?: Record<string, string>;
};

/** "Rent Agreement & NOC" -> "rent-agreement-noc": the address the service gets on the website. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** One line per entry, blanks dropped: how steps and documents are typed in a box and stored as a list. */
export function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** What is wrong with a service as typed, in words for staff, or null when it can be saved. */
export function serviceProblem(s: CustomService, others: CustomService[], builtInSlugs: string[]): string | null {
  if (s.title.trim().length < 2) return "Give the service a title.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) return `"${s.title.trim() || "This service"}" needs an address of lowercase letters, numbers and dashes.`;
  if (builtInSlugs.includes(s.slug)) return `The address "${s.slug}" is already used by a built-in service. Change the title or the address.`;
  if (others.some((o) => o !== s && o.slug === s.slug)) return `Two of your services have the address "${s.slug}". Change one.`;
  if (s.category.trim().length < 2) return `Pick or type a category for "${s.title.trim()}".`;
  if (!s.summary.trim()) return `Add a short description for "${s.title.trim()}".`;
  return null;
}

/** The first thing wrong with the added services, if anything. */
export function firstProblem(custom: CustomService[], builtInSlugs: string[]): string | null {
  for (const s of custom) {
    const p = serviceProblem(s, custom, builtInSlugs);
    if (p) return p;
  }
  return null;
}

/** What gets saved: trimmed text, no blank lines, no empty menu lines, no repeats. Nothing set means nothing saved. */
export function buildSettings(custom: CustomService[], hidden: string[], blurbs: Record<string, string>): CaLegalSettings {
  const out: CaLegalSettings = {};
  if (custom.length) {
    out.custom = custom.map((s) => ({
      slug: s.slug,
      division: s.division,
      category: s.category.trim(),
      title: s.title.trim(),
      summary: s.summary.trim(),
      ...(s.whoNeedsIt?.trim() ? { whoNeedsIt: s.whoNeedsIt.trim() } : {}),
      ...(s.process?.length ? { process: s.process.map((l) => l.trim()).filter(Boolean) } : {}),
      ...(s.documents?.length ? { documents: s.documents.map((l) => l.trim()).filter(Boolean) } : {}),
      ...(s.icon ? { icon: s.icon } : {}),
    }));
  }
  const hide = [...new Set(hidden)];
  if (hide.length) out.hidden = hide;
  const lines = Object.fromEntries(Object.entries(blurbs).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  if (Object.keys(lines).length) out.blurbs = lines;
  return out;
}

/** Every category staff can set a menu line for: the website's own, then any new ones from services they added. */
export function categoryList(custom: CustomService[]): { category: string; desc: string; added: boolean }[] {
  const list = BUILT_IN_CATEGORIES.map((c) => ({ category: c.category, desc: c.desc, added: false }));
  for (const s of custom) {
    const c = s.category.trim();
    if (c && !list.some((x) => x.category === c)) list.push({ category: c, desc: "", added: true });
  }
  return list;
}
