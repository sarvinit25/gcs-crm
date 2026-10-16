-- Mahesh, 16 Oct 2026 (second batch): Working Capital and Unsecured Term Loan are folded into Working Capital
-- Term Loan (kept but switched off, so older leads that point at them stay intact), Bill Discounting is added,
-- and the products are put in the order the website shows. Mirrors prisma/seed.ts.
UPDATE "LoanProduct" SET "active" = false WHERE "slug" IN ('working-capital', 'unsecured-term-loan');
INSERT INTO "LoanProduct" ("id", "name", "slug", "category", "active", "sortOrder")
VALUES (gen_random_uuid()::text, 'Bill Discounting', 'bill-discounting', 'Cash Flow & Trade', true, 0)
ON CONFLICT ("slug") DO NOTHING;
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 0 WHERE "slug" = 'home-loan';
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 1 WHERE "slug" = 'loan-against-property';
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 2 WHERE "slug" = 'lease-rental-discounting';
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 3 WHERE "slug" = 'balance-transfer';
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 4 WHERE "slug" = 'dlod';
UPDATE "LoanProduct" SET "category" = 'Business Growth', "sortOrder" = 5 WHERE "slug" = 'business-loan';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 6 WHERE "slug" = 'cgtmse';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 7 WHERE "slug" = 'machine-loan';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 8 WHERE "slug" = 'working-capital-term-loan';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 9 WHERE "slug" = 'cash-credit';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 10 WHERE "slug" = 'overdraft-limit';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 11 WHERE "slug" = 'bank-guarantee';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 12 WHERE "slug" = 'letter-of-credit';
UPDATE "LoanProduct" SET "category" = 'Cash Flow & Trade', "sortOrder" = 13 WHERE "slug" = 'bill-discounting';
UPDATE "LoanProduct" SET "category" = 'Business Growth', "sortOrder" = 14 WHERE "slug" = 'unsecured-dod';
UPDATE "LoanProduct" SET "category" = 'Property Finance', "sortOrder" = 15 WHERE "slug" = 'project-funding';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 16 WHERE "slug" = 'personal-loan';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 17 WHERE "slug" = 'education-loan';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 18 WHERE "slug" = 'new-car-loan';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 19 WHERE "slug" = 'used-car-loan';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 20 WHERE "slug" = 'car-refinance';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 21 WHERE "slug" = 'commercial-vehicle';
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans', "sortOrder" = 22 WHERE "slug" = 'loan-against-securities';
UPDATE "LoanProduct" SET "category" = 'Business Growth', "sortOrder" = 23 WHERE "slug" = 'professional-loan';
UPDATE "LoanProduct" SET "category" = 'Business Growth', "sortOrder" = 24 WHERE "slug" = 'private-funding';
