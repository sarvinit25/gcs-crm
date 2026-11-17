-- A lender policy can list its named programs, and the conditions that are not amounts or rates.
ALTER TABLE "LenderPolicy" ADD COLUMN "programs" JSONB;
ALTER TABLE "LenderPolicy" ADD COLUMN "conditions" JSONB;
