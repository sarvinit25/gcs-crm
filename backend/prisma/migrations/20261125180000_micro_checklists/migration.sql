-- The two micro products have checklist PDFs on the website but were never listed in the CRM's website checklists.
INSERT INTO "ChecklistDocument" ("id", "title", "productSlug", "variant", "fileUrl", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid()::text, 'Micro Business Loan', 'micro-business-loan', NULL, '/checklists/micro-business-loan-checklist.pdf', 200, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistDocument" WHERE "productSlug" = 'micro-business-loan');
INSERT INTO "ChecklistDocument" ("id", "title", "productSlug", "variant", "fileUrl", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid()::text, 'Micro Loan Against Property', 'micro-lap', NULL, '/checklists/micro-lap-checklist.pdf', 201, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistDocument" WHERE "productSlug" = 'micro-lap');
