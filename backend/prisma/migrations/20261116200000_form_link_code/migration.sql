-- A one-time code, emailed to the applicant, that must be entered before the application form link opens.
ALTER TABLE "ApplicationInvite" ADD COLUMN "otpHash" TEXT;
ALTER TABLE "ApplicationInvite" ADD COLUMN "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "ApplicationInvite" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApplicationInvite" ADD COLUMN "otpSentAt" TIMESTAMP(3);
