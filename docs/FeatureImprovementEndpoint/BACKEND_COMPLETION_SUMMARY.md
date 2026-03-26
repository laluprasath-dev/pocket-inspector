# Backend Completion Summary

## Status

Survey versioning correction is implemented through Phase 5 runtime scope, with Phase 6 integration artifacts updated (docs + Postman + QA flow).

## Implemented Scope By Phase

### Phase 1: Schema and migration foundation

- Added `PLANNED` to `SurveyStatus`
- Added `SurveyExecutionStatus` (`IN_PROGRESS`, `INSPECTOR_COMPLETED`)
- Added survey execution/audit fields (`scheduledStartAt`, `activatedAt`, `inspectorCompletedAt`, reopen/activate actors)
- Added nullable `surveyId` to `BuildingAssignment` and `BuildingAssignmentEvent`
- Added related indexes and conservative backfill behavior

### Phase 2: Survey-level fieldwork runtime

- Added survey-scoped endpoints:
  - `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
  - `POST /v1/buildings/:buildingId/surveys/:surveyId/reopen-fieldwork`
- Made survey execution status canonical for workflow lock/unlock
- Kept legacy building workflow endpoints as wrappers to active survey behavior

### Phase 3: Planned next-version lifecycle

- `start-next` now creates `PLANNED`, not `ACTIVE`
- `confirm-complete` creates planned next survey only when scheduling is provided
- Added activation endpoint:
  - `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
- Enforced activation prerequisite: accepted assignment linked to that `surveyId`
- Preserved structure-only clone (floors/doors) for planned next version
- Closed completed-survey assignments to prevent stale active work

### Phase 4: Certificate and completion gating

- Building certificate signed-upload/register now require active survey execution status `INSPECTOR_COMPLETED`
- `confirm-complete` now also requires survey fieldwork completion (in addition to certificate + door checks)
- Gating uses survey execution state, not legacy building workflow state

### Phase 5: Mobile-facing contract and notifications

- Assignment payloads now include survey metadata fields:
  - `surveyId`, `surveyVersion`, `surveyStatus`, `surveyExecutionStatus`, `scheduledStartAt`, `activatedAt`
- Applied to admin assignment responses, `GET /v1/me/building-assignments`, and assignment history responses where survey context exists
- Added/updated version-aware notifications carrying `surveyId` and `surveyVersion` for:
  - assignment invitation (survey-linked)
  - survey activation
  - survey fieldwork reopen
  - survey completion
- Updated recipient selection for survey-version notifications to assignment-based targeting

## Runtime Guarantees Now In Place

1. Fieldwork completion is tied to active survey version.
2. Planned surveys are non-editable until activation.
3. Activation is blocked without accepted survey-linked assignment.
4. Certificate and confirm-complete stages are blocked before inspector fieldwork completion.
5. Mobile can distinguish pending vs upcoming planned vs active work using assignment payload metadata.

## Verification Baseline

Primary verification commands:

```bash
npx prisma generate
npm run build
npm run test:e2e
```

Current full e2e result at completion stage:

- all suites passing (`112/112` tests)

## Deferred Scope

- No Phase 6+ runtime redesign was introduced.
- Legacy compatibility endpoints remain available by design.
