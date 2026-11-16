-- Testimonials clients send from the public form, waiting for staff to approve them.
CREATE TABLE "TestimonialSubmission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "product" TEXT,
    "role" TEXT,
    "contact" TEXT,
    "rating" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "consentWords" BOOLEAN NOT NULL,
    "consentPhoto" BOOLEAN NOT NULL DEFAULT false,
    "signedName" TEXT NOT NULL,
    "photoMime" TEXT,
    "photoData" BYTEA,
    "ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestimonialSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestimonialSubmission_status_createdAt_idx" ON "TestimonialSubmission"("status", "createdAt");
