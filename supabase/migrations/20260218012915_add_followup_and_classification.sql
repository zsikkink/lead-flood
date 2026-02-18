-- CreateEnum
CREATE TYPE "ReplyClassification" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'OUT_OF_OFFICE', 'UNSUBSCRIBE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'messaged';
ALTER TYPE "LeadStatus" ADD VALUE 'replied';
ALTER TYPE "LeadStatus" ADD VALUE 'cold';

-- AlterTable
ALTER TABLE "FeedbackEvent" ADD COLUMN     "replyClassification" "ReplyClassification",
ADD COLUMN     "replyText" TEXT;

-- AlterTable
ALTER TABLE "IcpProfile" ADD COLUMN     "featureList" JSONB;

-- AlterTable
ALTER TABLE "MessageDraft" ADD COLUMN     "followUpNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentMessageSendId" TEXT,
ADD COLUMN     "pitchedFeature" TEXT;

-- AlterTable
ALTER TABLE "MessageSend" ADD COLUMN     "followUpNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextFollowUpAfter" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FeedbackEvent_leadId_eventType_idx" ON "FeedbackEvent"("leadId", "eventType");

-- CreateIndex
CREATE INDEX "MessageSend_status_followUpNumber_nextFollowUpAfter_idx" ON "MessageSend"("status", "followUpNumber", "nextFollowUpAfter");
