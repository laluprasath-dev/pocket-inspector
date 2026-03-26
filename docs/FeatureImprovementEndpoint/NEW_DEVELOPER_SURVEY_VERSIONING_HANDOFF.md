# New Developer Handoff: Survey Versioning Correction

## Purpose

This document is the handoff package for the new developer who will continue the survey versioning correction work in this backend project.

The developer will work on the same device and in the same repository:

`/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend`

This handoff includes:
- project focus
- phase-based delivery plan
- mandatory understanding items
- signoff checkpoints
- required test matrix
- exact prompt to give to the developer

## Project Focus

The current work is focused on:

- real survey versioning per building
- correcting the lifecycle of next survey creation
- moving inspector fieldwork completion to survey level
- making certificate upload depend on inspector fieldwork completion
- making assignment and mobile flows version-aware

The source spec for this work is:

- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/SURVEY_VERSIONING_CORRECTION_SPEC.md`

## Confirmed Product Decisions

These decisions are already confirmed and must be followed:

1. Keep current `v1` bootstrap behavior.
- `v1` should still be auto-created when the first floor is created for a brand-new building.

2. If scheduling is skipped after current survey completion:
- do not create the next survey version
- Admin Portal can later show `Start Next Survey`

3. Inspector fieldwork completion must move to survey level.

4. The next survey version should not become active immediately.
- it should be created as `PLANNED`
- then assigned
- then accepted
- then activated

5. Only structure is cloned into the next version:
- floors
- doors

Do not carry forward:
- images
- certificates
- old workflow completion state

6. Mobile should only edit the current active survey version.

7. Older completed versions must remain read-only.

## Phase-Based Delivery Plan

The developer must work in phases and stop after each phase for review.

### Phase 0: Understand Current Implementation

Goal:
- understand current survey lifecycle
- understand current assignment/workflow model
- identify gaps versus target design

Tasks:
- read the spec and related backend/mobile docs
- inspect current schema and services
- inspect relevant e2e tests
- summarize current flow and target flow

Required output:
- short written understanding note
- risks
- assumptions
- implementation order

Signoff criteria:
- developer clearly explains:
  - how `v1` is created today
  - how `confirm-complete` works today
  - how `start-next` works today
  - why building-wide workflow is insufficient
  - how mobile should distinguish pending, upcoming, and active work

### Phase 1: Schema Diff And Migration

Goal:
- introduce proper survey lifecycle and survey-linked assignment structure

Tasks:
- add `PLANNED` to `SurveyStatus`
- add survey-level execution status and fields
- add `surveyId` to `BuildingAssignment`
- add `surveyId` to `BuildingAssignmentEvent`
- update Prisma relations and indexes
- create migration
- define backfill strategy

Required output:
- schema changes
- migration files
- backfill notes

Signoff criteria:
- migration is safe
- legacy data remains readable
- active legacy surveys continue to function

### Phase 2: Survey-Level Fieldwork Completion

Goal:
- replace building-level fieldwork completion with survey-level completion

Tasks:
- implement survey-level fieldwork complete logic
- implement survey-level reopen logic
- update permissions and access rules
- stop relying on building-wide workflow for new logic

Required output:
- updated controllers/services
- tests for survey-scoped completion and reopen

Signoff criteria:
- active survey version is the unit of fieldwork completion
- reopen affects the same survey version
- planned or completed versions remain non-editable

### Phase 3: Planned Next Survey Lifecycle

Goal:
- make next survey creation planned first, not active immediately

Tasks:
- change next-survey creation behavior to create `PLANNED`
- add activation flow
- enforce accepted assignment before activation
- ensure only one active survey exists per building
- keep clone behavior structure-only

Required output:
- updated survey lifecycle code
- activation endpoint
- e2e coverage

Signoff criteria:
- skipped scheduling creates no new version
- manual next version creation creates `PLANNED`
- planned survey cannot be edited before activation

### Phase 4: Certificate Gating

Goal:
- make certificate stage depend on inspector fieldwork completion

Tasks:
- block building certificate upload/register until inspector completed fieldwork
- block admin survey completion until:
  - inspector fieldwork is complete
  - certificate stage is complete
  - existing survey completion checks still pass

Required output:
- updated building certificate rules
- updated survey completion rules
- test coverage

Signoff criteria:
- flow becomes:
  - inspector fieldwork complete
  - admin certificate upload
  - admin survey complete

### Phase 5: Version-Aware Assignment And Mobile Contract

Goal:
- make assignments and mobile integration version-aware

Tasks:
- include survey metadata in assignment responses
- include survey metadata in relevant notifications
- expose planned vs active version clearly
- make mobile contract support repeated surveys on same building

Required output:
- updated assignment response shapes
- notification payload updates
- tests

Signoff criteria:
- mobile can distinguish:
  - pending invitation
  - accepted planned survey
  - accepted active survey
  - old completed survey

### Phase 6: Docs, Postman, QA

Goal:
- complete the handoff and verification layer

Tasks:
- update mobile guide
- update admin portal guide
- update Postman
- update QA smoke flow
- run final build and e2e verification

Required output:
- updated docs
- updated Postman
- final verification summary

Signoff criteria:
- docs match implemented backend behavior
- QA can follow the repeated-survey flow without guessing

## Mandatory Reading List

The developer must read these files before coding:

- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/SURVEY_VERSIONING_CORRECTION_SPEC.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/BACKEND_COMPLETION_SUMMARY.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/MOBILE_API_INTEGRATION.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/prisma/schema.prisma`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/surveys/surveys.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/surveys/surveys.controller.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/floors/floors.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/buildings/buildings.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/building-assignments/building-assignments.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/building-assignments.e2e-spec.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/building-assignment-verification.e2e-spec.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/domain.e2e-spec.ts`

## Mandatory Test Matrix

These scenarios must be covered before final signoff:

- `v1` auto-created on first floor creation
- active survey fieldwork completion by accepted inspector
- fieldwork completion blocked for wrong inspector or wrong survey context
- certificate upload blocked before fieldwork completion
- certificate upload allowed after fieldwork completion
- survey completion blocked before fieldwork completion
- survey completion blocked before certificate
- survey completion creates locked historical version
- skipped scheduling creates no next version
- next survey creation creates `PLANNED` version
- planned version clones floors and doors only
- planned version does not carry images or certificates
- planned version is not editable before activation
- activation requires accepted assignment
- assignment payload includes survey metadata
- mobile-facing notification payload includes `surveyId` and `surveyVersion`

## Required Reporting Format

After each phase, the developer must respond with:

1. Summary of what changed
2. Files changed
3. Tests added or updated
4. Commands run and results
5. Open issues or decisions needed
6. Status:
   - `Ready for signoff`
   - or `Blocked`

## Expectations

The developer must:

- work phase by phase
- stop after each phase
- avoid touching unrelated code unnecessarily
- use `apply_patch` for manual edits
- preserve existing user changes
- add or update e2e tests for each behavioral change
- run verification after each phase where possible
- report exact command output summaries, not vague claims

## Exact Prompt For The Developer

Use the prompt below exactly as the handoff prompt:

---

You are working in the Pocket Inspector backend at:

`/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend`

Your task is to implement the survey versioning correction plan in a controlled, phase-based way. Do not rush into code changes without first understanding the current implementation and the target design.

Start by reading these files carefully:

- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/SURVEY_VERSIONING_CORRECTION_SPEC.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/BACKEND_COMPLETION_SUMMARY.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/FeatureImprovementEndpoint/MOBILE_API_INTEGRATION.md`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/prisma/schema.prisma`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/surveys/surveys.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/surveys/surveys.controller.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/floors/floors.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/buildings/buildings.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/src/modules/building-assignments/building-assignments.service.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/building-assignments.e2e-spec.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/building-assignment-verification.e2e-spec.ts`
- `/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/test/domain.e2e-spec.ts`

