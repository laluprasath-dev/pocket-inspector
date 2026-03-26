Pocket Inspector – Backend Epic and Detailed Task List

Epic Overview

Implement a complete backend access-control, assignment, acceptance, inspection workflow, reassignment, history, and reopen system for Pocket Inspector.

The goal is to ensure that:
• only Super Admin can create sites and buildings
• inspectors can work only on assigned buildings
• inspectors must accept assignments before accessing inspection workflow
• Super Admin can assign, reassign, reopen, and track inspections
• backend is fully prepared for both Super Admin Portal and Mobile integration

At the end of backend implementation, the backend developer must provide two separate integration handoff documents: 1. Super Admin Portal API Integration Instructions 2. Mobile API Integration Instructions

⸻

Epic 1 – Role-Based Access Control

Objective

Restrict site and building creation to Super Admin and prevent inspectors from accessing unauthorized resources.

Task 1.1 – Restrict site creation to Super Admin

Description
Update backend authorization so only Super Admin can create sites.

Acceptance Criteria
• inspector role cannot create a site
• unauthorized requests return proper access error
• existing site creation flow works for Super Admin only

Task 1.2 – Restrict building creation to Super Admin

Description
Update backend authorization so only Super Admin can create buildings.

Acceptance Criteria
• inspector role cannot create a building
• unauthorized requests return proper access error
• existing building creation flow works for Super Admin only

Task 1.3 – Restrict building access to assigned inspectors only

Description
Ensure inspectors can access only the buildings assigned to them and only after acceptance.

Acceptance Criteria
• unassigned inspectors cannot access building details
• pending assignments do not allow workflow access
• only accepted assignments allow inspection actions

⸻

Epic 2 – Building and Site Assignment Management

Objective

Allow Super Admin to assign and reassign individual buildings or current site buildings to inspectors.

Task 2.1 – Create single-building assignment endpoint

Description
Create backend endpoint for assigning one building to one inspector.

Acceptance Criteria
• Super Admin can assign a building to an inspector
• assignment is stored with correct status
• inspector receives a pending assignment state

Task 2.2 – Create multi-building assignment endpoint

Description
Create backend endpoint to assign multiple selected building IDs to an inspector.

Acceptance Criteria
• Super Admin can assign multiple buildings in one request
• all selected building IDs are processed correctly
• assignments are created with pending state

Task 2.3 – Support site-level assignment using current building IDs

Description
Allow Super Admin to assign all current buildings under a site by sending the site context / current building IDs.

Acceptance Criteria
• backend supports assigning all current buildings under a site
• only current buildings are assigned
• future buildings added later are not auto-assigned

Task 2.4 – Support reassignment of any building at any time

Description
Allow Super Admin to reassign a building from one inspector to another during any stage of the process.

Acceptance Criteria
• building can be reassigned at any time
• previous inspector access is removed immediately
• new inspector assignment is created correctly

Task 2.5 – Return advisory data when new building is added to an already-used site

Description
When a new building is created under a site with prior assignment context, backend should return enough information for frontend to prompt whether the same inspector should be assigned or a different one should be chosen.

Acceptance Criteria
• backend returns site assignment context for newly added building
• response is sufficient for frontend prompt handling
• no auto-assignment happens by default

⸻

Epic 3 – Assignment Acceptance Flow

Objective

Ensure inspectors must accept assignments before they can access or update inspection workflow.

Task 3.1 – Add pending / accepted / rejected assignment states

Description
Introduce assignment state management for all new assignments.

Acceptance Criteria
• assignment supports pending, accepted, rejected states
• state is stored per building assignment
• status can be queried via API

Task 3.2 – Create assignment acceptance endpoint

Description
Allow inspector to accept an assignment.

Acceptance Criteria
• inspector can accept own pending assignment
• assignment state changes to accepted
• accepted assignment unlocks workflow access

Task 3.3 – Create assignment rejection endpoint

Description
Allow inspector to reject an assignment.

