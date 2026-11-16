-- The customer's answers to the extra loan-profile questions on their form, held until they send it in.
ALTER TABLE "ApplicationInvite" ADD COLUMN "profileDraft" JSONB;
