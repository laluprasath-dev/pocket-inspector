# Super Admin Portal Integration Final Guide

## Purpose

This is the single handoff guide for Admin Portal integration, based on the current uncommitted backend changes.

Use this guide to implement and verify the full survey-versioning flow in frontend.

## What Changed (Non-Technical Summary)

1. Survey work is now version-based per building (`v1`, `v2`, `v3`), with clear lifecycle:
- `PLANNED` -> `ACTIVE` -> `COMPLETED`

2. Inspector work completion is now tied to the active survey version (not just generic building state).

3. Certificate and completion flow is now stricter:
- inspector fieldwork complete first
- then certificate upload/register
- then admin confirm complete

4. Next cycle can be either:
- scheduled immediately at completion (creates real `PLANNED` next version), or
- skipped (no next row yet, admin later uses Start Next Survey)

5. Planned surveys are locked until activated, and activation requires accepted assignment for that same `surveyId`.

## Core Terms For Admin Portal

- Survey lifecycle status:
  - `PLANNED`: next cycle exists but not started
  - `ACTIVE`: current working cycle
  - `COMPLETED`: locked history
- Survey execution status:
  - `IN_PROGRESS`
  - `INSPECTOR_COMPLETED` (fieldwork locked until reopen)
- Assignment status:
  - `PENDING`, `ACCEPTED`, `REJECTED`, `REMOVED`, `REASSIGNED`

## Required Portal Flow

### 1) Active cycle execution

1. Inspector works on `ACTIVE` survey.
2. Inspector marks fieldwork complete:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`

### 2) Certificate stage

Only after inspector fieldwork completion:
1. Request certificate upload URL:
- `POST /v1/buildings/:id/certificate/signed-upload`
2. Register certificate:
- `POST /v1/buildings/:id/certificate/register`

### 3) Admin complete current survey

Trigger from confirmation popup:
- `POST /v1/buildings/:buildingId/surveys/confirm-complete`

Rules enforced by backend:
- active survey execution must be `INSPECTOR_COMPLETED`
- building certificate must exist for active survey
- all active-survey doors must be `CERTIFIED`

### 4) Decide next cycle at completion

Option A: Schedule now (recommended for continuous planning)
- Send scheduling payload in `confirm-complete`
- Backend creates real `PLANNED` next survey row

Option B: Skip scheduling
- Send empty body to `confirm-complete`
- No next survey row is created
- Admin Portal should show `Start Next Survey` action

### 5) Create planned cycle later (if skipped)

- `POST /v1/buildings/:buildingId/surveys/start-next`
- Creates `PLANNED` survey (structure clone only: floors + doors)

### 6) Assign inspector to planned cycle

Use survey-linked assignment:
- `POST /v1/building-assignments`
- Must include `surveyId` for planned cycle

### 7) Activate planned cycle

After inspector accepts assignment:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`

Backend requires:
- survey is `PLANNED`
- no other `ACTIVE` survey for building
- accepted assignment exists for same `surveyId`

## Endpoints Admin Portal Should Use

### Survey lifecycle

- `GET /v1/buildings/:buildingId/surveys`
- `GET /v1/buildings/:buildingId/surveys/current`
- `GET /v1/buildings/:buildingId/surveys/:surveyId`
- `POST /v1/buildings/:buildingId/surveys/confirm-complete`
- `POST /v1/buildings/:buildingId/surveys/start-next`
- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
- `PATCH /v1/buildings/:buildingId/surveys/current/schedule` (optional scheduling update on current active survey)

### Survey execution/workflow

- `POST /v1/buildings/:buildingId/surveys/:surveyId/reopen-fieldwork` (admin reopen)
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork` (inspector complete)

The old `buildings/:buildingId/workflow/*` wrapper endpoints have been removed.

### Assignment management

- `POST /v1/building-assignments` (single)
- `POST /v1/building-assignments/bulk`
- `POST /v1/building-assignments/sites/:siteId`
- `POST /v1/building-assignments/buildings/:buildingId/reassign`
- `GET /v1/building-assignments/history`

### Certificate

- `POST /v1/buildings/:id/certificate/signed-upload`
- `POST /v1/buildings/:id/certificate/register`
- `GET /v1/buildings/:id/certificate/signed-download`
- `GET /v1/buildings/:id/surveys/:surveyId/certificate/signed-download`

## Payloads You Need

### A) Confirm complete with scheduling

```json
{
  "nextScheduledAt": "2027-02-15T08:30:00.000Z",
  "nextScheduledNote": "Annual cycle",
  "nextAssignedInspectorId": "inspector-user-id"
}
```

### B) Confirm complete without scheduling

```json
{}
```

### C) Start next planned cycle

```json
{
  "nextScheduledAt": "2027-03-01T09:00:00.000Z",
  "nextScheduledNote": "Q1 cycle"
}
```

### D) Survey-linked assignment

```json
{
  "buildingId": "building-id",
  "inspectorId": "inspector-user-id",
  "surveyId": "planned-survey-id"
}
```

## UI Behavior Rules

1. Show confirm popup before calling `confirm-complete`.
2. If completion response has `plannedNextSurvey = null`, show `Start Next Survey` button.
3. If planned survey exists, show it as upcoming and locked until activation.
4. Do not allow editing actions on `PLANNED` or `COMPLETED` surveys.
5. Activation button should be enabled only after assignment acceptance for that planned `surveyId`.
6. Use survey history views for completed versions; they are read-only.

## Error Handling Expectations

- `400`: business rule failure (missing prerequisites, stale assignment, invalid state order)
- `403`: role/permission failure
- `404`: not found or not accessible in current scope

Show backend message text directly where possible for faster operator resolution.

## QA Checklist For Admin Portal

1. Complete-fieldwork called on active survey.
2. Certificate upload/register blocked before fieldwork completion.
3. Certificate upload/register allowed after fieldwork completion.
4. Confirm-complete blocked until certificate + all doors certified.
5. Confirm-complete with schedule creates `PLANNED` next survey.
6. Confirm-complete without schedule creates no next row; Start Next button shown.
7. Start-next creates `PLANNED` (not `ACTIVE`).
8. Planned assignment uses `surveyId`.
9. Activation fails without accepted survey-linked assignment.
10. Activation succeeds after acceptance and survey becomes `ACTIVE`.
11. Old cycle is visible in history and stays read-only.

## Final Integration Note

For new-cycle reliability, Admin Portal should always treat `surveyId` as the primary context for assignment, activation, progress, and completion actions.
