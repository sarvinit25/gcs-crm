-- CreateTable
CREATE TABLE "SiteImage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT,

    CONSTRAINT "SiteImage_pkey" PRIMARY KEY ("id")
);
