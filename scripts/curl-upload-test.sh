#!/usr/bin/env bash
# Full curl test: login → signed URL → GCS PUT → register
set -e

BASE="http://localhost:3000"
EMAIL="admin@example.com"
PASSWORD="Admin1234!"
IMAGE="testDoors/download.jpeg"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Curl Upload Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Login
echo ""
echo "Step 1 — Login..."
LOGIN=$(curl -s -X POST "$BASE/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "  ✅  Token: ${TOKEN:0:40}..."

# Step 2: Get latest door ID
echo ""
echo "Step 2 — Getting latest door ID..."
cd "$(dirname "$0")/.."
DOOR_ID=$(npx tsx -e "
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: a });
p.door.findFirst({ orderBy: { createdAt: 'desc' } }).then(d => { process.stdout.write(d.id); p.\$disconnect(); });
" 2>/dev/null)
echo "  ✅  Door ID: $DOOR_ID"

# Step 3: Request signed URL
echo ""
echo "Step 3 — Requesting signed upload URL..."
SIGNED=$(curl -s -X POST "$BASE/v1/doors/$DOOR_ID/images/signed-upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"HINGES","contentType":"image/jpeg"}')
SIGNED_URL=$(echo "$SIGNED" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signedUrl'])")
OBJ_PATH=$(echo "$SIGNED" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['objectPath'])")
IMG_ID=$(echo "$SIGNED" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['imageId'])")
echo "  ✅  Signed URL received"
echo "  ✅  imageId: $IMG_ID"

# Step 4: PUT image to GCS
echo ""
echo "Step 4 — Uploading image to GCS via signed URL..."
GCS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$SIGNED_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @"$IMAGE")
if [ "$GCS_STATUS" = "200" ]; then
  echo "  ✅  GCS upload succeeded (HTTP 200)"
else
  echo "  ❌  GCS upload failed (HTTP $GCS_STATUS)"
  exit 1
fi

# Step 5: Register in backend
echo ""
echo "Step 5 — Registering image in backend..."
REGISTER=$(curl -s -X POST "$BASE/v1/doors/$DOOR_ID/images/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"imageId\":\"$IMG_ID\",\"objectPath\":\"$OBJ_PATH\",\"role\":\"HINGES\",\"label\":\"curl test - hinge photo\"}")
RECORD_ID=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  ✅  Registered in DB (id: $RECORD_ID)"

# Step 6: Verify
echo ""
echo "Step 6 — Verifying image list..."
IMAGES=$(curl -s "$BASE/v1/doors/$DOOR_ID/images" \
  -H "Authorization: Bearer $TOKEN")
COUNT=$(echo "$IMAGES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
echo "  ✅  Door now has $COUNT image(s) registered"
echo "$IMAGES" | python3 -c "
import sys, json
imgs = json.load(sys.stdin)['data']
for i, img in enumerate(imgs):
    print(f'    [{i+1}] {img[\"role\"]:<22} label: \"{img.get(\"label\") or \"—\"}\"  id: {img[\"id\"]}')
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  All steps passed — signed URL upload flow works"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
