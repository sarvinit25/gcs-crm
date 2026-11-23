// Staff-defined match fields. A field is a question about the customer (a number, yes/no, a choice or text); a lender policy can
// carry a test on it. The matcher reads the customer's answer, runs each test, and reports a plain reason either way.
// Nothing here is invented: a field with no answer is "unknown", never assumed.

export type FieldType = "NUMBER" | "YESNO" | "CHOICE" | "TEXT";
export const FIELD_TYPES: FieldType[] = ["NUMBER", "YESNO", "CHOICE", "TEXT"];

export type MatchFieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  unit?: string | null;
  /** Loan product slugs it applies to; empty means all. */
  products: string[];
  /** SALARIED / SELF_EMPLOYED; empty means all. */
  applicants: string[];
  mandatory: boolean;
  minValue?: number | null;
  maxValue?: number | null;
  active: boolean;
};

export type CriterionOp = "gte" | "lte" | "eq" | "in" | "yes" | "no";
export type Criterion = { op: CriterionOp; value?: number | string | string[] };
export type Criteria = Record<string, Criterion>;
export type FieldValues = Record<string, string | number | boolean>;

/** Which operators make sense for which field type. */
export const OPS_FOR: Record<FieldType, CriterionOp[]> = {
  NUMBER: ["gte", "lte", "eq"],
  YESNO: ["yes", "no"],
  CHOICE: ["in", "eq"],
  TEXT: ["eq"],
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Turns what a person typed into a usable key: letters, digits and underscores. */
export const fieldKey = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Keeps only tests that name a known field and make sense for its type; drops the rest. */
export function cleanCriteria(raw: unknown, fields: MatchFieldDef[]): Criteria {
  const out: Criteria = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, c] of Object.entries(raw as Record<string, unknown>)) {
    const f = fields.find((x) => x.key === key);
    const o = c as { op?: CriterionOp; value?: unknown };
    if (!f || !o || !OPS_FOR[f.type].includes(o.op as CriterionOp)) continue;
    if (o.op === "yes" || o.op === "no") out[key] = { op: o.op };
    else if (f.type === "NUMBER") {
      const n = Number(o.value);
      if (Number.isFinite(n)) out[key] = { op: o.op as CriterionOp, value: n };
    } else if (o.op === "in") {
      const list = (Array.isArray(o.value) ? o.value : []).map((x) => String(x).trim()).filter(Boolean);
      if (list.length) out[key] = { op: "in", value: list };
    } else if (String(o.value ?? "").trim()) out[key] = { op: "eq", value: String(o.value).trim() };
  }
  return out;
}

/** True when a field is in play for this customer: active, and for this loan type and applicant type. */
export function appliesTo(f: MatchFieldDef, ctx: { product?: string; employmentType?: string }): boolean {
  if (!f.active) return false;
  if (f.products.length && ctx.product && !f.products.includes(ctx.product)) return false;
  if (f.applicants.length && ctx.employmentType && !f.applicants.includes(ctx.employmentType)) return false;
  return true;
}

/** Cleans a customer's answer to the field's type: a number, a yes/no, one of the options, or text. Undefined when unusable. */
export function coerceValue(f: MatchFieldDef, raw: unknown): string | number | boolean | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
  if (f.type === "NUMBER") {
    const n = Number(String(raw).replace(/[,₹\s]/g, ""));
    if (!Number.isFinite(n)) return undefined;
    if (f.minValue != null && n < f.minValue) return undefined;
    if (f.maxValue != null && n > f.maxValue) return undefined;
    return n;
  }
  if (f.type === "YESNO") {
    const t = norm(raw);
    if (["yes", "y", "true", "1"].includes(t)) return true;
    if (["no", "n", "false", "0"].includes(t)) return false;
    return undefined;
  }
  if (f.type === "CHOICE") {
    const hit = f.options.find((o) => norm(o) === norm(raw));
    return hit;
  }
  return String(raw).trim();
}

export type CriterionResult = { ok: boolean | null; text: string };

const rupee = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-IN") : String(n));

/** Tests one customer answer against one condition. ok is null when there is no answer to test. */
export function testCriterion(f: MatchFieldDef, c: Criterion, value: string | number | boolean | undefined): CriterionResult {
  const unit = f.unit ? ` ${f.unit}` : "";
  if (value === undefined) return { ok: null, text: `${f.label} is needed to check this lender.` };
  switch (c.op) {
    case "gte": {
      const need = Number(c.value);
      const ok = Number(value) >= need;
      return { ok, text: ok ? `${f.label} ${rupee(Number(value))}${unit} meets the lender's minimum of ${rupee(need)}${unit}.` : `${f.label} is ${rupee(Number(value))}${unit}, below the lender's minimum of ${rupee(need)}${unit}.` };
    }
    case "lte": {
      const cap = Number(c.value);
      const ok = Number(value) <= cap;
      return { ok, text: ok ? `${f.label} ${rupee(Number(value))}${unit} is within the lender's limit of ${rupee(cap)}${unit}.` : `${f.label} is ${rupee(Number(value))}${unit}, above the lender's limit of ${rupee(cap)}${unit}.` };
    }
    case "yes":
    case "no": {
      const want = c.op === "yes";
      const ok = value === want;
      return { ok, text: ok ? `${f.label}: ${want ? "yes" : "no"}, as this lender requires.` : `This lender requires "${f.label}" to be ${want ? "yes" : "no"}.` };
    }
    case "in": {
      const list = (c.value as string[]) ?? [];
      const ok = list.some((x) => norm(x) === norm(value));
      return { ok, text: ok ? `${f.label} (${value}) is accepted.` : `${f.label} (${value}) is not among what this lender accepts: ${list.join(", ")}.` };
    }
    case "eq": {
      const ok = f.type === "NUMBER" ? Number(value) === Number(c.value) : norm(value) === norm(c.value);
      return { ok, text: ok ? `${f.label} matches the lender's requirement.` : `${f.label} must be ${c.value}.` };
    }
  }
}

type Evaluable = {
  reasons: { code: string; ok: boolean; text: string }[];
  checks: string[];
  status: string;
};

/**
 * Runs every condition a policy has on the staff-defined fields and records the outcome on the match result: a failed one is a
 * reason (and takes the lender out of Strong/Possible), a passed one is a reason, a missing answer is something to check.
 * A condition on a field that does not apply to this customer or loan type is skipped.
 */
export function applyCriteria(
  result: Evaluable,
  criteria: Criteria | null | undefined,
  fields: MatchFieldDef[],
  values: FieldValues | undefined,
  ctx: { product?: string; employmentType?: string },
): void {
  if (!criteria) return;
  for (const [key, c] of Object.entries(criteria)) {
    const f = fields.find((x) => x.key === key);
    if (!f || !appliesTo(f, ctx)) continue;
    const t = testCriterion(f, c, coerceValue(f, values?.[key]));
    if (t.ok === null) {
      result.checks.push(t.text);
      continue;
    }
    result.reasons.push({ code: "FIELD", ok: t.ok, text: t.text });
    if (!t.ok && (result.status === "STRONG" || result.status === "POSSIBLE")) result.status = "EXPERT_REVIEW";
  }
}

/** The mandatory fields that apply to this customer and have no usable answer yet. */
export function missingMandatory(fields: MatchFieldDef[], values: FieldValues | undefined, ctx: { product?: string; employmentType?: string }): MatchFieldDef[] {
  return fields.filter((f) => f.mandatory && appliesTo(f, ctx) && coerceValue(f, values?.[f.key]) === undefined);
}
