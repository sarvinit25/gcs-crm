-- Recognise the same flyer or message put in twice, and keep a plain-words summary of what adding a reading changed.
ALTER TABLE "LenderOffer" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "LenderOffer" ADD COLUMN "appliedSummary" JSONB;
CREATE INDEX "LenderOffer_contentHash_idx" ON "LenderOffer"("contentHash");
