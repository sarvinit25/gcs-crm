-- Mahesh, 16 Oct 2026: Personal, Education, Vehicle and Other Loans become one category in a set order,
-- and Loan Against Mutual Funds is merged into Loan Against Securities (kept, but switched off, so
-- older leads and applications that point at it stay intact). Mirrors prisma/seed.ts.
UPDATE "LoanProduct" SET "category" = 'Personal, Education, Vehicle & Other Loans' WHERE "slug" IN ('personal-loan', 'education-loan', 'new-car-loan', 'used-car-loan', 'car-refinance', 'commercial-vehicle', 'loan-against-securities');
UPDATE "LoanProduct" SET "active" = false WHERE "slug" = 'loan-against-mutual-funds';
UPDATE "LoanProduct" SET "sortOrder" = 0 WHERE "slug" = 'home-loan';
UPDATE "LoanProduct" SET "sortOrder" = 1 WHERE "slug" = 'loan-against-property';
UPDATE "LoanProduct" SET "sortOrder" = 2 WHERE "slug" = 'lease-rental-discounting';
UPDATE "LoanProduct" SET "sortOrder" = 3 WHERE "slug" = 'balance-transfer';
UPDATE "LoanProduct" SET "sortOrder" = 4 WHERE "slug" = 'dlod';
UPDATE "LoanProduct" SET "sortOrder" = 5 WHERE "slug" = 'business-loan';
UPDATE "LoanProduct" SET "sortOrder" = 6 WHERE "slug" = 'cgtmse';
UPDATE "LoanProduct" SET "sortOrder" = 7 WHERE "slug" = 'unsecured-term-loan';
UPDATE "LoanProduct" SET "sortOrder" = 8 WHERE "slug" = 'unsecured-dod';
UPDATE "LoanProduct" SET "sortOrder" = 9 WHERE "slug" = 'project-funding';
UPDATE "LoanProduct" SET "sortOrder" = 10 WHERE "slug" = 'working-capital';
UPDATE "LoanProduct" SET "sortOrder" = 11 WHERE "slug" = 'cash-credit';
UPDATE "LoanProduct" SET "sortOrder" = 12 WHERE "slug" = 'overdraft-limit';
UPDATE "LoanProduct" SET "sortOrder" = 13 WHERE "slug" = 'bank-guarantee';
UPDATE "LoanProduct" SET "sortOrder" = 14 WHERE "slug" = 'letter-of-credit';
UPDATE "LoanProduct" SET "sortOrder" = 15 WHERE "slug" = 'working-capital-term-loan';
UPDATE "LoanProduct" SET "sortOrder" = 16 WHERE "slug" = 'machine-loan';
UPDATE "LoanProduct" SET "sortOrder" = 17 WHERE "slug" = 'personal-loan';
UPDATE "LoanProduct" SET "sortOrder" = 18 WHERE "slug" = 'education-loan';
UPDATE "LoanProduct" SET "sortOrder" = 19 WHERE "slug" = 'new-car-loan';
UPDATE "LoanProduct" SET "sortOrder" = 20 WHERE "slug" = 'used-car-loan';
UPDATE "LoanProduct" SET "sortOrder" = 21 WHERE "slug" = 'car-refinance';
UPDATE "LoanProduct" SET "sortOrder" = 22 WHERE "slug" = 'commercial-vehicle';
UPDATE "LoanProduct" SET "sortOrder" = 23 WHERE "slug" = 'loan-against-securities';
UPDATE "LoanProduct" SET "sortOrder" = 24 WHERE "slug" = 'professional-loan';
UPDATE "LoanProduct" SET "sortOrder" = 25 WHERE "slug" = 'private-funding';
