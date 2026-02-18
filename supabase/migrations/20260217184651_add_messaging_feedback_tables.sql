-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "MessageApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "MessageSendStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'REPLIED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SendProvider" AS ENUM ('RESEND');

-- CreateEnum
CREATE TYPE "FeedbackEventType" AS ENUM ('REPLIED', 'MEETING_BOOKED', 'DEAL_WON', 'DEAL_LOST', 'UNSUBSCRIBED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('WEBHOOK', 'MANUAL', 'CRM_IMPORT');

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "scorePredictionId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "generatedByModel" TEXT NOT NULL,
    "groundingKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "groundingContextJson" JSONB,
    "approvalStatus" "MessageApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageVariant" (
    "id" TEXT NOT NULL,
    "messageDraftId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "ctaText" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageSend" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageDraftId" TEXT NOT NULL,
    "messageVariantId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "provider" "SendProvider" NOT NULL DEFAULT 'RESEND',
    "providerMessageId" TEXT,
    "status" "MessageSendStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageSendId" TEXT,
    "eventType" "FeedbackEventType" NOT NULL,
    "source" "FeedbackSource" NOT NULL,
    "providerEventId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payloadJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageDraft_leadId_createdAt_idx" ON "MessageDraft"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageDraft_icpProfileId_createdAt_idx" ON "MessageDraft"("icpProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageDraft_approvalStatus_idx" ON "MessageDraft"("approvalStatus");

-- CreateIndex
CREATE INDEX "MessageVariant_messageDraftId_idx" ON "MessageVariant"("messageDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageSend_idempotencyKey_key" ON "MessageSend"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MessageSend_leadId_createdAt_idx" ON "MessageSend"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageSend_status_idx" ON "MessageSend"("status");

-- CreateIndex
CREATE INDEX "MessageSend_messageDraftId_idx" ON "MessageSend"("messageDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackEvent_dedupeKey_key" ON "FeedbackEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "FeedbackEvent_leadId_occurredAt_idx" ON "FeedbackEvent"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "FeedbackEvent_messageSendId_idx" ON "FeedbackEvent"("messageSendId");

-- CreateIndex
CREATE INDEX "FeedbackEvent_eventType_idx" ON "FeedbackEvent"("eventType");

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_scorePredictionId_fkey" FOREIGN KEY ("scorePredictionId") REFERENCES "LeadScorePrediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageVariant" ADD CONSTRAINT "MessageVariant_messageDraftId_fkey" FOREIGN KEY ("messageDraftId") REFERENCES "MessageDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSend" ADD CONSTRAINT "MessageSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSend" ADD CONSTRAINT "MessageSend_messageDraftId_fkey" FOREIGN KEY ("messageDraftId") REFERENCES "MessageDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSend" ADD CONSTRAINT "MessageSend_messageVariantId_fkey" FOREIGN KEY ("messageVariantId") REFERENCES "MessageVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_messageSendId_fkey" FOREIGN KEY ("messageSendId") REFERENCES "MessageSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
