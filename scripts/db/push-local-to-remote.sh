#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_LOCAL_DATABASE_URL="postgresql://postgres:postgres@localhost:5434/lead_flood"

load_env_file() {
  local env_file="${ENV_FILE:-}"
  if [[ -z "$env_file" ]]; then
    return
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "[db:push:local-to-remote] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:push:local-to-remote] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[db:push:local-to-remote] Missing required command: $cmd" >&2
    exit 1
  fi
}

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "[db:push:local-to-remote] Missing required env var: $key" >&2
    exit 1
  fi
}

validate_table_name() {
  local table="$1"
  if [[ ! "$table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "[db:push:local-to-remote] Invalid table name: $table" >&2
    exit 1
  fi
}

csv_to_file() {
  local raw="$1"
  local out_file="$2"
  : > "$out_file"

  if [[ -z "$raw" ]]; then
    return
  fi

  printf '%s' "$raw" |
    tr ',' '\n' |
    sed 's/^[[:space:]]*//;s/[[:space:]]*$//' |
    sed '/^$/d' |
    sort -u > "$out_file"
}

collect_tables() {
  local db_url="$1"
  local out_file="$2"

  psql "$db_url" -v ON_ERROR_STOP=1 -Atqc \
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY 1" > "$out_file"

  sed '/^$/d' "$out_file" | sort -u > "${out_file}.tmp"
  mv "${out_file}.tmp" "$out_file"
}

collect_counts() {
  local db_url="$1"
  local table_file="$2"
  local out_file="$3"

  : > "$out_file"
  while IFS= read -r table; do
    [[ -z "$table" ]] && continue
    validate_table_name "$table"
    local count
    count="$(psql "$db_url" -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM public.\"$table\";")"
    echo "$table|$count" >> "$out_file"
  done < "$table_file"
}

print_counts() {
  local title="$1"
  local counts_file="$2"

  echo "$title"
  while IFS='|' read -r table count; do
    [[ -z "$table" ]] && continue
    printf '  %-40s %s\n' "$table" "$count"
  done < "$counts_file"
}

get_count_for_table() {
  local table="$1"
  local counts_file="$2"
  awk -F'|' -v t="$table" '$1==t { print $2; found=1 } END { if (!found) print "" }' "$counts_file"
}

reset_sequences_for_tables() {
  local db_url="$1"
  local table_file="$2"

  local in_clause=""
  while IFS= read -r table; do
    [[ -z "$table" ]] && continue
    validate_table_name "$table"
    if [[ -n "$in_clause" ]]; then
      in_clause+=" , "
    fi
    in_clause+="'${table}'"
  done < "$table_file"

  if [[ -z "$in_clause" ]]; then
    return
  fi

  psql "$db_url" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      c.table_name,
      c.column_name,
      pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) AS seq_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN (${in_clause})
  LOOP
    IF r.seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 0) + 1, false);',
        r.seq_name,
        r.column_name,
        r.table_name
      );
    END IF;
  END LOOP;
END
\$\$;
SQL
}

print_sample_if_exists() {
  local db_url="$1"
  local table_file="$2"
  local table_name="$3"
  local query="$4"

  if grep -Fxq "$table_name" "$table_file"; then
    echo "[db:push:local-to-remote] Sample rows from $table_name:"
    psql "$db_url" -v ON_ERROR_STOP=1 -P pager=off -c "$query"
  fi
}

load_env_file

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-$DEFAULT_LOCAL_DATABASE_URL}"
REMOTE_DATABASE_URL="${REMOTE_DATABASE_URL:-}"
TABLES_INCLUDE="${TABLES_INCLUDE:-}"
TABLES_EXCLUDE="${TABLES_EXCLUDE:-}"
CONFIRM_REMOTE_OVERWRITE="${CONFIRM_REMOTE_OVERWRITE:-}"

require_cmd psql
require_cmd pg_dump
require_cmd pg_restore
require_var REMOTE_DATABASE_URL

