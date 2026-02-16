-- CreateTable
CREATE TABLE "AnalyticsDailyRollup" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "enrichedCount" INTEGER NOT NULL DEFAULT 0,
    "scoredCount" INTEGER NOT NULL DEFAULT 0,
    "validEmailCount" INTEGER NOT NULL DEFAULT 0,
    "validDomainCount" INTEGER NOT NULL DEFAULT 0,
    "industryMatchRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geoMatchRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsDailyRollup_day_idx" ON "AnalyticsDailyRollup"("day");

-- CreateIndex
CREATE INDEX "AnalyticsDailyRollup_icpProfileId_day_idx" ON "AnalyticsDailyRollup"("icpProfileId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyRollup_day_icpProfileId_key" ON "AnalyticsDailyRollup"("day", "icpProfileId");

-- AddForeignKey
ALTER TABLE "AnalyticsDailyRollup" ADD CONSTRAINT "AnalyticsDailyRollup_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