Before writing code, send back a short understanding note that explains:
- how `v1` is created today
- how `confirm-complete` works today
- how `start-next` works today
- why the current building-wide workflow model is insufficient
- how mobile should distinguish pending, upcoming planned, and active survey work

Then execute the work in these phases and stop after each phase for review and signoff:

Phase 0:
- understand current implementation
- list risks, assumptions, and implementation order

Phase 1:
- schema diff and migration
- add `PLANNED` survey status
- add survey-level execution status and fields
- add `surveyId` to building assignments and assignment events
- provide migration and backfill notes

Phase 2:
- refactor inspector completion and reopen to be survey-level, not building-level
- add or update endpoints for survey-level fieldwork completion and reopen
- update permission checks accordingly

Phase 3:
- change next survey creation so next version is `PLANNED`, not immediately `ACTIVE`
- add activation flow
- ensure no activation without accepted assignment for that survey version

Phase 4:
- enforce certificate upload and register only after inspector fieldwork completion
- enforce survey completion only after inspector fieldwork completion and certificate stage

Phase 5:
- make assignment responses survey-version aware for mobile
- include survey metadata in assignment responses and relevant notifications

Phase 6:
- update docs and Postman
- complete end-to-end verification

Important product decisions you must follow:
- keep current `v1` bootstrap behavior
- if scheduling is skipped after completion, create no next version
- move inspector fieldwork completion to survey level
- next survey version must be planned first, then assigned, then accepted, then activated
- only structure is cloned forward: floors and doors
- do not carry forward images or certificates
- mobile should only edit the current active survey version
- older completed versions must remain read-only

Non-negotiable expectations:
- do not overwrite unrelated existing user changes
- use `apply_patch` for manual edits
- keep changes incremental and reviewable
- add or update e2e coverage for each behavioral change
- run verification after each phase where possible
- report exact commands and results

For every phase, respond with:
1. Summary of what changed
2. Files changed
3. Tests added or updated
4. Commands run and results
5. Open issues or decisions needed
6. Clear statement:
   - `Ready for signoff`
   - or `Blocked`

Mandatory scenarios to test before final signoff:
- `v1` auto-created on first floor creation
- active survey fieldwork completion by accepted inspector
- certificate upload blocked before fieldwork completion
- certificate upload allowed after fieldwork completion
- survey completion blocked before fieldwork completion
- survey completion blocked before certificate
- completion creates locked historical version
- skipped scheduling creates no next version
- next survey creation creates `PLANNED` version
- planned version clones floors and doors only
- planned version is not editable before activation
- activation requires accepted assignment
- assignment payload includes survey metadata
- mobile-facing notification payload includes `surveyId` and `surveyVersion`

Do not jump to the final implementation immediately. Work phase by phase and wait for review after each phase.

---

## Manager Signoff Rule

The developer should not proceed from one phase to the next until the current phase response has been reviewed and explicitly accepted.
