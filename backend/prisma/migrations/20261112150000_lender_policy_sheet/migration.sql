-- CreateTable
CREATE TABLE "LenderPolicySheet" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderPolicySheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LenderPolicySheet_lenderId_key" ON "LenderPolicySheet"("lenderId");

-- AddForeignKey
ALTER TABLE "LenderPolicySheet" ADD CONSTRAINT "LenderPolicySheet_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
