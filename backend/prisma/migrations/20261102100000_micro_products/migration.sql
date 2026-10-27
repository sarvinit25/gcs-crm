-- The website's two micro products, so enquiries from their pages are filed under a loan type.
-- Mirrors the website's product list (src/data/products.ts) and prisma/seed.ts.
INSERT INTO "LoanProduct" ("id", "name", "slug", "category", "icon", "color", "secured", "active", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'Micro Loan Against Property', 'micro-lap', 'Property Finance', 'building', '#845ADF', true, true, 27),
  (gen_random_uuid()::text, 'Micro Business Loan', 'micro-business-loan', 'Business Growth', 'briefcase', '#5C67F7', false, true, 28)
ON CONFLICT ("slug") DO NOTHING;
