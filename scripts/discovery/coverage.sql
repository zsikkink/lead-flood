\echo '============================================================'
\echo 'Discovery Coverage: Overall business website/instagram fields'
\echo '============================================================'
SELECT
  COUNT(*) AS businesses_total,
  COUNT(*) FILTER (WHERE b.website_domain IS NOT NULL) AS with_website_domain,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE b.website_domain IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS website_pct,
  COUNT(*) FILTER (WHERE b.instagram_handle IS NOT NULL) AS with_instagram_handle,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE b.instagram_handle IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS instagram_pct
FROM businesses b;

\echo ''
\echo '============================================================'
\echo 'Discovery Coverage: by task_type (businesses linked via evidence)'
\echo '============================================================'
WITH business_task AS (
  SELECT DISTINCT
    b.id AS business_id,
    st.task_type,
    b.website_domain,
    b.instagram_handle
  FROM businesses b
  LEFT JOIN business_evidence be ON be.business_id = b.id
  LEFT JOIN search_tasks st ON st.id = be.search_task_id
)
SELECT
  COALESCE(task_type::text, 'UNKNOWN') AS task_type,
  COUNT(*) AS businesses,
  COUNT(*) FILTER (WHERE website_domain IS NOT NULL) AS with_website_domain,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE website_domain IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS website_pct,
  COUNT(*) FILTER (WHERE instagram_handle IS NOT NULL) AS with_instagram_handle,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE instagram_handle IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS instagram_pct
FROM business_task
GROUP BY 1
ORDER BY businesses DESC, task_type;

\echo ''
\echo '============================================================'
\echo 'Discovery Coverage: by recent time_bucket + task_type'
\echo '============================================================'
WITH recent_buckets AS (
  SELECT st.time_bucket
  FROM search_tasks st
  GROUP BY st.time_bucket
  ORDER BY MAX(st.created_at) DESC
  LIMIT 5
),
business_bucket AS (
  SELECT DISTINCT
    b.id AS business_id,
    st.time_bucket,
    st.task_type,
    b.website_domain,
    b.instagram_handle
  FROM businesses b
  JOIN business_evidence be ON be.business_id = b.id
  JOIN search_tasks st ON st.id = be.search_task_id
  WHERE st.time_bucket IN (SELECT time_bucket FROM recent_buckets)
)
SELECT
  time_bucket,
  task_type::text AS task_type,
  COUNT(*) AS businesses,
  COUNT(*) FILTER (WHERE website_domain IS NOT NULL) AS with_website_domain,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE website_domain IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS website_pct,
  COUNT(*) FILTER (WHERE instagram_handle IS NOT NULL) AS with_instagram_handle,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE instagram_handle IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS instagram_pct
FROM business_bucket
GROUP BY 1, 2
ORDER BY time_bucket DESC, businesses DESC, task_type;

\echo ''
\echo '============================================================'
\echo 'Top failure modes (task_type/status/error grouped)'
\echo '============================================================'
SELECT
  st.task_type::text AS task_type,
  st.status::text AS status,
  COALESCE(NULLIF(st.error, ''), '(none)') AS error_message,
  COUNT(*) AS task_count
FROM search_tasks st
GROUP BY 1, 2, 3
ORDER BY task_count DESC
LIMIT 25;

\echo ''
\echo '============================================================'
\echo 'Top 10 newest businesses with provenance + parsed fields'
\echo '============================================================'
SELECT
  b.id AS business_id,
  b.name,
  b.country_code,
  b.city,
  b.website_domain,
  b.instagram_handle,
  be.id AS evidence_id,
  be.source_type,
  be.source_url,
  be.created_at AS evidence_created_at,
  st.id AS search_task_id,
  st.task_type::text AS task_type,
  st.query_text,
  st.time_bucket,
  st.language,
  st.city AS task_city,
  st.params_json ->> 'engine' AS engine,
  st.params_json ->> 'q' AS q,
  st.params_json ->> 'location' AS location,
  st.params_json ->> 'gl' AS gl,
  st.params_json ->> 'hl' AS hl,
  st.params_json ->> 'z' AS z,
  st.params_json ->> 'm' AS m,
  st.params_json ->> 'start' AS start,
  st.params_json ->> 'page' AS page
FROM businesses b
LEFT JOIN LATERAL (
  SELECT be_latest.*
  FROM business_evidence be_latest
  WHERE be_latest.business_id = b.id
  ORDER BY be_latest.created_at DESC
  LIMIT 1
) be ON TRUE
LEFT JOIN search_tasks st ON st.id = be.search_task_id
ORDER BY b.created_at DESC
LIMIT 10;

\echo ''
\echo '============================================================'
\echo 'Sample 20 evidence rows where raw_json contains website/instagram-like data'
\echo 'and whether parsed fields captured them'
\echo '============================================================'
SELECT
  be.id AS evidence_id,
  st.task_type::text AS task_type,
  st.time_bucket,
  b.id AS business_id,
  b.name,
  b.website_domain,
  b.instagram_handle,
  (be.raw_json::text ~* 'instagram\\.com/[A-Za-z0-9._-]+') AS raw_has_instagram_url,
  (
    be.raw_json::text ~* '"website"\\s*:'
    OR be.raw_json::text ~* 'https?://[^"[:space:]]+'
    OR be.raw_json::text ~* '\\b[a-z0-9.-]+\\.[a-z]{2,}\\b'
  ) AS raw_has_website_like_data,
  substring(be.raw_json::text from 'https?://[^"[:space:]]+') AS first_url_in_raw
FROM business_evidence be
JOIN businesses b ON b.id = be.business_id
LEFT JOIN search_tasks st ON st.id = be.search_task_id
WHERE
  be.raw_json::text ~* 'instagram\\.com'
  OR be.raw_json::text ~* '"website"\\s*:'
  OR be.raw_json::text ~* 'https?://[^"[:space:]]+'
ORDER BY be.created_at DESC
LIMIT 20;
