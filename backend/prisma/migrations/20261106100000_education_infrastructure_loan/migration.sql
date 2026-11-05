-- The website's Education Infrastructure Loan, so enquiries from its page are filed under a loan type.
-- Mirrors the website's product list (src/data/products.ts) and prisma/seed.ts.
INSERT INTO "LoanProduct" ("id", "name", "slug", "category", "icon", "color", "secured", "minAmount", "maxAmount", "active", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'Education Infrastructure Loan', 'education-infrastructure-loan', 'Personal, Education, Vehicle & Other Loans', 'school', '#26BF94', false, 1000000, 100000000, true, 29)
ON CONFLICT ("slug") DO NOTHING;