remote_lower="$(printf '%s' "$REMOTE_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"
if [[ "$remote_lower" != *"sslmode=require"* ]]; then
  echo "[db:push:local-to-remote] REMOTE_DATABASE_URL must include sslmode=require" >&2
  exit 1
fi

echo "[db:push:local-to-remote] Checking local DB connectivity"
if ! psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "[db:push:local-to-remote] Local DB not reachable at LOCAL_DATABASE_URL." >&2
  echo "[db:push:local-to-remote] Default expected local URL: $DEFAULT_LOCAL_DATABASE_URL" >&2
  echo "[db:push:local-to-remote] Set LOCAL_DATABASE_URL explicitly if different." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/push-local-to-remote.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

LOCAL_TABLES_FILE="$TMP_DIR/local_tables.txt"
REMOTE_TABLES_FILE="$TMP_DIR/remote_tables.txt"
MISSING_REMOTE_FILE="$TMP_DIR/missing_remote_tables.txt"
EXTRA_REMOTE_FILE="$TMP_DIR/extra_remote_tables.txt"
INCLUDE_FILE="$TMP_DIR/include.txt"
EXCLUDE_FILE="$TMP_DIR/exclude.txt"
DENYLIST_FILE="$TMP_DIR/default_denylist.txt"
DENYLIST_REMOVED_FILE="$TMP_DIR/denylist_removed.txt"
TARGET_TABLES_FILE="$TMP_DIR/target_tables.txt"
LOCAL_COUNTS_FILE="$TMP_DIR/local_counts.txt"
REMOTE_COUNTS_BEFORE_FILE="$TMP_DIR/remote_counts_before.txt"
REMOTE_COUNTS_AFTER_FILE="$TMP_DIR/remote_counts_after.txt"

collect_tables "$LOCAL_DATABASE_URL" "$LOCAL_TABLES_FILE"

if [[ ! -s "$LOCAL_TABLES_FILE" ]]; then
  echo "[db:push:local-to-remote] No tables found in local public schema." >&2
  exit 1
fi

csv_to_file "$TABLES_INCLUDE" "$INCLUDE_FILE"
csv_to_file "$TABLES_EXCLUDE" "$EXCLUDE_FILE"

if [[ -s "$INCLUDE_FILE" ]]; then
  echo "[db:push:local-to-remote] Scoped migration mode enabled via TABLES_INCLUDE."
  : > "$TARGET_TABLES_FILE"
  while IFS= read -r table; do
    [[ -z "$table" ]] && continue
    validate_table_name "$table"

    if ! grep -Fxq "$table" "$LOCAL_TABLES_FILE"; then
      echo "[db:push:local-to-remote] TABLES_INCLUDE contains table not found locally: $table" >&2
      exit 1
    fi

    echo "$table" >> "$TARGET_TABLES_FILE"
  done < "$INCLUDE_FILE"
  sort -u "$TARGET_TABLES_FILE" -o "$TARGET_TABLES_FILE"
else
  cp "$LOCAL_TABLES_FILE" "$TARGET_TABLES_FILE"
fi

cat > "$DENYLIST_FILE" <<'EOF'
_prisma_migrations
prisma_migrations
EOF

comm -12 "$TARGET_TABLES_FILE" "$DENYLIST_FILE" > "$DENYLIST_REMOVED_FILE" || true
grep -Fxv -f "$DENYLIST_FILE" "$TARGET_TABLES_FILE" > "$TARGET_TABLES_FILE.tmp" || true
mv "$TARGET_TABLES_FILE.tmp" "$TARGET_TABLES_FILE"

if [[ -s "$DENYLIST_REMOVED_FILE" ]]; then
  echo "[db:push:local-to-remote] Removed denylisted tables (not migrated under SQL-first Supabase workflow):"
  sed 's/^/  - /' "$DENYLIST_REMOVED_FILE"
fi

if [[ -s "$EXCLUDE_FILE" ]]; then
  while IFS= read -r table; do
    [[ -z "$table" ]] && continue
    validate_table_name "$table"
  done < "$EXCLUDE_FILE"

  grep -Fxv -f "$EXCLUDE_FILE" "$TARGET_TABLES_FILE" > "$TARGET_TABLES_FILE.tmp" || true
  mv "$TARGET_TABLES_FILE.tmp" "$TARGET_TABLES_FILE"
