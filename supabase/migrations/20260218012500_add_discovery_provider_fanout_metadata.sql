-- AlterEnum
DO $$
BEGIN
    ALTER TYPE "DiscoveryProvider" ADD VALUE 'BRAVE_SEARCH';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TYPE "DiscoveryProvider" ADD VALUE 'GOOGLE_PLACES';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "LeadDiscoveryRecord"
    ADD COLUMN IF NOT EXISTS "providerSource" TEXT,
    ADD COLUMN IF NOT EXISTS "providerConfidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "provenanceJson" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadDiscoveryRecord_provider_providerSource_idx"
ON "LeadDiscoveryRecord"("provider", "providerSource");
