# Survey Versioning Correction Spec

## Purpose

This document defines the backend correction plan for real survey versioning per building.

It focuses only on:
- survey lifecycle and version creation
- inspector completion before certificate upload
- admin completion and history rules
- next-cycle creation and scheduling
- mobile-facing version visibility and integration

It does not replace the broader building-assignment feature. Instead, it aligns that feature with survey-version lifecycle so the next survey of the same building can be understood and integrated correctly by both Admin Portal and Mobile.

## Confirmed Product Decisions

The following decisions are confirmed:

1. Keep the current bootstrap behavior for the first cycle.
- `v1` should continue to be auto-created when the first floor is created for a brand-new building.

2. If the admin skips scheduling after completion:
- do not create the next survey version
- show a `Start Next Survey` action in Admin Portal later

3. Inspector completion must move to survey level.
- it should no longer be tracked only as a building-wide workflow state

## Current Backend Problems

The current implementation has real building survey versions, but the lifecycle is incomplete:

- `SurveyStatus` only supports `ACTIVE` and `COMPLETED`
- `start-next` creates the next version immediately as active
- next scheduling fields are stored on the completed survey, not on a real upcoming survey row
- inspector completion is tracked separately at building level
- building certificate upload is not gated by inspector completion
- building assignments are building-centric and do not identify which survey version they belong to

This makes the next cycle ambiguous for both backend rules and mobile integration.

## Target Survey Lifecycle

Recommended survey lifecycle:

- `PLANNED`
- `ACTIVE`
- `COMPLETED`

Meaning:

- `PLANNED`: the next version exists structurally but has not started yet
- `ACTIVE`: the current working survey version
- `COMPLETED`: locked historical survey version

With the confirmed product decisions, the lifecycle becomes:

### First cycle

1. Building is created.
2. No survey exists yet.
3. First floor creation auto-creates `Survey v1`.
4. `v1` is created directly as `ACTIVE`.

### Later cycles

1. Current active survey is completed by admin.
2. Admin may choose a next survey date.
3. If a date is chosen, backend creates the next version as `PLANNED`.
4. Admin assigns or re-invites the inspector for that version.
5. Inspector accepts the assignment.
6. Admin starts or activates that planned survey.
7. Survey moves from `PLANNED` to `ACTIVE`.

### Skipped scheduling

1. Current active survey is completed by admin.
2. No next version is created.
3. Admin Portal shows `Start Next Survey`.
4. When the admin later clicks that action, the backend creates the next version and proceeds through assignment / acceptance / activation flow.

## Proposed Schema Diff

### 1. Extend `SurveyStatus`

Current:

```prisma
enum SurveyStatus {
  ACTIVE
  COMPLETED
}
```

Proposed:

```prisma
enum SurveyStatus {
  PLANNED
  ACTIVE
  COMPLETED
}
```

### 2. Add survey-level execution state

Add a dedicated enum:

```prisma
enum SurveyExecutionStatus {
  IN_PROGRESS
  INSPECTOR_COMPLETED
}
```

Reason:
- `Survey.status` should represent version lifecycle
- `SurveyExecutionStatus` should represent fieldwork state inside an active survey

### 3. Move execution completion onto `Survey`

Add the following fields to `Survey`:

```prisma
executionStatus         SurveyExecutionStatus @default(IN_PROGRESS)
scheduledStartAt        DateTime?
inspectorCompletedAt    DateTime?
inspectorCompletedById  String?
reopenedAt              DateTime?
reopenedById            String?
activatedAt             DateTime?
activatedById           String?
```

Add relations:

```prisma
inspectorCompletedBy User? @relation("SurveyInspectorCompletedBy", fields: [inspectorCompletedById], references: [id])
reopenedBy          User? @relation("SurveyReopenedBy", fields: [reopenedById], references: [id])
activatedBy         User? @relation("SurveyActivatedBy", fields: [activatedById], references: [id])
```

