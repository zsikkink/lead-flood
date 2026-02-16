-- CreateEnum
CREATE TYPE "QualificationLogic" AS ENUM ('WEIGHTED');

-- AlterTable
ALTER TABLE "IcpProfile" ADD COLUMN     "metadataJson" JSONB,
ADD COLUMN     "qualificationLogic" "QualificationLogic" NOT NULL DEFAULT 'WEIGHTED';

-- AlterTable
ALTER TABLE "QualificationRule" ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 100;

-- CreateIndex
CREATE INDEX "QualificationRule_icpProfileId_isActive_orderIndex_idx" ON "QualificationRule"("icpProfileId", "isActive", "orderIndex");
