-- CreateTable
CREATE TABLE "SiteContentVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedByName" TEXT,

    CONSTRAINT "SiteContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteContentVersion_key_savedAt_idx" ON "SiteContentVersion"("key", "savedAt");
