-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "businesses"
  ADD COLUMN "deterministic_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "score_band" "ScoreBand",
  ADD COLUMN "has_whatsapp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "has_instagram" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accepts_online_payments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "follower_count" INTEGER,
  ADD COLUMN "physical_address_present" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recent_activity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "business_evidence"
  ADD COLUMN "search_task_id" TEXT;

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" "JobRunStatus" NOT NULL,
    "params_json" JSONB NOT NULL,
    "counters_json" JSONB,
    "resource_json" JSONB,
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_score_band_idx" ON "businesses"("score_band");

-- CreateIndex
CREATE INDEX "businesses_deterministic_score_idx" ON "businesses"("deterministic_score");

-- CreateIndex
CREATE INDEX "business_evidence_search_task_id_idx" ON "business_evidence"("search_task_id");

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_status_started_at_idx" ON "job_runs"("status", "started_at");

-- AddForeignKey
ALTER TABLE "business_evidence"
  ADD CONSTRAINT "business_evidence_search_task_id_fkey"
  FOREIGN KEY ("search_task_id")
  REFERENCES "search_tasks"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