fi

if [[ ! -s "$TARGET_TABLES_FILE" ]]; then
  echo "[db:push:local-to-remote] No target tables selected after include/denylist/exclude filters." >&2
  exit 1
fi

sort -u "$TARGET_TABLES_FILE" -o "$TARGET_TABLES_FILE"

echo "[db:push:local-to-remote] Final table set:"
sed 's/^/  - /' "$TARGET_TABLES_FILE"

echo "[db:push:local-to-remote] Checking remote DB connectivity"
if ! psql "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "[db:push:local-to-remote] Remote DB not reachable at REMOTE_DATABASE_URL." >&2
  echo "[db:push:local-to-remote] Check credentials/network and confirm sslmode=require is set." >&2
  exit 1
fi

collect_tables "$REMOTE_DATABASE_URL" "$REMOTE_TABLES_FILE"
comm -23 "$TARGET_TABLES_FILE" "$REMOTE_TABLES_FILE" > "$MISSING_REMOTE_FILE" || true
comm -13 "$LOCAL_TABLES_FILE" "$REMOTE_TABLES_FILE" > "$EXTRA_REMOTE_FILE" || true

if [[ -s "$MISSING_REMOTE_FILE" ]]; then
  echo "[db:push:local-to-remote] Remote DB is missing required tables from the final migration set:" >&2
  sed 's/^/  - /' "$MISSING_REMOTE_FILE" >&2
  echo "[db:push:local-to-remote] Next steps:" >&2
  echo "[db:push:local-to-remote]   1) Run pnpm db:migrate:prod" >&2
  echo "[db:push:local-to-remote]   2) Or set TABLES_INCLUDE to only tables that already exist remotely" >&2
  exit 1
fi

if [[ -s "$EXTRA_REMOTE_FILE" ]]; then
  echo "[db:push:local-to-remote] Warning: remote has extra public tables not present locally:" >&2
  sed 's/^/  - /' "$EXTRA_REMOTE_FILE" >&2
fi

collect_counts "$LOCAL_DATABASE_URL" "$TARGET_TABLES_FILE" "$LOCAL_COUNTS_FILE"
collect_counts "$REMOTE_DATABASE_URL" "$TARGET_TABLES_FILE" "$REMOTE_COUNTS_BEFORE_FILE"

echo "[db:push:local-to-remote] Local public tables: $(wc -l < "$LOCAL_TABLES_FILE" | tr -d ' ')"
echo "[db:push:local-to-remote] Remote public tables: $(wc -l < "$REMOTE_TABLES_FILE" | tr -d ' ')"
echo "[db:push:local-to-remote] Target tables for migration: $(wc -l < "$TARGET_TABLES_FILE" | tr -d ' ')"

print_counts "[db:push:local-to-remote] Row counts (local, target tables):" "$LOCAL_COUNTS_FILE"
print_counts "[db:push:local-to-remote] Row counts (remote before, target tables):" "$REMOTE_COUNTS_BEFORE_FILE"

if [[ "$CONFIRM_REMOTE_OVERWRITE" != "1" ]]; then
  echo "[db:push:local-to-remote] Dry run complete. No remote writes were performed."
  echo "[db:push:local-to-remote] To execute migration, run:"
  echo "  CONFIRM_REMOTE_OVERWRITE=1 REMOTE_DATABASE_URL=\"\$REMOTE_DATABASE_URL\" LOCAL_DATABASE_URL=\"\${LOCAL_DATABASE_URL:-$DEFAULT_LOCAL_DATABASE_URL}\" pnpm db:push:local-to-remote"
  if [[ -n "$TABLES_INCLUDE" ]]; then
    echo "[db:push:local-to-remote] Existing TABLES_INCLUDE will be honored: $TABLES_INCLUDE"
  fi
  if [[ -n "$TABLES_EXCLUDE" ]]; then
    echo "[db:push:local-to-remote] Existing TABLES_EXCLUDE will be honored: $TABLES_EXCLUDE"
  fi
  exit 0