Behavior:
- `executionStatus = IN_PROGRESS` while inspector is still working
- `executionStatus = INSPECTOR_COMPLETED` after inspector explicitly completes fieldwork
- `reopenedAt` / `reopenedById` records admin reopen of that survey's fieldwork
- `scheduledStartAt` is the planned next cycle date
- `activatedAt` is the actual activation timestamp when a planned survey becomes active

### 4. Link assignments to survey version

Add `surveyId` to:

```prisma
model BuildingAssignment
model BuildingAssignmentEvent
```

Proposed fields:

```prisma
surveyId String?
```

Reason:
- the same building can have multiple survey cycles over time
- mobile and admin portal need to know which version an assignment belongs to
- "assign inspector for v2" must be distinguishable from generic building access

Relation:

```prisma
survey Survey? @relation(fields: [surveyId], references: [id], onDelete: SetNull)
```

Recommended index:

```prisma
@@index([surveyId, inspectorId, accessEndedAt])
```

### 5. Deprecate building-wide workflow state

Current `BuildingWorkflowState` is unique by `buildingId`.

Recommended direction:
- keep the table temporarily during migration
- stop using it for new survey-completion gating
- treat survey-level execution fields as the new source of truth

Optional cleanup phase later:
- remove `BuildingWorkflowState`
- remove related controller/service paths if no longer needed

## Proposed Endpoint Diff

### Survey history endpoints

Keep:

- `GET /v1/buildings/:buildingId/surveys`
- `GET /v1/buildings/:buildingId/surveys/current`
- `GET /v1/buildings/:buildingId/surveys/:surveyId`

Response changes:
- include `executionStatus`
- include `scheduledStartAt`
- include `inspectorCompletedAt`
- include `inspectorCompletedBy`
- include `activatedAt`
- include `activatedBy`
- include `reopenedAt`
- include `reopenedBy`

### Current completion endpoint

Keep path:

- `POST /v1/buildings/:buildingId/surveys/confirm-complete`

New required rules:

- survey must be `ACTIVE`
- survey execution must be `INSPECTOR_COMPLETED`
- active survey building certificate must exist
- all doors in that survey must be `CERTIFIED`

Behavior:

- set survey `status = COMPLETED`
- set `completedAt`
- set `confirmedById`
- do not auto-create the next version when no schedule is provided

Payload change:
- keep `nextScheduledAt`
- keep `nextScheduledNote`
- remove any implication that `nextAssignedInspectorId` creates a real assignment

Recommended semantics:
- if `nextScheduledAt` is provided, create the next survey version as `PLANNED`
- if omitted, create no next version

### Replace current `start-next` semantics

Current path:

- `POST /v1/buildings/:buildingId/surveys/start-next`

Current behavior is too aggressive because it immediately creates an active survey.

Recommended new behavior:

- this endpoint creates the next version as `PLANNED`
- it should not become `ACTIVE` until assignment and acceptance are ready

Recommended request body:

```json
{
  "scheduledStartAt": "2026-08-10T09:00:00Z",
  "note": "Q3 follow-up inspection"
}
```

If called without a schedule:
- create the next version as `PLANNED`
- leave `scheduledStartAt = null`

If product prefers a clearer split, alternative endpoint design:

- `POST /v1/buildings/:buildingId/surveys/next`

Either way, the important backend change is:
- create planned next version only
- do not activate it immediately

### New activation endpoint

Add:

- `POST /v1/buildings/:buildingId/surveys/:surveyId/activate`

Rules:

- survey must belong to the building and org
- survey status must be `PLANNED`
- there must be a current accepted assignment linked to that `surveyId`
- no other survey for that building may be `ACTIVE`

Behavior:

- set survey status to `ACTIVE`
- set `activatedAt`
- set `activatedById`
- reset execution status to `IN_PROGRESS`
- reset building current status to `DRAFT`

### New inspector completion endpoint

Recommended path:

- `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`

This replaces the survey-completion dependency on building-wide workflow state.

Rules:

- survey must be `ACTIVE`
- inspector must have accepted assignment for that `surveyId`
- validation rule for fieldwork readiness must pass

Minimum initial readiness rule:
- all doors in that survey must be at least `SUBMITTED`

Future stricter rule can additionally validate:
- required image roles per door exist

Behavior:

- set `executionStatus = INSPECTOR_COMPLETED`
- set `inspectorCompletedAt`
- set `inspectorCompletedById`

### New reopen endpoint

Recommended path:

- `POST /v1/buildings/:buildingId/surveys/:surveyId/reopen-fieldwork`

Rules:

- admin only
- survey must be `ACTIVE`
- execution status must be `INSPECTOR_COMPLETED`

Behavior:

- set `executionStatus = IN_PROGRESS`
- set `reopenedAt`
- set `reopenedById`

### Certificate upload endpoints

Keep paths:

- `POST /v1/buildings/:id/certificate/signed-upload`
- `POST /v1/buildings/:id/certificate/register`

New required rules:

- active survey must exist
- active survey execution status must be `INSPECTOR_COMPLETED`

This creates the required prerequisite:
- inspector finishes fieldwork first
- admin uploads certificate after that
- admin confirms survey complete after certificate stage

### Assignment endpoints

Keep the existing building-assignment endpoints, but extend payloads and responses with survey context.

New request requirement when assigning a future cycle:

```json
{
  "buildingId": "b1",
  "surveyId": "s2",
  "inspectorId": "u2"
}
```

Response should include:

```json
{
  "survey": {
    "id": "s2",
    "version": 2,
    "status": "PLANNED",
    "scheduledStartAt": "2026-08-10T09:00:00Z"
  }
}
```

## Admin Portal Integration Flow

### Complete current survey

1. Admin sees active survey version, such as `v1`.
2. Portal checks that certificate stage is complete.
3. Portal shows confirmation popup:
   - "Are you sure you want to mark this survey as completed?"
4. Portal calls `POST /surveys/confirm-complete`.
5. Backend moves `v1` into history.

### If scheduling is chosen immediately

1. Portal collects next date.
2. Backend creates `v2` as `PLANNED`.
3. Portal prompts assignment or re-invitation.
4. Portal waits for inspector acceptance.
5. Portal shows `Start Survey` or `Activate Survey`.
6. Portal calls activation endpoint.
7. `v2` becomes the active cycle.

### If scheduling is skipped

1. `v1` is completed.
2. No `v2` exists yet.
3. Portal shows `Start Next Survey`.
4. When clicked later, portal creates `v2` as planned and continues with assignment flow.

## Mobile Integration Plan

This correction changes what mobile must understand about repeated surveys on the same building.

### Mobile source of truth

Mobile should use assignment payloads plus linked survey metadata as the source of truth for work.

The app should not infer survey version from building name alone.

Each accepted assignment should include:
- building id and name
- survey id
- survey version
- survey status
- scheduled start date if planned
- execution status

### What mobile should show

#### Pending invitation

If inspector is invited to a future survey version:
- show building name
- show survey label such as `Survey v2`
- show scheduled date if available
- show that the invitation is not yet active work until accepted

#### Accepted but planned

If the inspector accepted the assignment but the survey is still `PLANNED`:
- show it in an `Upcoming` bucket, not in active work
- allow viewing assignment details
- do not allow floor/door/image workflow editing

#### Active work

Only surveys with:
- accepted assignment
- survey status `ACTIVE`

should appear in `Active Work`.

At that stage mobile can:
- open the building survey
- work on floors and doors for that version
- upload images
- submit doors
- complete fieldwork for that version

#### Historical versions

Older versions should not appear in active work.

Recommended mobile behavior:
- by default, show only current active version
- optionally show version label like `v2`
- do not expose older completed versions for editing
- if history view is later enabled, show it as read-only

### Notification plan for mobile

Recommended notification events:

- `SURVEY_INVITED`
  - sent when admin assigns inspector to a planned survey version