Acceptance Criteria
• inspector can reject own pending assignment
• assignment state changes to rejected
• rejected assignment does not allow workflow access

Task 3.4 – Support grouped acceptance for same-site building assignments

Description
If multiple building assignments belong to the same grouped site invitation, support accepting them together.

Acceptance Criteria
• grouped site assignment can be accepted in one action
• all included buildings move to accepted state together
• grouped rejection flow can also be supported consistently if needed by product flow

Task 3.5 – Restrict workflow actions until acceptance

Description
Inspectors must not create floors, doors, or upload images unless assignment is accepted.

Acceptance Criteria
• pending assignments do not allow inspection actions
• rejected assignments do not allow inspection actions
• only accepted assignments unlock workflow endpoints

⸻

Epic 4 – Inspector Inspection Workflow After Acceptance

Objective

Allow accepted inspectors to complete the full inspection workflow for assigned buildings.

Task 4.1 – Allow floor creation after acceptance

Description
Inspectors with accepted assignments can create floors for assigned buildings.

Acceptance Criteria
• only accepted assigned inspector can create floor
• unauthorized or pending access is blocked

Task 4.2 – Allow floor door creation after acceptance

Description
Inspectors with accepted assignments can create floor doors.

Acceptance Criteria
• only accepted assigned inspector can create floor doors
• unauthorized or pending access is blocked

Task 4.3 – Allow door image upload after acceptance

Description
Inspectors with accepted assignments can upload door images.

Acceptance Criteria
• only accepted assigned inspector can upload images
• unauthorized or pending access is blocked

Task 4.4 – Add door image upload completion marker

Description
Allow inspector to mark a door image upload process as completed.

Acceptance Criteria
• endpoint exists to mark upload completion for a door
• completion state is stored and retrievable

Task 4.5 – Add building inspection completion endpoint

Description
Allow inspector to mark the full building inspection as completed.

Acceptance Criteria
• accepted assigned inspector can mark building as completed
• completion status is stored and visible to Super Admin

⸻

Epic 5 – Reassignment Continuity Logic

Objective

Preserve progress while transferring ownership cleanly during reassignment.

Task 5.1 – Remove old inspector access immediately on reassignment

Description
Once reassignment happens, previous inspector must lose access immediately.

Acceptance Criteria
• old inspector can no longer access or update building
• access removal is enforced across protected endpoints

Task 5.2 – Allow new inspector to continue from current state

Description
New inspector should not restart from scratch; they should continue from latest state.

Acceptance Criteria
• new inspector can view current building status
• existing progress remains intact
• new inspector can continue workflow from current stage

Task 5.3 – Preserve previous work history on reassignment

Description
All previous uploads, updates, timestamps, and actor history must remain available.

Acceptance Criteria
• no existing inspection data is lost during reassignment
• historical actions remain traceable

⸻

Epic 6 – Inspector History APIs

Objective

Provide inspector-side history of assignments and inspection actions.

Task 6.1 – Create inspector assignment history endpoint

Description
Return inspector-specific assignment history.

History should include
• assigned
• accepted
• rejected
• access removed
• reassigned
• completed
• reopened

Acceptance Criteria
• inspector sees only own history
• results are paginated/filterable if needed

Task 6.2 – Include timestamps and actor details in history

Description
Return when the action happened and who performed it.

Acceptance Criteria
• each history record includes timestamp
• each history record includes actor / performed-by information

Task 6.3 – Create inspector active vs pending assignment listing endpoint

Description
Allow mobile to clearly separate pending assignments from accepted active work.

Acceptance Criteria
• pending assignments are listed separately
• accepted assignments are listed separately
• pending items do not expose workflow details

⸻

Epic 7 – Super Admin Activity and History APIs

Objective

Provide complete inspector and inspection activity visibility for Super Admin portal.

Task 7.1 – Create Super Admin activity log endpoint

Description
Return complete activity history for assignments and workflow state changes.

Acceptance Criteria
• log includes assignment, acceptance, rejection, removal, reassignment, completion, reopening
• records include timestamps and actor details

