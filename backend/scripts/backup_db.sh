#!/bin/bash
# Daily PostgreSQL backup to OCI Object Storage
# Usage: backup_db.sh
# Expects environment variables or .env file for configuration
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env from project root if it exists
ENV_FILE="${SCRIPT_DIR}/../../.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Database config
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-photography}"
DB_USER="${POSTGRES_USER:-postgres}"

# OCI Object Storage config (S3-compatible)
OCI_REGION="${OCI_REGION:?Set OCI_REGION}"
OCI_NAMESPACE="${OCI_NAMESPACE:?Set OCI_NAMESPACE}"
OCI_BUCKET="${OCI_BUCKET_NAME:?Set OCI_BUCKET_NAME}"
OCI_ACCESS_KEY="${OCI_ACCESS_KEY:?Set OCI_ACCESS_KEY}"
OCI_SECRET_KEY="${OCI_SECRET_KEY:?Set OCI_SECRET_KEY}"

S3_ENDPOINT="https://${OCI_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oraclecloud.com"

# Timestamps
TODAY="$(date +%Y-%m-%d)"
YESTERDAY="$(date -d yesterday +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)"
DUMP_FILE="/tmp/${DB_NAME}_${TODAY}.sql.gz"
OBJECT_KEY="backups/${DB_NAME}_${TODAY}.sql.gz"
YESTERDAY_KEY="backups/${DB_NAME}_${YESTERDAY}.sql.gz"

echo "[$(date)] Starting backup of database '${DB_NAME}'..."

# Dump and compress
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$DUMP_FILE"

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "[$(date)] Dump complete: ${DUMP_FILE} (${DUMP_SIZE})"

# Upload to OCI Object Storage using AWS CLI (S3-compatible)
export AWS_ACCESS_KEY_ID="$OCI_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$OCI_SECRET_KEY"
export AWS_DEFAULT_REGION="$OCI_REGION"

aws s3 cp "$DUMP_FILE" "s3://${OCI_BUCKET}/${OBJECT_KEY}" \
  --endpoint-url "$S3_ENDPOINT" \
  --quiet

echo "[$(date)] Uploaded to s3://${OCI_BUCKET}/${OBJECT_KEY}"

# Delete previous day's backup
aws s3 rm "s3://${OCI_BUCKET}/${YESTERDAY_KEY}" \
  --endpoint-url "$S3_ENDPOINT" \
  --quiet 2>/dev/null && \
  echo "[$(date)] Deleted previous backup: ${YESTERDAY_KEY}" || \
  echo "[$(date)] No previous backup to delete: ${YESTERDAY_KEY}"

# Clean up local dump
rm -f "$DUMP_FILE"
echo "[$(date)] Backup complete."
