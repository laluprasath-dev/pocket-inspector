#!/bin/sh
set -e

# Confirm DATABASE_URL is present (injected by Cloud Run from Secret Manager)
if [ -z "$DATABASE_URL" ]; then
  echo "✖ FATAL: DATABASE_URL is not set. Check Secret Manager binding in Cloud Run."
  exit 1
fi
echo "✔ DATABASE_URL is set"

echo "▶ Running database migrations..."
if node_modules/.bin/prisma migrate deploy; then
  echo "✔ Migrations applied successfully"
else
  echo "✖ FATAL: Migration failed — refusing to start. Check DB connection and Cloud Run logs."
  exit 1
fi

echo "▶ Starting Pocket Inspector API..."
exec node dist/src/main