Task 7.2 – Add filtering support for Super Admin history

Description
Support useful filters for admin investigation and review.

Filters should include
• inspector
• site
• building
• status
• date range if feasible

Acceptance Criteria
• Super Admin can query history using supported filters
• response is structured for portal display

⸻

Epic 8 – Reopen Inspection Flow

Objective

Allow Super Admin to reopen completed inspections for correction and resubmission.

Task 8.1 – Create reopen building inspection endpoint

Description
Allow Super Admin to reopen a completed building inspection.

Acceptance Criteria
• only Super Admin can reopen
• completed building can move back to active correction state
• reopen event is logged in history

Task 8.2 – Allow inspector to resubmit after reopen

Description
After reopening, inspector should be able to continue or correct floors, doors, images, and completion state.

Acceptance Criteria
• reopened building becomes available again to assigned inspector
• inspector can rework and resubmit required data

⸻

Epic 9 – API Response and Validation Support for Frontend Integration

Objective

Prepare backend responses clearly so Super Admin portal and mobile teams can integrate without ambiguity.

Task 9.1 – Standardize assignment status response structure

Description
Ensure assignment APIs return clear and consistent status values and metadata.

Acceptance Criteria
• responses include assignment state
• responses include building/site context where needed
• responses support frontend grouping logic

Task 9.2 – Return grouped invitation data for same-site assignments

Description
Provide enough metadata so mobile can show one grouped invitation for multiple assigned buildings from the same site.

Acceptance Criteria
• response includes grouping reference for same-site assignment sets
• mobile can identify single-building vs grouped invitation

Task 9.3 – Return advisory context for newly added building in existing site

Description
Provide data to help Super Admin frontend decide whether to assign the same inspector or another person for a newly added building.

Acceptance Criteria
• response identifies existing site assignment context
• frontend can use it for prompt or warning UX

⸻

Epic 10 – Backend QA, Validation, and Completion Handoff

Objective

Complete backend validation before handing integration guidance to other teams.

Task 10.1 – Verify all protected endpoints by role and state

Description
Test all relevant endpoints against role restrictions and assignment states.

Validation areas
• inspector cannot create site/building
• unassigned inspector cannot access building
• pending inspector cannot perform workflow actions
• accepted inspector can complete workflow
• reassignment removes old access
• reopen flow works correctly

Task 10.2 – Verify history and state transitions end to end

Description
Test complete lifecycle from assignment to completion and reopen.

Acceptance Criteria
• all transitions are logged correctly
• actor/timestamp history is accurate
• reassignment continuity works

Task 10.3 – Prepare backend completion summary

Description
Once backend work is completed, backend developer must prepare a summary of implemented APIs, payloads, states, validations, and integration notes.

Acceptance Criteria
• summary is ready before frontend/mobile handoff
• includes endpoint list and behavior notes

⸻

Final Integration Handoff Tasks

Task 11 – Super Admin Portal API Integration Instructions

Description
After backend completion, create a dedicated integration document for the Super Admin Portal team.

Document should include
• endpoint list
• request/response payloads
• role/access rules
• assignment flows
• acceptance/reassignment/reopen behavior
• history and filter support
• frontend responsibilities and expected UI handling
• advisory/prompt-related backend response notes

Task 12 – Mobile API Integration Instructions

Description
After backend completion, create a dedicated integration document for the Mobile team.

Document should include
• endpoint list
• request/response payloads
• pending vs accepted logic
• grouped invitation logic for same-site assignments
• acceptance/rejection flow
• workflow access only after acceptance
• inspection flow endpoints for floors, doors, images, completion
• reopen/resubmission behavior
• history listing behavior for inspector app

⸻

Definition of Done

This backend phase is considered complete only when:
• all backend restrictions and workflows are implemented
• reassignment and reopen flows are working correctly
• history tracking is complete
• role and state validation is complete
• backend developer has prepared a completion summary
• Super Admin Portal API Integration Instructions are documented
• Mobile API Integration Instructions are documented
