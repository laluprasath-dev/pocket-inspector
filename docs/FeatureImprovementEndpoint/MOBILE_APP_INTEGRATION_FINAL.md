# Mobile App Integration Final Guide

## Purpose

This is the final mobile integration guide based on the current backend uncommitted changes.

This document is structured in two parts:
1. Theory first: full end-to-end versioning and workflow model
2. Practical implementation: exact API integration, UI behavior, notification handling, and QA checklist

---

## Part 1: Theory (How it works end to end)

## 1) Core model

Mobile must treat work as **survey-version-based**, not building-only.

A single building can have multiple survey cycles over time:
- `v1`, `v2`, `v3`, ...

Each survey version has:
- lifecycle status: `PLANNED`, `ACTIVE`, `COMPLETED`
- execution status: `IN_PROGRESS`, `INSPECTOR_COMPLETED`

Inspector access is controlled by building assignment state:
- `PENDING`, `ACCEPTED`, `REJECTED`, `REMOVED`, `REASSIGNED`

## 2) Full repeat-cycle flow (top to end)

### Cycle running

1. Survey is `ACTIVE`.
2. Inspector has `ACCEPTED` assignment (survey-linked or transitional legacy).
3. Inspector performs floor, door, image, and submission work.

### Inspector marks fieldwork complete

4. Inspector calls:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`
5. Survey execution becomes `INSPECTOR_COMPLETED`.
6. Inspector write access is locked until admin reopens.

### Admin certification/completion stage

7. Admin completes certificate stage.
8. Admin confirms survey completion:
- `POST /v1/buildings/:buildingId/surveys/confirm-complete`
9. Survey lifecycle becomes `COMPLETED` and moves to history.
10. Current-cycle assignments are closed/removed from active work.

### Next cycle creation

There are two paths:

Path A: schedule at completion
- Backend creates real next survey row as `PLANNED`.

Path B: skip scheduling
- No next survey row yet.
- Later admin uses Start Next Survey, which creates `PLANNED`.

### Planned to active

11. Admin creates survey-linked assignment for planned survey (`surveyId`).
12. Inspector receives invitation and accepts.
13. Admin activates planned survey:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`
14. Survey lifecycle moves `PLANNED` -> `ACTIVE`.
15. Inspector starts new cycle work on that survey version.

## 3) What mobile must show

Mobile should separate work by real state:

1. Pending invitation
- assignment status is `PENDING`
- not editable

2. Accepted planned (upcoming)
- assignment status is `ACCEPTED`
- survey status is `PLANNED`
- not editable

3. Accepted active (workable now)
- assignment status is `ACCEPTED`
- survey status is `ACTIVE`
- editable only if execution status is `IN_PROGRESS`

4. Completed/old
- survey status `COMPLETED` or ended assignment
- read-only history only

## 4) Key lock rules

1. `PLANNED` survey is always non-editable.
2. `COMPLETED` survey is always non-editable.
3. `ACTIVE + INSPECTOR_COMPLETED` is locked until reopen.
4. Only `ACTIVE + IN_PROGRESS + ACCEPTED` should be treated as writable.

## 5) Notification meaning for mobile

Important notification types now include survey metadata:
- `BUILDING_ASSIGNMENT_INVITED`
- `SURVEY_ACTIVATED`
- `SURVEY_FIELDWORK_REOPENED`
- `SURVEY_COMPLETED`
- `NEXT_SURVEY_SCHEDULED`

All survey-version actions should route using:
- `buildingId`
- `surveyId`
- `surveyVersion`

Do not route by building only.

---

## Part 2: Practical Implementation (What to integrate)

## 1) Mobile data contract updates

For each assignment item from `GET /v1/me/building-assignments`, use:
- `surveyId`
- `surveyVersion`
- `surveyStatus`
- `surveyExecutionStatus`
- `scheduledStartAt`
- `activatedAt`

Keep existing buckets:
- `pending[]`
- `accepted[]`

Compatibility note:
- Some legacy assignments can have `surveyId = null`.
- Backend provides transitional context, but mobile should prefer explicit survey-linked rows whenever available.

