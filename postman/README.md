# Pocket Inspector Postman Guide

## Import

1. Start backend: `npm run start:dev`
2. Import collection:
- [Pocket-Inspector.postman_collection.json](/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/postman/Pocket-Inspector.postman_collection.json)
3. Import environment:
- [Pocket-Inspector.postman_environment.json](/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/postman/Pocket-Inspector.postman_environment.json)
4. Select `Pocket Inspector — Local` environment.

## Collection

- `Pocket-Inspector.postman_collection.json` is the single active collection.
- It uses `building-assignments` + `surveys` for the current admin/photographer workflow.
- For code-level regression, the required automated lifecycle runner is:
  - `npm run qa:survey-versioning-flow`
  - reference: [Survey Versioning Live Flow Test](/Users/admin/Documents/Applikation-New/Pocket-Inspector/pocket-inspector-backend/docs/SURVEY_VERSIONING_LIVE_FLOW_TEST.md)
- Start with the top-level consumer folders:
  - `🖥️ Admin Portal Endpoints`
  - `📱 Photographer Mobile Endpoints`
- The module folders below them remain the canonical full reference.
- Use `🧪 QA / Access Control` for explicit negative permission checks such as expected `403` requests.

## Key Variables Used In Phase 6 Flow

- `buildingId`
- `surveyId`
- `currentSurveyId`
- `plannedSurveyId`
- `assignmentId`
- `assignmentGroupId`
- `inspectorId`

## Final QA Smoke Run (10-15 min)

This checklist validates the corrected repeat-cycle lifecycle end to end.

1. Admin login and seed building
- `Auth -> Login as Admin`
- Create site/building requests in `Building Assignment Workflow -> Admin Portal Flow`

2. Create active survey prerequisites
- Assign and accept one photographer assignment (single assignment + photographer accept)
- Create floor/door and satisfy door submission/certification prerequisites
- Remember: door photo upload/register/delete is `DRAFT` only; after submit the admin must reopen the door for changes
- Ensure building certificate prerequisite requests are available

3. Photographer submits ready doors during partial progress
- Single door:
  - `📱 Photographer Mobile Endpoints -> 📸 Fieldwork & Uploads -> Submit Door (Photographer) — requires ≥1 image, locks photos`
- Multiple selected ready doors:
  - `📱 Photographer Mobile Endpoints -> 📸 Fieldwork & Uploads -> Bulk Submit Selected Doors (Photographer)`
- Bulk submit only changes selected `DRAFT` doors that already have images
- It does not complete survey fieldwork

4. Photographer previews and marks active survey fieldwork complete
- `📱 Photographer Mobile Endpoints -> 📸 Fieldwork & Uploads -> Preview Survey Fieldwork Readiness`
- This shows which draft doors can be bulk-submitted and which still need images
- `📱 Photographer Mobile Endpoints -> 📸 Fieldwork & Uploads -> Complete Survey Fieldwork (Photographer)`
- By default this only succeeds when the active survey has at least one door and no doors remain in `DRAFT`
- If draft doors already have images, send `{ "autoSubmitValidDoors": true }` to bulk-submit them during the same call
- Door certificates can still be uploaded individually as soon as each door is `SUBMITTED`
- Building certificate upload must wait until every active-survey door is `CERTIFIED`

5. Confirm-complete with scheduling (creates planned next)
- `📋 Surveys -> Confirm Survey Complete + Schedule Planned Next (Admin only)`
- Verify `plannedNextSurvey.status = PLANNED` and `plannedSurveyId` saved

6. Survey-linked assignment for planned next
- `🧭 Building Assignment Workflow -> Admin Portal Flow -> Assign Single Building To Planned Survey (with surveyId)`
- Verify assignment payload includes survey metadata fields

