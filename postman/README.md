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
- It uses `building-assignments` + `surveys` for the current admin/inspector workflow.

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
- Assign and accept one inspector assignment (single assignment + inspector accept)
- Create floor/door and satisfy door submission/certification prerequisites
- Ensure building certificate prerequisite requests are available

3. Inspector marks active survey fieldwork complete
- `📋 Surveys -> Complete Survey Fieldwork (Inspector)`

4. Confirm-complete with scheduling (creates planned next)
- `📋 Surveys -> Confirm Survey Complete + Schedule Planned Next (Admin only)`
- Verify `plannedNextSurvey.status = PLANNED` and `plannedSurveyId` saved

5. Survey-linked assignment for planned next
- `🧭 Building Assignment Workflow -> Admin Portal Flow -> Assign Single Building To Planned Survey (with surveyId)`
- Verify assignment payload includes survey metadata fields

6. Inspector accepts planned assignment
- `🧭 Building Assignment Workflow -> Inspector Mobile Flow -> Accept Single Assignment`

7. Activate planned survey
- `📋 Surveys -> Activate Planned Survey (Admin only)`
- Verify response is `ACTIVE` and `currentSurveyId` updated

8. Inspector marks newly active survey fieldwork complete
- `📋 Surveys -> Complete Survey Fieldwork (Inspector)`

9. Certificate upload/register after fieldwork completion
- `🏢 Buildings -> Request Building Certificate Upload URL`
- `🏢 Buildings -> Register Building Certificate`
- Confirm gated behavior by running before/after fieldwork completion where needed

10. Admin confirm complete without scheduling (skip path)
- `📋 Surveys -> Confirm Survey Complete (Skip Next Scheduling)`
- Verify `plannedNextSurvey = null`

11. Start-next manual path (when no planned exists)
- `📋 Surveys -> Start Next Survey (Admin only)`
- Verify new survey is `PLANNED` and `plannedSurveyId` is set

12. History and assignment verification
- `🧭 Building Assignment Workflow -> Inspector Mobile Flow -> My Building Assignments`
- `🧭 Building Assignment Workflow -> Inspector Mobile Flow -> My Assignment History`
- `🧭 Building Assignment Workflow -> Admin Portal Flow -> Admin Assignment History`
- Confirm survey metadata is present in assignment/history rows where available

## Survey Lifecycle Requests In Collection

Under `📋 Surveys`:

- `List Survey History`
- `Get Current Active Survey`
- `Get Survey Detail (by ID)`
- `Confirm Survey Complete + Schedule Planned Next (Admin only)`
- `Confirm Survey Complete (Skip Next Scheduling)`
- `Start Next Survey (Admin only)` (creates `PLANNED`)
- `Activate Planned Survey (Admin only)`
- `Complete Survey Fieldwork (Inspector)`
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

- `400` on certificate upload/register usually means fieldwork completion missing.
- `400` on activate usually means no accepted assignment linked to `plannedSurveyId`.
- `400` on confirm-complete usually means one of: fieldwork incomplete, missing building certificate, uncertified doors.
- `403/404` on inspector write endpoints usually means assignment is pending/rejected/removed or survey is non-active.
