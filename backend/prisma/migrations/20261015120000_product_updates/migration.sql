-- Product names and categories as the team asked on 15 Oct 2026, plus two new products.
-- Mirrors the website's product list (src/data/products.ts) and prisma/seed.ts.
UPDATE "LoanProduct" SET "name" = 'Balance Transfer & Top-Up' WHERE "slug" = 'balance-transfer';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade' WHERE "slug" = 'cgtmse';
UPDATE "LoanProduct" SET "category" = 'Property Finance' WHERE "slug" = 'project-funding';
UPDATE "LoanProduct" SET "category" = 'Business Growth' WHERE "slug" IN ('professional-loan', 'private-funding');

INSERT INTO "LoanProduct" ("id", "name", "slug", "category", "active", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'Machine Loan', 'machine-loan', 'Cash Flow & Trade', true, 25),
  (gen_random_uuid()::text, 'Commercial Vehicle', 'commercial-vehicle', 'Vehicles & Special Cases', true, 26)
ON CONFLICT ("slug") DO NOTHING;