7. Photographer accepts planned assignment
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> Accept Single Assignment`

8. Activate planned survey
- `📋 Surveys -> Activate Planned Survey (Admin only)`
- Verify response is `ACTIVE` and `currentSurveyId` updated

9. Photographer marks newly active survey fieldwork complete
- `📱 Photographer Mobile Endpoints -> 📸 Fieldwork & Uploads -> Complete Survey Fieldwork (Photographer)`

10. Certificate upload/register after fieldwork completion
- `🏢 Buildings -> Request Building Certificate Upload URL`
- `🏢 Buildings -> Register Building Certificate`
- Confirm gated behavior by running before/after fieldwork completion where needed

11. Admin confirm complete without scheduling (skip path)
- `📋 Surveys -> Confirm Survey Complete (Skip Next Scheduling)`
- Verify `plannedNextSurvey = null`

12. Photographer verifies read-only completed history
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> My Completed Surveys`
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> Get Completed Survey Detail`
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> Get Completed Survey Building Certificate`
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> Get Completed Survey Door Images`
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> Get Completed Survey Door Certificate`
- Verify the survey disappeared from `My Building Assignments` and now appears in completed history

11. Start-next manual path (when no planned exists)
- `📋 Surveys -> Start Next Survey (Admin only)`
- Verify new survey is `PLANNED` and `plannedSurveyId` is set

12. History and assignment verification
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> My Building Assignments`
- `📱 Photographer Mobile Endpoints -> 🧭 Assignment Inbox -> My Assignment History`
- `🖥️ Admin Portal Endpoints -> 🧭 Assignment Workflow -> Admin Assignment History`
- Confirm survey metadata is present in assignment/history rows where available

## Survey Lifecycle Requests In Collection

Under `📋 Surveys` or the consumer folders:

- `List Survey History`
- `Get Current Active Survey`
- `Get Survey Detail (by ID)`
- `Confirm Survey Complete + Schedule Planned Next (Admin only)`
- `Confirm Survey Complete (Skip Next Scheduling)`
- `Start Next Survey (Admin only)` (creates `PLANNED`)
- `Activate Planned Survey (Admin only)`
- `Complete Survey Fieldwork (Photographer)`
- `Reopen Survey Fieldwork (Admin)`

## Notification Notes

Notification payloads tied to survey-version flows include:

- `buildingId`
- `surveyId`
- `surveyVersion`
- `type`

Relevant event types reflected by backend behavior:

- `BUILDING_ASSIGNMENT_INVITED`
- `SURVEY_ACTIVATED`
- `SURVEY_FIELDWORK_REOPENED`
- `SURVEY_COMPLETED`

## Troubleshooting

- `400` on complete-fieldwork usually means there are no doors in the active survey, some doors are still `DRAFT`, or auto-submit was requested while some draft doors still have no images.
- `200` on submit-doors can still contain blocked doors; check `blockedDoors[].reason` before assuming every selected door was submitted.
- `400` on certificate upload/register usually means fieldwork completion is missing or some doors in the active survey are not yet `CERTIFIED`.
- `400` on door image upload/register/delete usually means the door is no longer `DRAFT` and must be reopened first.
- Reopening a submitted door after fieldwork completion also reopens the active survey back to `IN_PROGRESS`.
- `400` on door certificate delete or fieldwork reopen can also mean the active survey still has a building certificate; delete that first.
- `400` on activate usually means no accepted assignment linked to `plannedSurveyId`.
- `400` on confirm-complete usually means one of: fieldwork incomplete, missing building certificate, uncertified doors.
- `403/404` on photographer write endpoints usually means assignment is pending/rejected/removed or survey is non-active.
- Use `GET /v1/buildings/:buildingId/surveys/:surveyId/fieldwork-readiness` when mobile wants a pre-submit summary before calling complete-fieldwork.
- After admin confirms survey completion, the item intentionally disappears from `GET /v1/me/building-assignments`; use `GET /v1/me/building-assignments/completed-surveys` for read-only history.
- Keep `GET /v1/me/building-assignments/completed-surveys/:surveyId` lightweight; fetch heavy read-only assets lazily from the completed-survey building/door asset endpoints.
