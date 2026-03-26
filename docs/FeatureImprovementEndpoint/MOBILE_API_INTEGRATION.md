# Mobile API Integration Guide

## Purpose

This guide reflects implemented backend behavior through Phase 5 for repeated survey cycles on the same building.

Mobile must use assignment payload survey metadata as the source of truth for whether work is upcoming, active, or historical.

## Required Mobile States

Mobile should distinguish these states explicitly:

1. Pending invitation
- assignment `status = PENDING`
- not editable

2. Accepted planned survey (upcoming)
- assignment `status = ACCEPTED`
- `surveyStatus = PLANNED`
- not editable yet

3. Accepted active survey (workable)
- assignment `status = ACCEPTED`
- `surveyStatus = ACTIVE`
- editable only when survey execution is not locked

4. Old completed survey / non-work history
- `surveyStatus = COMPLETED` or ended assignment states
- read-only history, not active queue

## Assignment Payload Fields Mobile Must Read

`GET /v1/me/building-assignments` now includes, per item:

- `surveyId`
- `surveyVersion`
- `surveyStatus`
- `surveyExecutionStatus`
- `scheduledStartAt`
- `activatedAt`

Compatibility notes:

- response still uses `pending` and `accepted` buckets
- top-level shape is unchanged
- transition fallback exists for legacy `surveyId = null` active assignments, but mobile should prefer explicit survey-linked rows when present

## How Mobile Should Derive UI

### Inbox

Show `pending` assignments as invitations only.

### Upcoming

Show accepted assignments where:

- `surveyStatus = PLANNED`

These should not unlock floor/door edits.

### Active Work

Show accepted assignments where:

- `surveyStatus = ACTIVE`

Use `surveyExecutionStatus`:

- `IN_PROGRESS`: editable
- `INSPECTOR_COMPLETED`: locked until admin reopens

### History

Use:

- `GET /v1/me/building-assignments/history`

History payload now includes survey context fields (`surveyId`, `surveyVersion`, `surveyStatus`, `surveyExecutionStatus`) where available.

## Survey Lifecycle Events Relevant To Mobile

### Fieldwork completion/reopen

- Inspector completes: `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
- Admin reopens: `POST /v1/buildings/:buildingId/surveys/:surveyId/reopen-fieldwork`

### Planned activation

- Admin activates planned survey: `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
- Activation requires accepted assignment linked to that `surveyId`

### Survey completion

- Admin confirm complete: `POST /v1/buildings/:buildingId/surveys/confirm-complete`

## Notification Contract For Mobile

Relevant notifications now carry survey version identifiers in `data`:

- `buildingId`
- `surveyId`
- `surveyVersion`
- `type`

Observed lifecycle notification types:

- `BUILDING_ASSIGNMENT_INVITED`
- `SURVEY_ACTIVATED`
- `SURVEY_FIELDWORK_REOPENED`
- `SURVEY_COMPLETED`
- `NEXT_SURVEY_SCHEDULED` (when created from confirm-complete scheduling)

Mobile should route notification actions by `(buildingId, surveyId)` and avoid building-only routing.

## Repeat-Cycle Behavior On Same Building

1. v1 active assignment is worked and completed.
2. Admin confirms complete.
3. Next version may be:
- created as `PLANNED` (schedule provided), or
- not created yet (schedule skipped)
4. Planned version is assigned and accepted.
5. Admin activates planned version.
6. Assignment item for that survey becomes active work.

At no point should completed old versions remain editable.

## Guardrails

- Do not infer workability from building-level workflow state.
- Do not treat accepted planned survey as active work.
- Do not assume `nextAssignedInspectorId` on a completed survey means a real assignment exists.
- Do not open editing UI for `PLANNED` or `COMPLETED` survey status.
