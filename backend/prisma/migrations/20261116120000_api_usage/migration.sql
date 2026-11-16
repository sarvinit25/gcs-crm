-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "status" INTEGER,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiUsage_at_idx" ON "ApiUsage"("at");

-- CreateIndex
CREATE INDEX "ApiUsage_service_at_idx" ON "ApiUsage"("service", "at");