fi

echo "[db:push:local-to-remote] CONFIRM_REMOTE_OVERWRITE=1 set. Starting data migration."

DUMP_FILE="$TMP_DIR/local_data.dump"

DUMP_CMD=(
  pg_dump
  --dbname "$LOCAL_DATABASE_URL"
  --format=custom
  --data-only
  --strict-names
  --no-owner
  --no-privileges
  --file "$DUMP_FILE"
)
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  DUMP_CMD+=(--table "public.\"$table\"")
done < "$TARGET_TABLES_FILE"

echo "[db:push:local-to-remote] Creating local data-only dump"
"${DUMP_CMD[@]}"

TRUNCATE_LIST=""
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  validate_table_name "$table"
  if [[ -n "$TRUNCATE_LIST" ]]; then
    TRUNCATE_LIST+=", "
  fi
  TRUNCATE_LIST+="public.\"$table\""
done < "$TARGET_TABLES_FILE"

echo "[db:push:local-to-remote] Truncating target tables on remote"
psql "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE $TRUNCATE_LIST RESTART IDENTITY CASCADE;"

echo "[db:push:local-to-remote] Restoring data into remote"
RESTORE_LOG="$TMP_DIR/pg_restore.log"
if ! pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --data-only --dbname "$REMOTE_DATABASE_URL" "$DUMP_FILE" >"$RESTORE_LOG" 2>&1; then
  cat "$RESTORE_LOG" >&2
  if [[ "$remote_lower" == *"pooler.supabase.com"* ]]; then
    echo "[db:push:local-to-remote] Restore failed using Supabase pooler URL." >&2
    echo "[db:push:local-to-remote] Retry using direct Postgres host URL (db.<project-ref>.supabase.co:5432) with sslmode=require." >&2
  fi
  exit 1
fi

echo "[db:push:local-to-remote] Resetting serial sequences on remote"
reset_sequences_for_tables "$REMOTE_DATABASE_URL" "$TARGET_TABLES_FILE"

echo "[db:push:local-to-remote] Collecting post-migration row counts"
collect_counts "$REMOTE_DATABASE_URL" "$TARGET_TABLES_FILE" "$REMOTE_COUNTS_AFTER_FILE"

print_counts "[db:push:local-to-remote] Row counts (remote after):" "$REMOTE_COUNTS_AFTER_FILE"

mismatches=0
while IFS='|' read -r table local_count; do
  [[ -z "$table" ]] && continue
  remote_count="$(get_count_for_table "$table" "$REMOTE_COUNTS_AFTER_FILE")"
  if [[ "$local_count" != "$remote_count" ]]; then
    echo "[db:push:local-to-remote] Count mismatch: $table local=$local_count remote=$remote_count" >&2
    mismatches=$((mismatches + 1))
  fi
done < "$LOCAL_COUNTS_FILE"

if [[ "$mismatches" -gt 0 ]]; then
  echo "[db:push:local-to-remote] Migration completed with count mismatches ($mismatches)." >&2
  exit 1
fi

print_sample_if_exists \
  "$REMOTE_DATABASE_URL" \
  "$TARGET_TABLES_FILE" \
  "businesses" \
  "SELECT id, name, country_code, website_domain, created_at FROM public.businesses ORDER BY created_at DESC NULLS LAST LIMIT 5;"

print_sample_if_exists \
  "$REMOTE_DATABASE_URL" \
  "$TARGET_TABLES_FILE" \
  "search_tasks" \
  "SELECT id, task_type, status, time_bucket, updated_at FROM public.search_tasks ORDER BY updated_at DESC NULLS LAST LIMIT 5;"

print_sample_if_exists \
  "$REMOTE_DATABASE_URL" \
  "$TARGET_TABLES_FILE" \
  "job_runs" \
  "SELECT id, job_name, status, started_at, finished_at FROM public.job_runs ORDER BY started_at DESC NULLS LAST LIMIT 5;"

echo "[db:push:local-to-remote] Migration completed successfully with matching row counts."
