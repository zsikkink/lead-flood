-- CreateEnum
CREATE TYPE "SearchTaskType" AS ENUM ('SERP_GOOGLE', 'SERP_GOOGLE_LOCAL', 'SERP_MAPS_LOCAL');

-- CreateEnum
CREATE TYPE "SearchTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DiscoverySourceType" AS ENUM ('DIRECTORY', 'SMB_SITE', 'SOCIAL', 'MARKETPLACE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "search_tasks" (
    "id" TEXT NOT NULL,
    "task_type" "SearchTaskType" NOT NULL,
    "country_code" TEXT NOT NULL,
    "city" TEXT,
    "language" TEXT NOT NULL,
    "query_text" TEXT NOT NULL,
    "normalized_query_key" TEXT NOT NULL,
    "query_hash" TEXT NOT NULL,
    "params_json" JSONB NOT NULL,
    "page" INTEGER NOT NULL,
    "time_bucket" TEXT NOT NULL,
    "status" "SearchTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_result_hash" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "type" "DiscoverySourceType" NOT NULL,
    "root_domain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "country_hint" TEXT,
    "discovered_from_task_id" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone_e164" TEXT,
    "website_domain" TEXT,
    "instagram_handle" TEXT,
    "category" TEXT,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_evidence" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "serpapi_result_id" TEXT,
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_tasks_task_type_query_hash_key" ON "search_tasks"("task_type", "query_hash");

-- CreateIndex
CREATE INDEX "search_tasks_status_run_after_idx" ON "search_tasks"("status", "run_after");

-- CreateIndex
CREATE INDEX "search_tasks_country_code_language_time_bucket_idx" ON "search_tasks"("country_code", "language", "time_bucket");

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE INDEX "sources_root_domain_idx" ON "sources"("root_domain");

-- CreateIndex
CREATE INDEX "sources_country_hint_idx" ON "sources"("country_hint");

-- CreateIndex
CREATE INDEX "businesses_country_code_city_idx" ON "businesses"("country_code", "city");

-- CreateIndex
CREATE INDEX "businesses_website_domain_idx" ON "businesses"("website_domain");

-- CreateIndex
CREATE INDEX "businesses_phone_e164_idx" ON "businesses"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_website_domain_unique_not_null_idx"
ON "businesses"("website_domain")
WHERE "website_domain" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_phone_e164_unique_not_null_idx"
ON "businesses"("phone_e164")
WHERE "phone_e164" IS NOT NULL;

-- CreateIndex
CREATE INDEX "business_evidence_business_id_idx" ON "business_evidence"("business_id");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_discovered_from_task_id_fkey" FOREIGN KEY ("discovered_from_task_id") REFERENCES "search_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_evidence" ADD CONSTRAINT "business_evidence_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add check constraints for accepted country and language values.
ALTER TABLE "search_tasks"
  ADD CONSTRAINT "search_tasks_country_code_allowed_chk"
  CHECK ("country_code" IN ('JO', 'SA', 'AE', 'EG'));

ALTER TABLE "search_tasks"
  ADD CONSTRAINT "search_tasks_language_allowed_chk"
  CHECK ("language" IN ('en', 'ar'));

ALTER TABLE "businesses"
  ADD CONSTRAINT "businesses_country_code_allowed_chk"
  CHECK ("country_code" IN ('JO', 'SA', 'AE', 'EG'));
