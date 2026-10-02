-- CreateTable
CREATE TABLE "LenderContact" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "segments" TEXT[],
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LenderContact_lenderId_idx" ON "LenderContact"("lenderId");

-- AddForeignKey
ALTER TABLE "LenderContact" ADD CONSTRAINT "LenderContact_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
