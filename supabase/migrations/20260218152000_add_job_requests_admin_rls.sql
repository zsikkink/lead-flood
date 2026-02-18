-- Admin principals table (auth user IDs allowed to use discovery console + job requests)
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Request queue enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_request_type') THEN
    CREATE TYPE "job_request_type" AS ENUM ('DISCOVERY_SEED', 'DISCOVERY_RUN');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_request_status') THEN
    CREATE TYPE "job_request_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');
  END IF;
END
$$;

-- Job requests table consumed by worker dispatcher
CREATE TABLE IF NOT EXISTS public.job_requests (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  request_type "job_request_type" NOT NULL,
  status "job_request_status" NOT NULL DEFAULT 'PENDING',
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_text TEXT,
  job_run_id TEXT REFERENCES public.job_runs(id) ON DELETE SET NULL ON UPDATE CASCADE,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS job_requests_status_created_at_idx
  ON public.job_requests(status, created_at);

CREATE INDEX IF NOT EXISTS job_requests_request_type_status_idx
  ON public.job_requests(request_type, status);

CREATE UNIQUE INDEX IF NOT EXISTS job_requests_idempotency_key_unique_idx
  ON public.job_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.set_job_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_requests_set_updated_at ON public.job_requests;
CREATE TRIGGER job_requests_set_updated_at
BEFORE UPDATE ON public.job_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_job_requests_updated_at();

-- Reusable admin predicate for RLS policies
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_admins a
    WHERE a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Admin-only access on principal list
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_admins_admin_select ON public.app_admins;
CREATE POLICY app_admins_admin_select
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

-- Admin-only read/insert on job requests
ALTER TABLE public.job_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_requests_admin_select ON public.job_requests;
CREATE POLICY job_requests_admin_select
  ON public.job_requests
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS job_requests_admin_insert ON public.job_requests;
CREATE POLICY job_requests_admin_insert
  ON public.job_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin() AND requested_by = auth.uid());

-- Discovery dashboard tables are read-only to authenticated admins
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS businesses_admin_select ON public.businesses;
CREATE POLICY businesses_admin_select
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

ALTER TABLE public.business_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_evidence_admin_select ON public.business_evidence;
CREATE POLICY business_evidence_admin_select
  ON public.business_evidence
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

ALTER TABLE public.search_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_tasks_admin_select ON public.search_tasks;
CREATE POLICY search_tasks_admin_select
  ON public.search_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_runs_admin_select ON public.job_runs;
CREATE POLICY job_runs_admin_select
  ON public.job_runs
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sources_admin_select ON public.sources;
CREATE POLICY sources_admin_select
  ON public.sources
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());
