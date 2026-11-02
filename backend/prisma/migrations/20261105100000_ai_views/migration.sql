-- Read-only views for the CRM's AI assistant. They hold only what staff may ask about: no identity numbers (PAN,
-- Aadhaar, date of birth), no bank account details, no passwords or tokens. Each view shows only the rows the
-- signed-in person may see: the assistant sets app.officer_id for an advisor (so they see their own files only),
-- and leaves it empty for managers and admins. Money and partner views are empty for advisors.

CREATE OR REPLACE VIEW ai_leads AS
SELECT
  l."leadNo" AS lead_no, l.name, l.phone, l.email, l.city, l.status::text AS status, l.source, l.channel, l.campaign,
  l.amount, lp.name AS loan_product, ou.name AS officer, mu.name AS manager, sp.name AS sourcing_partner,
  l."nextFollowUpAt" AS next_follow_up_at, l."employmentType"::text AS employment_type, l."monthlyIncome" AS monthly_income,
  l.segment::text AS segment, l."lostReason" AS lost_reason, l."documentsStatus"::text AS documents_status,
  l."createdAt" AS created_at, (l."archivedAt" IS NOT NULL) AS archived, l.notes
FROM "Lead" l
LEFT JOIN "LoanProduct" lp ON lp.id = l."loanProductId"
LEFT JOIN "User" ou ON ou.id = l."assignedOfficerId"
LEFT JOIN "User" mu ON mu.id = l."assignedManagerId"
LEFT JOIN "SourcingPartner" sp ON sp.id = l."sourcingPartnerId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR l."assignedOfficerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_lead_answers AS
SELECT l."leadNo" AS lead_no, a.label AS question, a.value AS answer, a.stage, a."updatedAt" AS updated_at
FROM "LeadAnswer" a
JOIN "Lead" l ON l.id = a."leadId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR l."assignedOfficerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_follow_ups AS
SELECT l."leadNo" AS lead_no, u.name AS by_staff, f.note, f."dueAt" AS due_at, f."doneAt" AS done_at, f."createdAt" AS created_at
FROM "FollowUp" f
JOIN "Lead" l ON l.id = f."leadId"
JOIN "User" u ON u.id = f."userId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR l."assignedOfficerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_applications AS
SELECT
  a.seq AS application_seq, EXTRACT(YEAR FROM a."createdAt")::int AS year, a.status::text AS status,
  lp.name AS loan_product, ld.name AS lender, ow.name AS owner, a."requestedAmount" AS requested_amount,
  a."tenureMonths" AS tenure_months, a.purpose, a."bankLoginAt" AS bank_login_at, a."bankReferenceNo" AS bank_reference_no,
  a."createdAt" AS created_at, (a."archivedAt" IS NOT NULL) AS archived, l."leadNo" AS lead_no,
  s."sanctionedAmount" AS sanctioned_amount, s."interestRate" AS sanction_interest_rate, s."validTill" AS sanction_valid_till,
  (SELECT COALESCE(SUM(d.amount), 0) FROM "Disbursement" d WHERE d."applicationId" = a.id) AS disbursed_amount
FROM "Application" a
LEFT JOIN "LoanProduct" lp ON lp.id = a."loanProductId"
LEFT JOIN "Lender" ld ON ld.id = a."lenderId"
LEFT JOIN "User" ow ON ow.id = a."ownerId"
LEFT JOIN "Lead" l ON l.id = a."leadId"
LEFT JOIN "Sanction" s ON s."applicationId" = a.id
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR a."ownerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_applicants AS
SELECT
  a.seq AS application_seq, p.name, p."isPrimary" AS is_primary, p.relation, p.phone, p.email, p.city,
  p."employmentType"::text AS employment_type, p."employerName" AS employer_name, p."monthlyIncome" AS monthly_income,
  p."cibilScore" AS cibil_score, p."isNRI" AS is_nri
FROM "Applicant" p
JOIN "Application" a ON a.id = p."applicationId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR a."ownerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_disbursements AS
SELECT
  a.seq AS application_seq, d.type::text AS type, d.amount, d."disbursedAt" AS disbursed_at,
  d."interestRate" AS interest_rate, d."processingFee" AS processing_fee
FROM "Disbursement" d
JOIN "Application" a ON a.id = d."applicationId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '' OR a."ownerId" = current_setting('app.officer_id', true);

CREATE OR REPLACE VIEW ai_commissions AS
SELECT a.seq AS application_seq, c."grossRate" AS gross_rate, c."grossAmount" AS gross_amount, c.status::text AS status,
  c."receivedAt" AS received_at, d."disbursedAt" AS disbursed_at
FROM "Commission" c
JOIN "Disbursement" d ON d.id = c."disbursementId"
JOIN "Application" a ON a.id = d."applicationId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '';

CREATE OR REPLACE VIEW ai_partners AS
SELECT
  sp.code, sp.name, sp.firm, sp.phone, sp.city, sp."commissionRate" AS commission_rate, sp.active,
  mg.name AS manager, sp."createdAt" AS created_at,
  (SELECT COUNT(*) FROM "Lead" l WHERE l."sourcingPartnerId" = sp.id) AS lead_count
FROM "SourcingPartner" sp
LEFT JOIN "User" mg ON mg.id = sp."managerId"
WHERE COALESCE(current_setting('app.officer_id', true), '') = '';

CREATE OR REPLACE VIEW ai_partner_signups AS
SELECT p."applicationNo" AS signup_no, p.kind, p.name, p.phone, p.city, p.organisation, p.volume, p.status::text AS status, p."createdAt" AS created_at
FROM "PartnerApplication" p
WHERE COALESCE(current_setting('app.officer_id', true), '') = '';

CREATE OR REPLACE VIEW ai_lenders AS
SELECT ld.name, ld.type::text AS type, ld."shortName" AS short_name, ld."defaultCommission" AS default_commission,
  ld."branchCity" AS branch_city, ld.active
FROM "Lender" ld;

CREATE OR REPLACE VIEW ai_loan_products AS
SELECT lp.name, lp.category, lp.code, lp.secured, lp."minAmount" AS min_amount, lp."maxAmount" AS max_amount, lp.active
FROM "LoanProduct" lp;

CREATE OR REPLACE VIEW ai_staff AS
SELECT u.name, u.role::text AS role, u.designation, u.active, t.name AS team
FROM "User" u
LEFT JOIN "Team" t ON t.id = u."teamId";
