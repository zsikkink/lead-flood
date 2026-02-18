-- CreateEnum
CREATE TYPE "LabelSource" AS ENUM ('FEEDBACK_EVENT', 'COLD_LEAD_TIMEOUT', 'MANUAL');

-- CreateTable
CREATE TABLE "TrainingLabel" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "feedbackEventId" TEXT,
    "label" INTEGER NOT NULL,
    "source" "LabelSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingLabel_createdAt_idx" ON "TrainingLabel"("createdAt");

-- CreateIndex
CREATE INDEX "TrainingLabel_label_idx" ON "TrainingLabel"("label");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLabel_leadId_feedbackEventId_key" ON "TrainingLabel"("leadId", "feedbackEventId");

-- AddForeignKey
ALTER TABLE "TrainingLabel" ADD CONSTRAINT "TrainingLabel_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLabel" ADD CONSTRAINT "TrainingLabel_feedbackEventId_fkey" FOREIGN KEY ("feedbackEventId") REFERENCES "FeedbackEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
