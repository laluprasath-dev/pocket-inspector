# Survey Versioning Live Flow Test

This is the required regression run for the survey lifecycle.

Use:

- before releasing survey/versioning changes
- before releasing assignment-flow changes
- before releasing door submit / certificate workflow changes
- when onboarding a new backend or mobile contributor who needs the real lifecycle reference

## Script

- [test-survey-versioning-flow.ts](/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/scripts/test-survey-versioning-flow.ts)
- npm command: `npm run qa:survey-versioning-flow`

## Safety Rules

The script creates real data and uploads real test files through signed URLs.

It will refuse to run unless:

- `FLOW_ALLOW_DATA_MUTATION=true`

It will also refuse remote targets unless:

- `FLOW_ALLOW_REMOTE=true`

This is intentional. Do not remove these guards.

## Local Run

```bash
FLOW_BASE_URL=http://localhost:3001 \
FLOW_ADMIN_EMAIL=admin@example.com \
FLOW_ADMIN_PASSWORD='your-password' \
FLOW_ALLOW_DATA_MUTATION=true \
npm run qa:survey-versioning-flow
```

## Remote Run

```bash
FLOW_BASE_URL='https://pocket-inspector-api-34292529156.europe-west2.run.app' \
FLOW_ADMIN_EMAIL='admin@example.com' \
FLOW_ADMIN_PASSWORD='your-password' \
FLOW_ALLOW_DATA_MUTATION=true \
FLOW_ALLOW_REMOTE=true \
npm run qa:survey-versioning-flow
```

## What It Covers

### `v1`

1. Admin login
2. Create two fresh photographer accounts
3. Create a fresh site and building
4. Assign `v1` photographer
5. Photographer accepts assignment
6. Photographer creates floor and doors
7. Photographer uploads door images
8. Photographer submits one door individually
9. Photographer submits another door through `submit-doors`
10. Photographer completes fieldwork
11. Admin uploads door certificates
12. Admin uploads building certificate
13. Admin confirms survey complete and schedules `v2`
14. Completed-survey history endpoints are verified

### `v2`

1. Admin assigns a photographer to the planned survey
2. Photographer accepts assignment
3. Survey auto-activates immediately on acceptance
4. Structure cloning is verified:
   - floors copied
   - doors copied
   - door images not copied
   - door certificates not copied
   - building certificate not copied
5. Photographer uploads fresh `v2` images
6. Photographer completes fieldwork with `autoSubmitValidDoors=true`
7. Admin uploads fresh `v2` door certificates
8. Admin uploads fresh `v2` building certificate
9. Admin confirms `v2` complete
10. Completed history is verified and active assignment buckets are checked

Important:
- The normal flow no longer calls `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
- If that endpoint returns `400 "Only planned surveys can be activated"` during this test, that is expected once acceptance has already auto-activated the survey

## Expected Output

On success, the script prints:

- `siteId`
- `buildingId`
- `inspectorV1Email`
- `inspectorV2Email`
- `surveyV1Id`
- `surveyV2Id`
- `assignmentV1Id`
- `assignmentV2Id`

Keep these values if you need to inspect the run manually afterward.

## Related Commands

- simpler assignment smoke flow:
  - `npm run qa:admin-inspector-flow`

Use `qa:survey-versioning-flow` as the primary regression check for lifecycle work. The simpler smoke flow is not enough for versioning changes.
