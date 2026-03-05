#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DB_HOST:-host.docker.internal}" -p "${DB_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -q; do
  echo "PostgreSQL is not ready yet, retrying in 2s..."
  sleep 2
done
echo "PostgreSQL is ready."

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
