-- The website chat sign-in code is now also emailed, so the visitor's address is kept with the code
-- and goes onto their lead once the code is confirmed.
ALTER TABLE "ChatOtp" ADD COLUMN "email" TEXT;
