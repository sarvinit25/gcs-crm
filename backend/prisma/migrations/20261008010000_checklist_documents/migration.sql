-- CreateTable
CREATE TABLE "ChecklistDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productSlug" TEXT,
    "variant" TEXT,
    "fileUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistDocument_productSlug_idx" ON "ChecklistDocument"("productSlug");
