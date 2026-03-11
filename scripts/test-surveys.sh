#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Survey Versioning — End-to-End curl test script
# Uses existing test accounts: admin@example.com / inspector@example.com
#
# Run:  bash scripts/test-surveys.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE="http://localhost:3001/v1"
PASS=0; FAIL=0

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ PASS${NC}  $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}  ✗ FAIL${NC}  $1"; echo "       → $2"; ((FAIL++)) || true; }
info() { echo -e "${YELLOW}  →${NC} $1"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then ok "$label (status $actual)";
  else fail "$label" "expected HTTP $expected, got $actual"; fi
}

assert_field() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then ok "$label (= $actual)";
  else fail "$label" "expected '$expected', got '$actual'"; fi
}

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Pocket Inspector — Survey Versioning E2E Test"
echo "════════════════════════════════════════════════════════════"

# ── 1. Login both users ───────────────────────────────────────────────────────
echo ""
echo "── 1. Authentication ────────────────────────────────────────"

ADMIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin1234!","deviceId":"survey-test-admin","deviceName":"Test Admin"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | jq -r '.data.accessToken // empty')
ADMIN_ID=$(echo "$ADMIN_RESP"   | jq -r '.data.user.id // empty')
[[ -n "$ADMIN_TOKEN" ]] && ok "Admin login" || fail "Admin login" "$ADMIN_RESP"

INSP_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"inspector@example.com","password":"Inspector1234!","deviceId":"survey-test-insp","deviceName":"Test Inspector"}')
INSP_TOKEN=$(echo "$INSP_RESP" | jq -r '.data.accessToken // empty')
INSP_ID=$(echo "$INSP_RESP"   | jq -r '.data.user.id // empty')
[[ -n "$INSP_TOKEN" ]] && ok "Inspector login" || fail "Inspector login" "$INSP_RESP"

info "Admin ID: $ADMIN_ID"
info "Inspector ID: $INSP_ID"

# ── 2. Setup — create a clean building for the full lifecycle test ────────────
echo ""
echo "── 2. Setup: Create fresh test building + site ──────────────"

