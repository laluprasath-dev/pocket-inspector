#!/bin/sh
set -e

echo "▶ Running database migrations..."
npx prisma migrate deploy

echo "▶ Starting Pocket Inspector API..."
exec node dist/src/main
