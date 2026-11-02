-- Payouts recorded before the net amount was stored: net = amount less every deduction.
UPDATE "Disbursement"
SET "netAmount" = "amount"
  - COALESCE("processingFee", 0)
  - COALESCE("insuranceAmount", 0)
  - COALESCE("documentationCharges", 0)
  - COALESCE("stampDuty", 0)
  - COALESCE("otherDeductions", 0)
WHERE "netAmount" IS NULL;
