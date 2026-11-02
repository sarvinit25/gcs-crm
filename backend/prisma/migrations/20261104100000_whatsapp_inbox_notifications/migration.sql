-- CreateEnum
CREATE TYPE "WhatsAppContactKind" AS ENUM ('CUSTOMER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "WhatsAppSender" AS ENUM ('CUSTOMER', 'STAFF', 'BOT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationTrigger" AS ENUM ('LEAD_CREATED', 'FILE_STAGE_CHANGED', 'FILE_REJECTED', 'SANCTION_APPROVED', 'DISBURSAL_COMPLETED', 'MORNING_BRIEF', 'EVENING_BRIEF');

-- CreateEnum
CREATE TYPE "NotificationRecipient" AS ENUM ('CUSTOMER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "MetaTemplateStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "kind" "WhatsAppContactKind" NOT NULL DEFAULT 'UNKNOWN',
    "leadId" TEXT,
    "applicationId" TEXT,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "sender" "WhatsAppSender" NOT NULL,
    "sentById" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "templateName" TEXT,
    "waMessageId" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trigger" "NotificationTrigger" NOT NULL,
    "recipient" "NotificationRecipient" NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metaStatus" "MetaTemplateStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "metaReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "trigger" "NotificationTrigger" NOT NULL,
    "recipient" "NotificationRecipient" NOT NULL,
    "templateCode" TEXT,
    "toPhone" TEXT,
    "toName" TEXT,
    "status" "NotificationStatus" NOT NULL,
    "reason" TEXT,
    "waMessageId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dayKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_phone_key" ON "WhatsAppConversation"("phone");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_lastMessageAt_idx" ON "WhatsAppConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_leadId_idx" ON "WhatsAppConversation"("leadId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_applicationId_idx" ON "WhatsAppConversation"("applicationId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_needsHuman_idx" ON "WhatsAppConversation"("needsHuman");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_code_key" ON "NotificationTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_trigger_recipient_key" ON "NotificationTemplate"("trigger", "recipient");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_trigger_dayKey_idx" ON "NotificationLog"("trigger", "dayKey");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

