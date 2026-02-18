-- CreateEnum
CREATE TYPE "QualificationRuleType" AS ENUM ('WEIGHTED', 'HARD_FILTER');

-- CreateEnum
CREATE TYPE "QualificationOperator" AS ENUM ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'NOT_IN', 'CONTAINS');

-- CreateEnum
CREATE TYPE "DiscoveryProvider" AS ENUM ('GOOGLE_SEARCH', 'LINKEDIN_SCRAPE', 'COMPANY_SEARCH_FREE', 'APOLLO');

-- CreateEnum
CREATE TYPE "DiscoveryRecordStatus" AS ENUM ('DISCOVERED', 'DUPLICATE', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "EnrichmentProvider" AS ENUM ('HUNTER', 'CLEARBIT', 'OTHER_FREE', 'PEOPLE_DATA_LABS');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'FEEDBACK_THRESHOLD');

-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('LOGISTIC_REGRESSION');

-- CreateEnum
CREATE TYPE "ModelStage" AS ENUM ('SHADOW', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvaluationSplit" AS ENUM ('TRAIN', 'VALIDATION', 'TEST');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "IcpProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCompanySize" INTEGER,
    "maxCompanySize" INTEGER,
    "requiredTechnologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcpProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationRule" (
    "id" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" "QualificationRuleType" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "operator" "QualificationOperator" NOT NULL,
    "valueJson" JSONB NOT NULL,
    "weight" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDiscoveryRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "provider" "DiscoveryProvider" NOT NULL,
    "providerRecordId" TEXT NOT NULL,
    "providerCursor" TEXT,
    "queryHash" TEXT NOT NULL,
    "status" "DiscoveryRecordStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rawPayload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDiscoveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEnrichmentRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" "EnrichmentProvider" NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "providerRecordId" TEXT,
    "normalizedPayload" JSONB,
    "rawPayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadEnrichmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "discoveryRecordId" TEXT,
    "enrichmentRecordId" TEXT,
    "snapshotVersion" INTEGER NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "featureVectorHash" TEXT NOT NULL,
    "featuresJson" JSONB NOT NULL,
    "ruleMatchCount" INTEGER NOT NULL DEFAULT 0,
    "hardFilterPassed" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRun" (
    "id" TEXT NOT NULL,
    "modelType" "ModelType" NOT NULL DEFAULT 'LOGISTIC_REGRESSION',
    "status" "TrainingRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "TrainingTrigger" NOT NULL,
    "triggeredByUserId" TEXT,
    "configJson" JSONB NOT NULL,
    "trainingWindowStart" TIMESTAMP(3) NOT NULL,
    "trainingWindowEnd" TIMESTAMP(3) NOT NULL,
    "datasetSize" INTEGER NOT NULL DEFAULT 0,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "trainingRunId" TEXT NOT NULL,
    "modelType" "ModelType" NOT NULL DEFAULT 'LOGISTIC_REGRESSION',
    "versionTag" TEXT NOT NULL,
    "stage" "ModelStage" NOT NULL DEFAULT 'SHADOW',
    "featureSchemaJson" JSONB NOT NULL,
    "coefficientsJson" JSONB,
    "intercept" DOUBLE PRECISION,
    "deterministicWeightsJson" JSONB NOT NULL,
    "artifactUri" TEXT,
    "checksum" TEXT NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "trainingRunId" TEXT NOT NULL,
    "split" "EvaluationSplit" NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "positiveRate" DOUBLE PRECISION NOT NULL,
    "auc" DOUBLE PRECISION NOT NULL,
    "prAuc" DOUBLE PRECISION NOT NULL,
    "precision" DOUBLE PRECISION NOT NULL,
    "recall" DOUBLE PRECISION NOT NULL,
    "f1" DOUBLE PRECISION NOT NULL,
    "brierScore" DOUBLE PRECISION NOT NULL,
    "calibrationJson" JSONB,
    "confusionMatrixJson" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScorePrediction" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "featureSnapshotId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "deterministicScore" DOUBLE PRECISION NOT NULL,
    "logisticScore" DOUBLE PRECISION NOT NULL,
    "blendedScore" DOUBLE PRECISION NOT NULL,
    "scoreBand" "ScoreBand" NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "ruleEvaluationJson" JSONB,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScorePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IcpProfile_isActive_idx" ON "IcpProfile"("isActive");

-- CreateIndex
CREATE INDEX "IcpProfile_name_idx" ON "IcpProfile"("name");

-- CreateIndex
CREATE INDEX "QualificationRule_icpProfileId_isActive_priority_idx" ON "QualificationRule"("icpProfileId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "LeadDiscoveryRecord_leadId_discoveredAt_idx" ON "LeadDiscoveryRecord"("leadId", "discoveredAt");

-- CreateIndex
CREATE INDEX "LeadDiscoveryRecord_icpProfileId_discoveredAt_idx" ON "LeadDiscoveryRecord"("icpProfileId", "discoveredAt");

-- CreateIndex
CREATE INDEX "LeadDiscoveryRecord_provider_status_idx" ON "LeadDiscoveryRecord"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadDiscoveryRecord_leadId_icpProfileId_provider_providerRe_key" ON "LeadDiscoveryRecord"("leadId", "icpProfileId", "provider", "providerRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadEnrichmentRecord_requestKey_key" ON "LeadEnrichmentRecord"("requestKey");

-- CreateIndex
CREATE INDEX "LeadEnrichmentRecord_leadId_provider_createdAt_idx" ON "LeadEnrichmentRecord"("leadId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEnrichmentRecord_leadId_provider_status_idx" ON "LeadEnrichmentRecord"("leadId", "provider", "status");

-- CreateIndex
CREATE INDEX "LeadFeatureSnapshot_leadId_icpProfileId_computedAt_idx" ON "LeadFeatureSnapshot"("leadId", "icpProfileId", "computedAt");

-- CreateIndex
CREATE INDEX "LeadFeatureSnapshot_featureVectorHash_idx" ON "LeadFeatureSnapshot"("featureVectorHash");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFeatureSnapshot_leadId_icpProfileId_snapshotVersion_sou_key" ON "LeadFeatureSnapshot"("leadId", "icpProfileId", "snapshotVersion", "sourceVersion", "featureVectorHash");

-- CreateIndex
CREATE INDEX "TrainingRun_status_createdAt_idx" ON "TrainingRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_versionTag_key" ON "ModelVersion"("versionTag");

-- CreateIndex
CREATE INDEX "ModelVersion_modelType_stage_idx" ON "ModelVersion"("modelType", "stage");

-- CreateIndex
CREATE INDEX "ModelEvaluation_modelVersionId_split_idx" ON "ModelEvaluation"("modelVersionId", "split");

-- CreateIndex
CREATE INDEX "ModelEvaluation_trainingRunId_split_idx" ON "ModelEvaluation"("trainingRunId", "split");

-- CreateIndex
CREATE INDEX "LeadScorePrediction_leadId_predictedAt_idx" ON "LeadScorePrediction"("leadId", "predictedAt");

-- CreateIndex
CREATE INDEX "LeadScorePrediction_icpProfileId_predictedAt_idx" ON "LeadScorePrediction"("icpProfileId", "predictedAt");

-- CreateIndex
CREATE INDEX "LeadScorePrediction_modelVersionId_predictedAt_idx" ON "LeadScorePrediction"("modelVersionId", "predictedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScorePrediction_leadId_icpProfileId_featureSnapshotId_m_key" ON "LeadScorePrediction"("leadId", "icpProfileId", "featureSnapshotId", "modelVersionId");

-- AddForeignKey
ALTER TABLE "IcpProfile" ADD CONSTRAINT "IcpProfile_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRule" ADD CONSTRAINT "QualificationRule_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDiscoveryRecord" ADD CONSTRAINT "LeadDiscoveryRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDiscoveryRecord" ADD CONSTRAINT "LeadDiscoveryRecord_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEnrichmentRecord" ADD CONSTRAINT "LeadEnrichmentRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeatureSnapshot" ADD CONSTRAINT "LeadFeatureSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeatureSnapshot" ADD CONSTRAINT "LeadFeatureSnapshot_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeatureSnapshot" ADD CONSTRAINT "LeadFeatureSnapshot_discoveryRecordId_fkey" FOREIGN KEY ("discoveryRecordId") REFERENCES "LeadDiscoveryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeatureSnapshot" ADD CONSTRAINT "LeadFeatureSnapshot_enrichmentRecordId_fkey" FOREIGN KEY ("enrichmentRecordId") REFERENCES "LeadEnrichmentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRun" ADD CONSTRAINT "TrainingRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "TrainingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "TrainingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScorePrediction" ADD CONSTRAINT "LeadScorePrediction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScorePrediction" ADD CONSTRAINT "LeadScorePrediction_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScorePrediction" ADD CONSTRAINT "LeadScorePrediction_featureSnapshotId_fkey" FOREIGN KEY ("featureSnapshotId") REFERENCES "LeadFeatureSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScorePrediction" ADD CONSTRAINT "LeadScorePrediction_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
