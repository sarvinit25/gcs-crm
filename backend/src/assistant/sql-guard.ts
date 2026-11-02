// The assistant may write one read-only SELECT over the `ai_*` views, and nothing else. The views hold only what
// staff may ask about and apply each person's row limits; this check keeps the model to them. Even if it were
// fooled, the query runs in a read-only transaction with a short time limit.

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|set|reset|vacuum|listen|notify|lock|prepare|declare|fetch|pg_\w+|dblink|lo_\w+|information_schema|current_setting|set_config|txid_\w+)\b/i;

export const MAX_ROWS = 100;

/** Returns the cleaned query, or a message saying why it was refused. */
export function checkQuery(raw: string): { sql: string } | { error: string } {
  let sql = raw.trim().replace(/;+\s*$/, "").trim();
  if (!sql) return { error: "The query is empty." };
  if (sql.length > 3000) return { error: "The query is too long." };
  if (/;/.test(sql)) return { error: "Only one query at a time." };
  if (/--|\/\*|\*\/|\$\$|"/.test(sql)) return { error: "Comments and quoted names are not allowed. Use plain ai_ view and column names." };
  if (!/^(select|with)\b/i.test(sql)) return { error: "Only SELECT queries are allowed." };
  if (FORBIDDEN.test(sql.replace(/'[^']*'/g, "''"))) return { error: "That query uses something that is not allowed. Use only SELECT over the ai_ views." };

  const sources = [...sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/gi)].map((m) => m[1]!.toLowerCase());
  if (sources.length === 0) return { error: "Query a view such as ai_leads." };
  // A name the query defines itself (WITH x AS (...)) is its own result, not a table.
  const own = new Set([...sql.matchAll(/\b([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) => m[1]!.toLowerCase()));
  const bad = sources.find((s) => !own.has(s) && (!s.startsWith("ai_") || s.includes(".")));
  if (bad) return { error: `"${bad}" is not available. Only the ai_ views can be queried.` };

  sql = sql.replace(/\s+/g, " ");
  return { sql };
}

/** What the model is told about the views, so it writes correct queries. */
export const VIEW_CATALOG = `Views you can query (PostgreSQL SELECT only, no quotes around names):
ai_leads(lead_no, name, phone, email, city, status, source, channel, campaign, amount, loan_product, officer, manager, sourcing_partner, next_follow_up_at, employment_type, monthly_income, segment, lost_reason, documents_status, created_at, archived, notes)
  status is one of NEW, CONTACTED, QUALIFIED, DOCS_PENDING, CONVERTED, LOST. archived is true for closed-out files.
ai_lead_answers(lead_no, question, answer, stage, updated_at)  what the person answered on the website forms
ai_follow_ups(lead_no, by_staff, note, due_at, done_at, created_at)
ai_applications(application_seq, year, status, loan_product, lender, owner, requested_amount, tenure_months, purpose, bank_login_at, bank_reference_no, created_at, archived, lead_no, sanctioned_amount, sanction_interest_rate, sanction_valid_till, disbursed_amount)
  status is one of DRAFT, SUBMITTED, BANK_LOGIN, UNDER_REVIEW, SANCTIONED, DISBURSED, REJECTED, WITHDRAWN.
ai_applicants(application_seq, name, is_primary, relation, phone, email, city, employment_type, employer_name, monthly_income, cibil_score, is_nri)
ai_disbursements(application_seq, type, amount, disbursed_at, interest_rate, processing_fee)
ai_commissions(application_seq, gross_rate, gross_amount, status, received_at, disbursed_at)  status PENDING, PARTIAL or PAID; managers and admins only
ai_partners(code, name, firm, phone, city, commission_rate, active, manager, created_at, lead_count)  managers and admins only
ai_partner_signups(signup_no, kind, name, phone, city, organisation, volume, status, created_at)  managers and admins only
ai_lenders(name, type, short_name, default_commission, branch_city, active)
ai_loan_products(name, category, code, secured, min_amount, max_amount, active)
ai_staff(name, role, designation, active, team)
Money columns are in rupees. Dates are timestamps; use date_trunc, now() and interval for "this week" or "last 30 days". Count with COUNT(*), group with GROUP BY, sort with ORDER BY. Results are cut to ${MAX_ROWS} rows, so aggregate where you can.`;
