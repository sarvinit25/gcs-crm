-- Fields for importing the old calling workbook (docs/DATA-MIGRATION.md). Additive only: new nullable columns and one
-- flag that defaults to false, so every existing row is untouched.
ALTER TABLE "Lead" ADD COLUMN "companyName" TEXT,
ADD COLUMN "legacyRef" TEXT,
ADD COLUMN "importBatch" TEXT,
ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Application" ADD COLUMN "importBatch" TEXT;

CREATE INDEX "Lead_importBatch_idx" ON "Lead"("importBatch");
CREATE INDEX "Lead_legacyRef_idx" ON "Lead"("legacyRef");
CREATE INDEX "Application_importBatch_idx" ON "Application"("importBatch");