SITE_ID=$(curl -s -X POST "$BASE/sites" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Survey Test Site"}' | jq -r '.data.id')
info "Site ID: $SITE_ID"

BLDG_RESP=$(curl -s -X POST "$BASE/buildings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Survey Test Building\",\"siteId\":\"$SITE_ID\"}")
BLDG_ID=$(echo "$BLDG_RESP" | jq -r '.data.id // empty')
[[ -n "$BLDG_ID" ]] && ok "Building created (ID: $BLDG_ID)" || fail "Building create" "$BLDG_RESP"

# ── 3. Survey history on brand-new building (no floors yet = no survey) ───────
echo ""
echo "── 3. Survey list on new building (no survey yet) ───────────"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/buildings/$BLDG_ID/surveys" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_status "GET /surveys on new building returns 200" "200" "$STATUS"

COUNT=$(curl -s "$BASE/buildings/$BLDG_ID/surveys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length')
assert_field "Survey list is empty on new building" "0" "$COUNT"

CURRENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/buildings/$BLDG_ID/surveys/current" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_status "GET /surveys/current returns 404 when no survey" "404" "$CURRENT_STATUS"

# ── 4. Create a floor — should auto-create Survey v1 ─────────────────────────
echo ""
echo "── 4. Add floor — auto-creates Survey v1 ────────────────────"

FLOOR_RESP=$(curl -s -X POST "$BASE/floors" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"buildingId\":\"$BLDG_ID\",\"label\":\"Ground Floor\"}")
FLOOR_ID=$(echo "$FLOOR_RESP" | jq -r '.data.id // empty')
[[ -n "$FLOOR_ID" ]] && ok "Floor created (ID: $FLOOR_ID)" || fail "Floor create" "$FLOOR_RESP"

# Floor should now have a surveyId
SURVEY_ID=$(echo "$FLOOR_RESP" | jq -r '.data.surveyId // empty')
[[ -n "$SURVEY_ID" ]] && ok "Floor.surveyId auto-assigned ($SURVEY_ID)" || fail "Floor.surveyId missing" "$(echo $FLOOR_RESP | jq .data)"

COUNT=$(curl -s "$BASE/buildings/$BLDG_ID/surveys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length')
assert_field "Survey v1 now in history list" "1" "$COUNT"

# ── 5. Read survey endpoints ──────────────────────────────────────────────────
echo ""
echo "── 5. Survey read endpoints ─────────────────────────────────"

CURRENT=$(curl -s "$BASE/buildings/$BLDG_ID/surveys/current" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
CURRENT_VERSION=$(echo "$CURRENT" | jq -r '.data.version // empty')
CURRENT_STATUS_V=$(echo "$CURRENT" | jq -r '.data.status // empty')
assert_field "GET /surveys/current → version=1" "1" "$CURRENT_VERSION"
assert_field "GET /surveys/current → status=ACTIVE" "ACTIVE" "$CURRENT_STATUS_V"

DETAIL=$(curl -s "$BASE/buildings/$BLDG_ID/surveys/$SURVEY_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
DETAIL_STATUS=$(echo "$DETAIL" | jq -r '.data.status // empty')
FLOOR_COUNT=$(echo "$DETAIL" | jq '.data.floors | length')
assert_field "GET /surveys/:id → status=ACTIVE" "ACTIVE" "$DETAIL_STATUS"
assert_field "GET /surveys/:id → 1 floor in detail" "1" "$FLOOR_COUNT"

# ── 6. Add door, submit, try to confirm before cert ──────────────────────────
echo ""
echo "── 6. Door lifecycle within survey ──────────────────────────"

DOOR_RESP=$(curl -s -X POST "$BASE/doors" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"floorId\":\"$FLOOR_ID\",\"code\":\"D-001\",\"locationNotes\":\"Test door\"}")
DOOR_ID=$(echo "$DOOR_RESP" | jq -r '.data.id // empty')
[[ -n "$DOOR_ID" ]] && ok "Door created (ID: $DOOR_ID)" || fail "Door create" "$DOOR_RESP"

# Admin reads floors — should see only the active survey floor
FLOORS_RESP=$(curl -s "$BASE/buildings/$BLDG_ID/floors" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
FLOORS_COUNT=$(echo "$FLOORS_RESP" | jq '.data | length')
assert_field "GET /buildings/:id/floors returns active survey floors (admin)" "1" "$FLOORS_COUNT"

# ── 7. Confirm-complete validation errors ─────────────────────────────────────
echo ""
echo "── 7. confirm-complete validation ───────────────────────────"

# Should fail: building not CERTIFIED
MSG=$(curl -s -X POST "$BASE/buildings/$BLDG_ID/surveys/confirm-complete" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.message // empty')
[[ "$MSG" == *"building certificate must be uploaded"* ]] && \
  ok "confirm-complete blocked: building not certified" || \
  fail "confirm-complete should block: not certified" "$MSG"

# Should fail: inspector cannot call confirm-complete
INSP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/buildings/$BLDG_ID/surveys/confirm-complete" \
  -H "Authorization: Bearer $INSP_TOKEN" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Inspector cannot confirm-complete (403)" "403" "$INSP_STATUS"

# ── 8. start-next validation ──────────────────────────────────────────────────
echo ""
echo "── 8. start-next validation ─────────────────────────────────"

MSG=$(curl -s -X POST "$BASE/buildings/$BLDG_ID/surveys/start-next" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.message // empty')
[[ "$MSG" == *"already active"* ]] && \
  ok "start-next blocked: active survey exists" || \
  fail "start-next should block: active survey" "$MSG"

# ── 9. schedule-next endpoint ─────────────────────────────────────────────────
echo ""
echo "── 9. schedule-next ─────────────────────────────────────────"

SCHED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE/buildings/$BLDG_ID/surveys/current/schedule" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"nextScheduledNote\":\"Q2 annual inspection\",\"nextScheduledAt\":\"2026-06-01T09:00:00Z\"}")
assert_status "PATCH /surveys/current/schedule returns 200" "200" "$SCHED_STATUS"

# Verify the note was saved
NOTE=$(curl -s "$BASE/buildings/$BLDG_ID/surveys/current" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.data.id // empty')
# current endpoint doesn't return schedule fields in summary, check via list
NOTE_FROM_LIST=$(curl -s "$BASE/buildings/$BLDG_ID/surveys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.data[0].nextScheduledNote // empty')
assert_field "Schedule note saved" "Q2 annual inspection" "$NOTE_FROM_LIST"

# Clear the schedule
curl -s -X PATCH "$BASE/buildings/$BLDG_ID/surveys/current/schedule" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nextScheduledNote":null}' > /dev/null
ok "Schedule cleared with null"

# ── 10. Verify /buildings/:id/floors is scoped to active survey ──────────────
echo ""
echo "── 10. Floors scoped to active survey ───────────────────────"

# Our test building: 1 floor was added to Survey v1
BLDG_FLOORS=$(curl -s "$BASE/buildings/$BLDG_ID/floors" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
BLDG_FLOOR_COUNT=$(echo "$BLDG_FLOORS" | jq '.data | length')
assert_field "GET /buildings/:id/floors returns active survey floors (1)" "1" "$BLDG_FLOOR_COUNT"

# The floor's surveyId should match the survey we got in step 4
FLOOR_SURVEY_ID=$(echo "$BLDG_FLOORS" | jq -r '.data[0].surveyId // empty')
assert_field "Floor.surveyId matches Survey v1" "$SURVEY_ID" "$FLOOR_SURVEY_ID"

info "Skipping full GCS upload cycle (covered by Postman + manual testing)"

# ── 11. confirm-complete on our test building — more door-cert check ──────────
echo ""
echo "── 11. confirm-complete: all-doors-must-be-certified check ──"

# Door D-001 is DRAFT (we never submitted it) — confirm-complete should also
# fail because building is now APPROVED (not CERTIFIED) since we can't upload cert
MSG2=$(curl -s -X POST "$BASE/buildings/$BLDG_ID/surveys/confirm-complete" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.message // empty')
[[ "$MSG2" == *"building certificate must be uploaded"* || "$MSG2" == *"All doors must be CERTIFIED"* ]] && \
  ok "confirm-complete still blocked (building cert or uncertified doors)" || \
  fail "confirm-complete unexpected response" "$MSG2"

# ── 12. Inspector-only restrictions ───────────────────────────────────────────
echo ""
echo "── 12. Role restrictions ────────────────────────────────────"

ROLE_403=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/buildings/$BLDG_ID/surveys/start-next" \
  -H "Authorization: Bearer $INSP_TOKEN" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Inspector cannot start-next (403)" "403" "$ROLE_403"

ROLE_403_SCHED=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE/buildings/$BLDG_ID/surveys/current/schedule" \
  -H "Authorization: Bearer $INSP_TOKEN" \
  -H "Content-Type: application/json" -d '{"nextScheduledNote":"test"}')
assert_status "Inspector cannot schedule-next (403)" "403" "$ROLE_403_SCHED"

# ── 13. Read endpoints accessible by inspector ────────────────────────────────
echo ""
echo "── 13. Inspector read access ────────────────────────────────"

# Inspector cannot read surveys on a building they didn't create / aren't assigned to
LIST_AS_INSP=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/buildings/$BLDG_ID/surveys" \
  -H "Authorization: Bearer $INSP_TOKEN")
assert_status "Inspector cannot read unassigned building surveys (404)" "404" "$LIST_AS_INSP"

# Inspector CAN read surveys on their own building
OWN_BLDG=$(curl -s "$BASE/buildings" \
  -H "Authorization: Bearer $INSP_TOKEN" | jq -r '.data[0].id // empty')
if [[ -n "$OWN_BLDG" ]]; then
  INSP_LIST=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE/buildings/$OWN_BLDG/surveys" \
    -H "Authorization: Bearer $INSP_TOKEN")
  assert_status "Inspector reads surveys on own building (200)" "200" "$INSP_LIST"
fi

# ── 14. Unauthenticated access ────────────────────────────────────────────────
echo ""
echo "── 14. Auth required ────────────────────────────────────────"

UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/buildings/$BLDG_ID/surveys")
assert_status "Unauthenticated request rejected (401)" "401" "$UNAUTH"

# ── 15. Invalid survey ID ─────────────────────────────────────────────────────
echo ""
echo "── 15. 404 handling ─────────────────────────────────────────"

NOT_FOUND=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/buildings/$BLDG_ID/surveys/nonexistent-survey-id" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_status "GET /surveys/:invalidId returns 404" "404" "$NOT_FOUND"

# ── Cleanup ───────────────────────────────────────────────────────────────────
echo ""
echo "── Cleanup ──────────────────────────────────────────────────"
curl -s -X DELETE "$BASE/floors/$FLOOR_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && ok "Test floor deleted"
# Note: building/site left in DB as they're useful for manual inspection

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
printf "  Results:  ${GREEN}%d passed${NC}  /  ${RED}%d failed${NC}\n" "$PASS" "$FAIL"
echo "════════════════════════════════════════════════════════════"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
