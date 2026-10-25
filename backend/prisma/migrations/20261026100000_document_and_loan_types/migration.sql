-- Loan types get a code, picture, colour, description, collateral flag and usual ticket size.
ALTER TABLE "LoanProduct" ADD COLUMN     "code" TEXT,
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#6B7280',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "maxAmount" DECIMAL(14,2),
ADD COLUMN     "minAmount" DECIMAL(14,2),
ADD COLUMN     "secured" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "LoanProduct_code_key" ON "LoanProduct"("code");

-- Document types: one row per document, with the loan types and applicant profiles it applies to.
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "applicantTypes" "ChecklistApplicantType"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_DocumentTypeToLoanProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DocumentTypeToLoanProduct_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "DocumentType_code_key" ON "DocumentType"("code");
CREATE UNIQUE INDEX "DocumentType_name_category_key" ON "DocumentType"("name", "category");
CREATE INDEX "_DocumentTypeToLoanProduct_B_index" ON "_DocumentTypeToLoanProduct"("B");

ALTER TABLE "_DocumentTypeToLoanProduct" ADD CONSTRAINT "_DocumentTypeToLoanProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_DocumentTypeToLoanProduct" ADD CONSTRAINT "_DocumentTypeToLoanProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "LoanProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the old checklist rows over: one document type per (name, category). A row with no loan type
-- or no applicant profile meant "all", which an empty selection means now.
INSERT INTO "DocumentType" ("id", "name", "category", "applicantTypes", "sortOrder", "active", "updatedAt")
SELECT 'dt_' || md5(label || '|' || category), label, category,
       CASE WHEN bool_or("applicantType" IS NULL) THEN ARRAY[]::"ChecklistApplicantType"[]
            ELSE array_agg(DISTINCT "applicantType") END,
       min("sortOrder"), bool_or(active), CURRENT_TIMESTAMP
FROM "ChecklistItem"
GROUP BY label, category;

INSERT INTO "_DocumentTypeToLoanProduct" ("A", "B")
SELECT DISTINCT 'dt_' || md5(c.label || '|' || c.category), c."loanProductId"
FROM "ChecklistItem" c
WHERE c."loanProductId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ChecklistItem" x
    WHERE x.label = c.label AND x.category = c.category AND x."loanProductId" IS NULL
  );

ALTER TABLE "ChecklistItem" DROP CONSTRAINT "ChecklistItem_loanProductId_fkey";
DROP TABLE "ChecklistItem";

-- Starting codes, pictures, colours and collateral flags for the loan types already in the list.
UPDATE "LoanProduct" SET
  "code" = upper(replace(slug, '-', '_')),
  "color" = CASE
    WHEN category = 'Property Finance' THEN '#845ADF'
    WHEN category = 'Business Growth' THEN '#5C67F7'
    WHEN category = 'Cash Flow & Trade' THEN '#17A2B8'
    WHEN category ILIKE 'Personal%' THEN '#26BF94'
    ELSE '#6B7280' END,
  "icon" = CASE slug
    WHEN 'home-loan' THEN 'home'
    WHEN 'balance-transfer' THEN 'percent'
    WHEN 'loan-against-property' THEN 'building'
    WHEN 'lease-rental-discounting' THEN 'landmark'
    WHEN 'dlod' THEN 'wallet'
    WHEN 'project-funding' THEN 'construction'
    WHEN 'business-loan' THEN 'briefcase'
    WHEN 'unsecured-term-loan' THEN 'banknote'
    WHEN 'cgtmse' THEN 'shield'
    WHEN 'machine-loan' THEN 'factory'
    WHEN 'working-capital-term-loan' THEN 'coins'
    WHEN 'working-capital' THEN 'coins'
    WHEN 'cash-credit' THEN 'wallet'
    WHEN 'overdraft-limit' THEN 'wallet'
    WHEN 'bank-guarantee' THEN 'shield'
    WHEN 'letter-of-credit' THEN 'file'
    WHEN 'bill-discounting' THEN 'receipt'
    WHEN 'unsecured-dod' THEN 'wallet'
    WHEN 'personal-loan' THEN 'user'
    WHEN 'education-loan' THEN 'graduation'
    WHEN 'new-car-loan' THEN 'car'
    WHEN 'used-car-loan' THEN 'car'
    WHEN 'car-refinance' THEN 'car'
    WHEN 'commercial-vehicle' THEN 'truck'
    WHEN 'loan-against-mutual-funds' THEN 'trending'
    WHEN 'loan-against-securities' THEN 'trending'
    WHEN 'professional-loan' THEN 'stethoscope'
    WHEN 'private-funding' THEN 'gem'
    ELSE NULL END,
  "secured" = slug IN (
    'home-loan', 'balance-transfer', 'loan-against-property', 'lease-rental-discounting', 'dlod',
    'project-funding', 'machine-loan', 'new-car-loan', 'used-car-loan', 'car-refinance',
    'commercial-vehicle', 'loan-against-mutual-funds', 'loan-against-securities'
  );
