-- CreateTable
CREATE TABLE "VoiceCall" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callId" TEXT,
    "phone" TEXT,
    "status" TEXT,
    "durationSec" INTEGER,
    "outcome" TEXT NOT NULL,
    "leadId" TEXT,
    "error" TEXT,
    "summary" TEXT,
    "transcript" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "VoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceCall_callId_key" ON "VoiceCall"("callId");

-- CreateIndex
CREATE INDEX "VoiceCall_receivedAt_idx" ON "VoiceCall"("receivedAt");

-- CreateIndex
CREATE INDEX "VoiceCall_phone_idx" ON "VoiceCall"("phone");

-- CreateIndex
CREATE INDEX "VoiceCall_leadId_idx" ON "VoiceCall"("leadId");
