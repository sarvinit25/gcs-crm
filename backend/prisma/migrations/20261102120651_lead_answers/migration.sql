-- CreateTable
CREATE TABLE "LeadAnswer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadAnswer_key_value_idx" ON "LeadAnswer"("key", "value");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAnswer_leadId_key_key" ON "LeadAnswer"("leadId", "key");

-- AddForeignKey
ALTER TABLE "LeadAnswer" ADD CONSTRAINT "LeadAnswer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