- `SURVEY_ACCEPTED_ACTIVE`
  - optional, sent when accepted survey is already active
- `SURVEY_ACTIVATED`
  - sent when a planned survey version becomes active
- `SURVEY_REOPENED`
  - sent when admin reopens fieldwork for that survey version
- `SURVEY_COMPLETED`
  - sent when admin confirms that survey version complete

Notification payload should include:
- `buildingId`
- `surveyId`
- `surveyVersion`
- `type`

### Mobile endpoint usage summary

Recommended mobile flow:

1. Load assignment inbox:
- `GET /v1/me/building-assignments`

2. Accept invitation:
- `POST /v1/building-assignments/:assignmentId/respond`

3. Read active survey context from assignment response.

4. If survey status is `PLANNED`:
- show upcoming state
- wait for activation notification or next poll

5. If survey status is `ACTIVE`:
- use building/floor/door workflow endpoints as normal

6. When fieldwork is done:
- call `POST /v1/buildings/:buildingId/surveys/:surveyId/complete-fieldwork`

7. If admin reopens:
- mobile receives reopen notification or sees updated survey execution status
- same survey version becomes editable again

## Migration Strategy

### Phase 1: additive schema migration

Add new schema without breaking existing flows:

- add `PLANNED` to `SurveyStatus`
- add `SurveyExecutionStatus`
- add new survey fields
- add `surveyId` to assignment tables

Backfill rules:

- existing `ACTIVE` surveys:
  - `executionStatus = IN_PROGRESS`
  - `activatedAt = startedAt`

- existing `COMPLETED` surveys:
  - `executionStatus = INSPECTOR_COMPLETED` only if product accepts this assumption
  - otherwise set `executionStatus = IN_PROGRESS` and leave inspector completion unknown

Recommended safer backfill:
- leave existing completed surveys with `executionStatus = IN_PROGRESS`
- treat missing historical inspector completion as legacy unknown state

Assignment backfill:

- for open current assignments on a building with an active survey, set `surveyId = activeSurvey.id`
- for historical assignment rows, allow `surveyId = null`

### Phase 2: dual-read backend

Update backend services to:

- read survey-level execution first
- fall back to `BuildingWorkflowState` only for legacy data if needed

This avoids immediate hard breakage.

### Phase 3: switch write paths

Update all write operations so new behavior writes only survey-level execution state:

- inspector fieldwork complete
- admin reopen
- certificate gating
- survey activation
- future-cycle assignment linkage

### Phase 4: frontend rollout

Admin Portal:
- update completion popup and next-cycle creation flow
- add upcoming planned version display
- add explicit activation action

Mobile:
- show `Pending`, `Upcoming`, and `Active Work`
- attach version labels to assignments
- only open active versions for editing

### Phase 5: legacy cleanup

Once the new flow is fully live:

- stop using `BuildingWorkflowState` for access and completion logic
- optionally remove old endpoints and tables in a later migration

## Open Questions Still Remaining

1. What exact rule defines `fieldwork complete`?
- all doors `SUBMITTED`
- all required image roles uploaded
- both

2. Should activation be manual by admin, or automatic when:
- the survey is planned
- the scheduled date arrives
- the inspector has already accepted

Recommended first version:
- manual admin activation

3. Should mobile be able to view old completed versions at all?

Recommended first version:
- no editing
- optional read-only history later

## Recommended Delivery Order

1. Schema migration
2. Survey-level execution endpoints
3. Certificate gating changes
4. Planned next-version creation and activation
5. Assignment payloads with survey context
6. Mobile guide and Admin Portal guide updates

## Summary

The core correction is:

- survey version becomes the real cycle container
- execution completion moves onto that survey version
- next survey creation becomes `PLANNED`, not immediately active
- assignment must identify the survey version
- mobile works against the current assigned version, not against the building generically

This gives a clean story for:
- `v1` current work
- `v1` completed history
- `v2` planned upcoming work
- `v2` active work after assignment and activation
