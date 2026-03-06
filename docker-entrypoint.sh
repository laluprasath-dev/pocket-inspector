#!/bin/sh
set -e

echo "▶ Running database migrations..."
if npx prisma migrate deploy; then
  echo "✔ Migrations applied"
else
  echo "✖ Migration failed — starting app anyway (DB may already be up to date)"
fi

echo "▶ Starting Pocket Inspector API..."
exec node dist/src/main