## 2) Required mobile endpoints

### Assignment

- `GET /v1/me/building-assignments`
- `GET /v1/me/building-assignments/history`
- `POST /v1/building-assignments/:assignmentId/respond`
- `POST /v1/building-assignments/groups/:groupId/respond` (group invite accept/reject)

### Survey visibility/actions

- `GET /v1/buildings/:buildingId/surveys/current`
- `GET /v1/buildings/:buildingId/surveys`
- `GET /v1/buildings/:buildingId/surveys/:surveyId`
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork` (inspector action)

### Existing workflow compatibility

Legacy workflow endpoints still exist but mobile should align to survey-scoped endpoints for this flow.

## 3) UI mapping (recommended)

### A) Assignments screen sections

1. Invitations
- data source: `pending`
- show Accept/Reject

2. Upcoming
- from `accepted` where `surveyStatus = PLANNED`
- show "Waiting for activation"

3. Active work
- from `accepted` where `surveyStatus = ACTIVE`
- if `surveyExecutionStatus = IN_PROGRESS`, show "Continue work"
- if `surveyExecutionStatus = INSPECTOR_COMPLETED`, show "Submitted, waiting for review"

4. History
- data source: `/me/building-assignments/history`

### B) Building work screen write guard

Before showing create/edit/upload/submit actions:
- assignment status must be `ACCEPTED`
- survey status must be `ACTIVE`
- survey execution status must be `IN_PROGRESS`

Else render read-only state.

### C) Complete fieldwork action

Show button only when:
- active survey is present
- assignment is accepted
- survey execution is `IN_PROGRESS`

Call:
- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`

After success:
- lock write actions for that survey
- refresh assignments and survey details

## 4) Notification handling implementation

On receiving push payload:
1. Read `type`, `buildingId`, `surveyId`, `surveyVersion`.
2. Refresh assignment list and relevant survey detail.
3. Route by event:
- `BUILDING_ASSIGNMENT_INVITED`: open invitation context
- `SURVEY_ACTIVATED`: move planned accepted item into active section
- `SURVEY_FIELDWORK_REOPENED`: unlock active survey actions again
- `SURVEY_COMPLETED`: remove from active queue and show in history/read-only
- `NEXT_SURVEY_SCHEDULED`: show upcoming schedule context

## 5) API error handling guidance

- `400`: business rule failure
  - stale/expired assignment
  - wrong lifecycle stage
  - missing prerequisites
- `403`: permission denied
  - pending/rejected/removed access
  - locked execution state
- `404`: resource not available in current access scope

Recommended UX:
- show backend message for `400` when present
- on `403/404`, refresh assignment/survey state and show neutral access message

## 6) Practical integration order

1. Update mobile models with new survey metadata fields.
2. Update assignment screen segmentation (pending/upcoming/active/history).
3. Add/verify complete-fieldwork action and lock behavior.
4. Add notification routing by `buildingId + surveyId`.
5. Enforce write guard centrally in building/floor/door/image screens.
6. Validate repeat-cycle scenario end to end.

## 7) QA checklist for mobile signoff

1. Pending invite appears in `pending`.
2. Accept moves invite to `accepted`.
3. Accepted planned is shown as upcoming, not editable.
4. After admin activation, item shows as active editable work.
5. Inspector completes fieldwork and active screen becomes locked.
6. Admin reopen notification unlocks same survey again.
7. Admin completion removes item from active queue.
8. Next cycle assignment appears with correct new survey version.
9. Old completed survey remains read-only.
10. Notification deep-links resolve using `surveyId`, not building-only context.

## 8) Important do and do not

Do:
- treat survey version as primary work context
- rely on backend status checks as final authority
- keep UI resilient to legacy transitional rows

Do not:
- treat accepted planned survey as writable
- infer current work only from building-level status
- assume `nextAssignedInspectorId` alone means access is granted

---

## Final note

For mobile reliability in repeated cycles, always derive workability from the combination of:
- assignment status
- survey lifecycle status
- survey execution status

This prevents stale access, wrong editing states, and version confusion.

