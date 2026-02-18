-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "MessageSend" ADD COLUMN     "providerConversationId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "MessageSend_providerConversationId_idx" ON "MessageSend"("providerConversationId");
