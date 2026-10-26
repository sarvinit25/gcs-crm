-- Mahesh, 26 Oct 2026: two new products. Micro Business Loan goes under Business Growth, and Micro Loan Against
-- Property (Micro LAP) under Property Finance. Both appear in the loan-type picker, the lender-policy products
-- (so lender matching can use them) and the checklist downloads. Mirrors prisma/seed.ts.
INSERT INTO "LoanProduct" ("id", "name", "slug", "category", "active", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'Micro Business Loan', 'micro-business-loan', 'Business Growth', true, 25),
  (gen_random_uuid()::text, 'Micro Loan Against Property (Micro LAP)', 'micro-lap', 'Property Finance', true, 26)
ON CONFLICT ("slug") DO NOTHING;
UPDATE "LoanProduct" SET "icon" = 'briefcase', "color" = '#5C67F7', "secured" = false WHERE "slug" = 'micro-business-loan' AND "icon" IS NULL;
UPDATE "LoanProduct" SET "icon" = 'building', "color" = '#845ADF', "secured" = true WHERE "slug" = 'micro-lap' AND "icon" IS NULL;

INSERT INTO "ChecklistDocument" ("id", "title", "productSlug", "variant", "fileUrl", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid()::text, 'Micro Business Loan', 'micro-business-loan', NULL, '/checklists/micro-business-loan-checklist.pdf', 200, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistDocument" WHERE "productSlug" = 'micro-business-loan');
INSERT INTO "ChecklistDocument" ("id", "title", "productSlug", "variant", "fileUrl", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid()::text, 'Micro Loan Against Property (Micro LAP)', 'micro-lap', NULL, '/checklists/micro-lap-checklist.pdf', 201, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistDocument" WHERE "productSlug" = 'micro-lap');
