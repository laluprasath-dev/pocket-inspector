# Super Admin Portal Integration Guide

## Purpose

This guide describes the admin portal behavior after survey versioning correction through Phase 5.

The portal must treat survey lifecycle and assignment lifecycle as linked but separate concerns:

- survey lifecycle controls version state (`PLANNED`, `ACTIVE`, `COMPLETED`)
- survey execution state controls fieldwork lock (`IN_PROGRESS`, `INSPECTOR_COMPLETED`)
- assignment state controls inspector access (`PENDING`, `ACCEPTED`, etc.)

## Canonical Backend Rules

1. Inspector fieldwork completion is survey-scoped, not building-scoped.
2. Building certificate upload/register is blocked until active survey fieldwork is marked complete.
3. Survey confirm-complete is blocked until:
- active survey execution is `INSPECTOR_COMPLETED`
- building certificate exists for that active survey
- all doors in that active survey are `CERTIFIED`
4. `start-next` creates a `PLANNED` survey version, never `ACTIVE`.
5. Planned surveys cannot be edited before activation.
6. Activation requires an accepted assignment linked to that planned `surveyId`.
7. Legacy building workflow endpoints still exist, but they are wrappers over active survey behavior.

## Admin Lifecycle Flow

### A. Complete current active survey

1. Inspector completes fieldwork:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
2. Admin uploads and registers building certificate:
- `POST /v1/buildings/:id/certificate/signed-upload`
- `POST /v1/buildings/:id/certificate/register`
3. Admin confirms survey completion:
- `POST /v1/buildings/:buildingId/surveys/confirm-complete`

### B. Confirm-complete with schedule vs skip

When calling `confirm-complete`:

- If scheduling payload is provided:
  - current active survey becomes `COMPLETED`
  - backend creates a real next survey row as `PLANNED`
- If scheduling payload is omitted:
  - current active survey becomes `COMPLETED`
  - no next survey row is created

### C. When no next version exists

If completion was done without scheduling, portal should show `Start Next Survey`:

- `POST /v1/buildings/:buildingId/surveys/start-next`

This creates a `PLANNED` version by cloning structure only (floors, doors).

### D. Planned survey activation

Activation endpoint:

- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`

Activation prerequisites:

- survey belongs to building/org
- survey is `PLANNED`
- no other survey for the building is `ACTIVE`
- accepted assignment exists for that exact `surveyId`

Activation effects:

- survey `status` becomes `ACTIVE`
- survey execution resets to `IN_PROGRESS`
- building approval/certification status is reset for the new cycle

## Assignment Requirements For Portal

Use survey-linked assignment for next-cycle work:

- `POST /v1/building-assignments` with optional `surveyId`

Portal behavior:

- `surveyId` provided: invitation targets a specific planned/active survey version
- no `surveyId`: transitional/current-building assignment behavior (legacy compatibility)

The portal must not assume assignment without `surveyId` is sufficient for planned-cycle activation.

## Portal Views: Current vs Upcoming vs History

### Current active work

Show survey where:

- `surveyStatus = ACTIVE`
- assignment is `ACCEPTED`

### Upcoming planned work

Show survey where:

- `surveyStatus = PLANNED`
- assignment is `PENDING` or `ACCEPTED`

### Historical versions

Use survey history endpoints:

- `GET /v1/buildings/:buildingId/surveys`
- `GET /v1/buildings/:buildingId/surveys/:surveyId`

Completed versions are read-only and should never be treated as active work.

## Legacy Endpoint Compatibility

Still available:

- `POST /v1/buildings/:buildingId/workflow/complete`
- `POST /v1/buildings/:buildingId/workflow/reopen`

Portal can keep these calls for compatibility, but must consider survey execution state as canonical.

## Recommended Admin QA Checks

1. Confirm-complete without scheduling leaves no planned survey.
2. `start-next` creates `PLANNED`, not `ACTIVE`.
3. Activation fails without accepted survey-linked assignment.
4. Activation succeeds after assignment acceptance.
5. Planned survey remains non-editable before activation.
6. Completed survey appears in history only.
