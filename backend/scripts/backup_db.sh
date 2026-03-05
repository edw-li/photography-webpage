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
DB_USER="${POSTGRES_USER:-photography}"

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

# Upload to OCI Object Storage and clean up previous backup using boto3
python3 - "$S3_ENDPOINT" "$OCI_ACCESS_KEY" "$OCI_SECRET_KEY" \
  "$OCI_BUCKET" "$DUMP_FILE" "$OBJECT_KEY" "$YESTERDAY_KEY" <<'PYEOF'
import sys, boto3
from botocore.config import Config

endpoint, access_key, secret_key, bucket, dump_file, obj_key, yesterday_key = sys.argv[1:8]

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
    config=Config(signature_version="s3v4"),
)

s3.upload_file(dump_file, bucket, obj_key)
print(f"Uploaded to s3://{bucket}/{obj_key}")

try:
    s3.delete_object(Bucket=bucket, Key=yesterday_key)
    print(f"Deleted previous backup: {yesterday_key}")
except Exception:
    print(f"No previous backup to delete: {yesterday_key}")
PYEOF

# Clean up local dump
rm -f "$DUMP_FILE"
echo "[$(date)] Backup complete."
