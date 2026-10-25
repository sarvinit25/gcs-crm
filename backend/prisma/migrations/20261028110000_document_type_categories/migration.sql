-- A page title ("Private Funding Checklist — Fast money…") was imported as if it were a document.
DELETE FROM "DocumentType" WHERE "name" LIKE 'Private Funding Checklist Fast money%';

-- Two words run together by the import.
UPDATE "DocumentType" SET "name" = 'Demat holding statement / latest Consolidated Account Statement (CAS)'
WHERE "name" = 'Demat holding statement Latest Consolidated Account Statement (CAS)';

-- "Loan SOA" was listed twice, once under Business proof and once under Income proof, so a file for
-- both loan types asked for it twice. Keep one, under Sanction letter with the other existing-loan papers,
-- linked to every loan type either copy had.
INSERT INTO "DocumentType" ("id", "name", "category", "applicantTypes", "sortOrder", "active", "updatedAt")
SELECT 'dt_' || md5('Loan SOA — from beginning to latest date|Sanction letter'), 'Loan SOA — from beginning to latest date', 'Sanction letter',
       ARRAY[]::"ChecklistApplicantType"[], min("sortOrder"), bool_or("active"), CURRENT_TIMESTAMP
FROM "DocumentType" WHERE "name" = 'Loan SOA — from beginning to latest date'
HAVING count(*) > 0
ON CONFLICT DO NOTHING;

INSERT INTO "_DocumentTypeToLoanProduct" ("A", "B")
SELECT DISTINCT 'dt_' || md5('Loan SOA — from beginning to latest date|Sanction letter'), l."B"
FROM "DocumentType" d JOIN "_DocumentTypeToLoanProduct" l ON l."A" = d."id"
WHERE d."name" = 'Loan SOA — from beginning to latest date' AND d."category" <> 'Sanction letter'
ON CONFLICT DO NOTHING;

DELETE FROM "DocumentType" WHERE "name" = 'Loan SOA — from beginning to latest date' AND "category" <> 'Sanction letter';

-- Foreclosure papers belong with the other existing-loan papers, not under Income proof.
UPDATE "DocumentType" SET "category" = 'Sanction letter'
WHERE "name" IN ('Foreclosure letter', 'LOD (List of Documents) and foreclosure letter') AND "category" = 'Income proof'
  AND NOT EXISTS (SELECT 1 FROM "DocumentType" x WHERE x."name" = "DocumentType"."name" AND x."category" = 'Sanction letter');
