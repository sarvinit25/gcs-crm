-- Some document types were imported with whole paragraphs from the website PDFs (a footer with the office
-- address, an eligibility box, "send clear photos on WhatsApp…") instead of one document each. Tidy them.

UPDATE "DocumentType" SET "name" = 'Foreclosure letter'
WHERE "name" LIKE 'Foreclosure letter Send clear photos%';

-- One long row held two documents: keep the first, add the second for the same loan types.
INSERT INTO "DocumentType" ("id", "name", "category", "applicantTypes", "sortOrder", "active", "updatedAt")
SELECT 'dt_' || md5('Confirmation that the securities are on the lender''s approved list|' || "category"),
       'Confirmation that the securities are on the lender''s approved list', "category", "applicantTypes", "sortOrder" + 1, "active", CURRENT_TIMESTAMP
FROM "DocumentType" WHERE "name" LIKE 'Portfolio / policy documents for securities to be pledged Confirmation%'
ON CONFLICT DO NOTHING;

INSERT INTO "_DocumentTypeToLoanProduct" ("A", "B")
SELECT 'dt_' || md5('Confirmation that the securities are on the lender''s approved list|' || d."category"), l."B"
FROM "DocumentType" d JOIN "_DocumentTypeToLoanProduct" l ON l."A" = d."id"
WHERE d."name" LIKE 'Portfolio / policy documents for securities to be pledged Confirmation%'
ON CONFLICT DO NOTHING;

UPDATE "DocumentType" SET "name" = 'Portfolio / policy documents for securities to be pledged'
WHERE "name" LIKE 'Portfolio / policy documents for securities to be pledged Confirmation%';

-- Private Funding: the pasted boxes become real documents, and the page footer is dropped.
UPDATE "DocumentType" SET "name" = 'Property papers — agreement, title chain and tax receipts' WHERE "name" LIKE 'Documents You''ll Need [ ]%';
UPDATE "DocumentType" SET "name" = 'Ownership papers ready for legal verification' WHERE "name" LIKE 'Basic Eligibility%';
UPDATE "DocumentType" SET "name" = 'Purpose note and repayment plan' WHERE "name" LIKE 'Figures above are indicative%';
DELETE FROM "DocumentType" WHERE "name" LIKE 'Ready when you are.%';
