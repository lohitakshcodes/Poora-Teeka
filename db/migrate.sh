#!/usr/bin/env bash
set -euo pipefail

# Poora Teeka Migration Runner
# Uses psql with --single-transaction and ON_ERROR_STOP=1 for atomic, fail-safe DDL execution.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env file if present
if [ -f "${ROOT_DIR}/.env" ]; then
  # Export vars from .env without overwriting existing environment variables
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^\s*#' "${ROOT_DIR}/.env" | grep -v '^\s*$')
  set +a
fi

SQL_FILE="${1:-${SCRIPT_DIR}/schema.sql}"

if [ ! -f "${SQL_FILE}" ]; then
  echo "❌ Error: SQL file not found: ${SQL_FILE}" >&2
  exit 1
fi

# Resolve database connection variables
HOST="${DB_HOST:-${PGHOST:-}}"
PORT="${DB_PORT:-${PGPORT:-5432}}"
DATABASE="${DB_NAME:-${PGDATABASE:-postgres}}"
USER="${DB_USER:-${PGUSER:-poorateeka_admin}}"
PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"

if [ -z "${HOST}" ]; then
  echo "❌ Error: DB_HOST (or PGHOST) is required." >&2
  exit 1
fi

if [ -z "${PASSWORD}" ]; then
  echo "❌ Error: DB_PASSWORD (or PGPASSWORD) is required." >&2
  exit 1
fi

echo "=================================================="
echo "  Poora Teeka Database Migration Runner"
echo "=================================================="
echo "Host:     ${HOST}"
echo "Port:     ${PORT}"
echo "Database: ${DATABASE}"
echo "User:     ${USER}"
echo "Applying: ${SQL_FILE}"
echo "--------------------------------------------------"

export PGHOST="${HOST}"
export PGPORT="${PORT}"
export PGDATABASE="${DATABASE}"
export PGUSER="${USER}"
export PGPASSWORD="${PASSWORD}"
export PGSSLMODE="${PGSSLMODE:-require}"

psql \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --single-transaction \
  -v ON_ERROR_STOP=1 \
  -f "${SQL_FILE}"

echo "--------------------------------------------------"
echo "✅ Successfully applied ${SQL_FILE}"
echo "=================================================="
